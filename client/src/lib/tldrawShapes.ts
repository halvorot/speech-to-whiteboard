import { type Editor, toRichText } from 'tldraw';
import type { LayoutNode, LayoutEdge } from './graphLayout';
import { getShapeId, getArrowId } from './graphLayout';
import { getNodeColor } from './DiagramNodeShape';

// Check if a line segment intersects with a rectangle
function lineIntersectsRect(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  // Minimal padding - only bend for actual intersections
  const padding = 5;
  const rectX = rect.x - padding;
  const rectY = rect.y - padding;
  const rectW = rect.width + padding * 2;
  const rectH = rect.height + padding * 2;

  // Check if either endpoint is inside the rectangle
  const startInside = lineStart.x >= rectX && lineStart.x <= rectX + rectW &&
                       lineStart.y >= rectY && lineStart.y <= rectY + rectH;
  const endInside = lineEnd.x >= rectX && lineEnd.x <= rectX + rectW &&
                     lineEnd.y >= rectY && lineEnd.y <= rectY + rectH;

  if (startInside || endInside) return true;

  // Check if line intersects any of the four edges of the rectangle
  const edges = [
    { x1: rectX, y1: rectY, x2: rectX + rectW, y2: rectY }, // top
    { x1: rectX + rectW, y1: rectY, x2: rectX + rectW, y2: rectY + rectH }, // right
    { x1: rectX, y1: rectY + rectH, x2: rectX + rectW, y2: rectY + rectH }, // bottom
    { x1: rectX, y1: rectY, x2: rectX, y2: rectY + rectH }, // left
  ];

  for (const edge of edges) {
    if (lineSegmentsIntersect(lineStart, lineEnd, { x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 })) {
      return true;
    }
  }

  return false;
}

// Check if two line segments intersect
function lineSegmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
  if (det === 0) return false; // parallel

  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;

  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// Calculate optimal bend value to avoid colliding nodes
function calculateOptimalBend(
  sourceNode: LayoutNode,
  targetNode: LayoutNode,
  allNodes: LayoutNode[]
): number {
  const sourceCenterX = sourceNode.x + sourceNode.width / 2;
  const sourceCenterY = sourceNode.y + sourceNode.height / 2;
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const targetCenterY = targetNode.y + targetNode.height / 2;

  const lineStart = { x: sourceCenterX, y: sourceCenterY };
  const lineEnd = { x: targetCenterX, y: targetCenterY };

  // Calculate arrow length
  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;
  const arrowLength = Math.sqrt(dx * dx + dy * dy);

  // Only allow bending for longer arrows (min 200px)
  const MIN_ARROW_LENGTH_FOR_BENDING = 200;
  if (arrowLength < MIN_ARROW_LENGTH_FOR_BENDING) {
    return 0; // Too short, keep straight
  }

  // Check for collisions with other nodes (excluding source and target)
  const collidingNodes = allNodes.filter(
    (node) => node.id !== sourceNode.id && node.id !== targetNode.id &&
              lineIntersectsRect(lineStart, lineEnd, node)
  );

  if (collidingNodes.length === 0) {
    return 0; // No collision, straight arrow
  }

  // Find the node closest to the midpoint of the arrow
  const midX = (sourceCenterX + targetCenterX) / 2;
  const midY = (sourceCenterY + targetCenterY) / 2;

  let closestDist = Infinity;
  let closestNode = collidingNodes[0];

  for (const node of collidingNodes) {
    const nodeCenterX = node.x + node.width / 2;
    const nodeCenterY = node.y + node.height / 2;
    const dist = Math.sqrt((nodeCenterX - midX) ** 2 + (nodeCenterY - midY) ** 2);
    if (dist < closestDist) {
      closestDist = dist;
      closestNode = node;
    }
  }

  // Calculate which side to bend (perpendicular direction)
  const nodeCenterX = closestNode.x + closestNode.width / 2;
  const nodeCenterY = closestNode.y + closestNode.height / 2;

  // Cross product to determine which side the node is on
  const cross = dx * (nodeCenterY - sourceCenterY) - dy * (nodeCenterX - sourceCenterX);

  // Bend magnitude: smaller and capped to prevent circle-like bends
  // Use 30% of node size with max of 60px
  const baseBend = Math.max(closestNode.width, closestNode.height) * 0.3;
  const bendMagnitude = Math.min(baseBend, 60);

  // Bend direction: opposite side of the colliding node
  return cross > 0 ? -bendMagnitude : bendMagnitude;
}

// Calculate arrow endpoints on shape edges
export function calculateEdgePoints(
  sourceNode: LayoutNode,
  targetNode: LayoutNode
): { startX: number; startY: number; endX: number; endY: number } {
  const sourceCenterX = sourceNode.x + sourceNode.width / 2;
  const sourceCenterY = sourceNode.y + sourceNode.height / 2;
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const targetCenterY = targetNode.y + targetNode.height / 2;

  // Direction vector
  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    return { startX: sourceCenterX, startY: sourceCenterY, endX: targetCenterX, endY: targetCenterY };
  }

  // Normalized direction
  const ndx = dx / distance;
  const ndy = dy / distance;

  // Padding from edges
  const padding = 15;

  // Calculate exit point from source shape
  const sourceHalfW = sourceNode.width / 2 - padding;
  const sourceHalfH = sourceNode.height / 2 - padding;

  let startX: number;
  let startY: number;

  // Determine which edge to exit from based on angle
  if (Math.abs(ndx) > Math.abs(ndy)) {
    // Exit left or right edge
    startX = sourceCenterX + (ndx > 0 ? sourceHalfW : -sourceHalfW);
    startY = sourceCenterY + (startX - sourceCenterX) * (ndy / ndx);
  } else {
    // Exit top or bottom edge
    startY = sourceCenterY + (ndy > 0 ? sourceHalfH : -sourceHalfH);
    startX = sourceCenterX + (startY - sourceCenterY) * (ndx / ndy);
  }

  // Calculate entry point to target shape
  const targetHalfW = targetNode.width / 2 - padding;
  const targetHalfH = targetNode.height / 2 - padding;

  let endX: number;
  let endY: number;

  // Determine which edge to enter from based on angle
  if (Math.abs(ndx) > Math.abs(ndy)) {
    // Enter left or right edge
    endX = targetCenterX - (ndx > 0 ? targetHalfW : -targetHalfW);
    endY = targetCenterY - (endX - targetCenterX) * (ndy / ndx);
  } else {
    // Enter top or bottom edge
    endY = targetCenterY - (ndy > 0 ? targetHalfH : -targetHalfH);
    endX = targetCenterX - (endY - targetCenterY) * (ndx / ndy);
  }

  return { startX, startY, endX, endY };
}

export function renderLayout(editor: Editor, nodes: LayoutNode[], edges: LayoutEdge[]) {
  // Get existing shapes
  const existingShapes = editor.getCurrentPageShapes();
  const existingShapeIds = new Set(existingShapes.map((s) => s.id));

  // Get IDs of nodes we're about to render
  const newNodeIds = new Set(nodes.map((n) => getShapeId(n.id)));
  const newEdgeIds = new Set(edges.map((e) => getArrowId(e.id)));

  // Delete shapes that are no longer in the graph
  const shapesToDelete = existingShapes.filter((s) => {
    if (s.type === 'arrow') {
      return !newEdgeIds.has(s.id);
    } else if (s.type === 'diagram-node' || s.type === 'text' || s.type === 'note' || s.type === 'frame') {
      return !newNodeIds.has(s.id);
    }
    return false;
  });

  if (shapesToDelete.length > 0) {
    editor.deleteShapes(shapesToDelete.map((s) => s.id));
  }

  // Create or update frames first (simple native frames)
  const frames = nodes.filter((n) => n.type === 'frame');
  const regularNodes = nodes.filter((n) => n.type !== 'frame');

  frames.forEach((frame) => {
    const shapeId = getShapeId(frame.id);

    try {
      if (existingShapeIds.has(shapeId)) {
        // Update existing frame
        editor.updateShape({
          id: shapeId,
          type: 'frame',
          x: frame.x,
          y: frame.y,
          props: {
            w: frame.width,
            h: frame.height,
            name: frame.label,
          },
        });
      } else {
        // Create new frame
        editor.createShape({
          type: 'frame',
          id: shapeId,
          x: frame.x,
          y: frame.y,
          props: {
            w: frame.width,
            h: frame.height,
            name: frame.label,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to create/update frame for node ${frame.id}:`, error);
    }
  });

  // Create regular nodes with parent-child relationships
  regularNodes.forEach((node) => {
    const shapeId = getShapeId(node.id);
    const parentId = node.parentId ? getShapeId(node.parentId) : undefined;

    try {
      const exists = existingShapeIds.has(shapeId);

      // Handle text boxes (native tldraw text shape)
      if (node.type === 'text') {
        const text = node.description ? `${node.label}\n\n${node.description}` : node.label;
        const existingShape = exists ? editor.getShape(shapeId) : null;

        if (exists && existingShape) {
          // Update content and parent
          editor.updateShape({
            id: shapeId,
            type: 'text',
            x: node.x,
            y: node.y,
            props: {
              richText: toRichText(text),
              w: node.width,
            },
            parentId, // Update parent for frame moves
          });
        } else {
          // Create new text shape
          editor.createShape({
            type: 'text',
            id: shapeId,
            x: node.x,
            y: node.y,
            props: {
              richText: toRichText(text),
              w: node.width,
              scale: 1.2,
              autoSize: false,
            },
            parentId,
          });
        }
      }
      // Handle sticky notes (native tldraw note shape)
      else if (node.type === 'note') {
        const text = node.description ? `${node.label}\n\n${node.description}` : node.label;
        const noteColor = node.color || 'yellow';
        const existingShape = exists ? editor.getShape(shapeId) : null;

        if (exists && existingShape) {
          // Update content and parent
          editor.updateShape({
            id: shapeId,
            type: 'note',
            x: node.x,
            y: node.y,
            props: {
              richText: toRichText(text),
              color: noteColor,
            },
            parentId, // Update parent for frame moves
          });
        } else {
          // Create new note shape
          editor.createShape({
            type: 'note',
            id: shapeId,
            x: node.x,
            y: node.y,
            props: {
              richText: toRichText(text),
              color: noteColor,
            },
            parentId,
          });
        }
      }
      // Handle regular diagram nodes
      else {
        const nodeColor = getNodeColor(node.type);

        if (exists) {
          // Update existing node (including parentId for frame moves)
          editor.updateShape({
            id: shapeId,
            type: 'diagram-node',
            x: node.x,
            y: node.y,
            props: {
              w: node.width,
              h: node.height,
              color: nodeColor,
              nodeType: node.type,
              label: node.label,
              description: node.description || '',
            },
            parentId, // IMPORTANT: Update parent when node moves into/out of frame
          });
        } else {
          // Create new node
          editor.createShape({
            type: 'diagram-node',
            id: shapeId,
            x: node.x,
            y: node.y,
            props: {
              w: node.width,
              h: node.height,
              color: nodeColor,
              nodeType: node.type,
              label: node.label,
              description: node.description || '',
            },
            parentId,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to create/update shape for node ${node.id}:`, error);
    }
  });

  // Create arrows and bind them to shapes
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.sourceId);
    const targetNode = nodes.find((n) => n.id === edge.targetId);

    if (sourceNode && targetNode) {
      try {
        const sourceShapeId = getShapeId(sourceNode.id);
        const targetShapeId = getShapeId(targetNode.id);
        const arrowId = getArrowId(edge.id);

        // Calculate initial positions
        const { startX, startY, endX, endY } = calculateEdgePoints(sourceNode, targetNode);

        // Calculate optimal bend to avoid collisions
        const bend = calculateOptimalBend(sourceNode, targetNode, nodes);

        // Create arrow with coordinate-based terminals and bend
        editor.createShape({
          type: 'arrow',
          id: arrowId,
          x: startX,
          y: startY,
          props: {
            start: { x: 0, y: 0 },
            end: { x: endX - startX, y: endY - startY },
            bend,
            arrowheadStart: edge.bidirectional ? 'arrow' : 'none',
            arrowheadEnd: 'arrow',
          },
        });

        // Bind arrow start to source shape (tldraw v4 API)
        editor.createBinding({
          type: 'arrow',
          fromId: arrowId,
          toId: sourceShapeId,
          props: {
            terminal: 'start',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        });

        // Bind arrow end to target shape
        editor.createBinding({
          type: 'arrow',
          fromId: arrowId,
          toId: targetShapeId,
          props: {
            terminal: 'end',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        });
      } catch (error) {
        console.error(`Failed to create arrow for edge ${edge.id}:`, error);
        console.error('Error details:', error);
      }
    }
  }

  // Zoom to fit
  setTimeout(() => {
    editor.zoomToFit({ animation: { duration: 300 } });
  }, 100);
}
