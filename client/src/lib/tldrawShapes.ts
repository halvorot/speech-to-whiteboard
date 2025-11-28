import { type Editor, type TLDefaultColorStyle } from 'tldraw';
import type { LayoutNode, LayoutEdge } from './graphLayout';
import { getShapeId, getArrowId } from './graphLayout';
import { getNodeColor } from './DiagramNodeShape';

// Derive frame color from label/description keywords
function getFrameColor(label: string, description: string): TLDefaultColorStyle {
  const text = (label + ' ' + description).toLowerCase();

  // Infrastructure / Backend
  if (text.match(/backend|server|api|infrastructure|service/)) return 'blue';

  // Frontend / UI
  if (text.match(/frontend|client|ui|user|interface|web/)) return 'light-blue';

  // Data / Storage
  if (text.match(/data|database|storage|cache|persistence/)) return 'green';

  // Network / Communication
  if (text.match(/network|gateway|load.?balance|cdn|proxy/)) return 'light-violet';

  // Security / Auth
  if (text.match(/security|auth|permission|access/)) return 'red';

  // Business / Logic
  if (text.match(/business|logic|workflow|process/)) return 'orange';

  // External / Third-party
  if (text.match(/external|third.?party|integration|vendor/)) return 'yellow';

  // Default
  return 'grey';
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
  // Clear existing shapes
  const existingShapes = editor.getCurrentPageShapes();
  if (existingShapes.length > 0) {
    editor.deleteShapes(existingShapes.map((s) => s.id));
  }

  // Create frames first (native tldraw frames)
  const frames = nodes.filter((n) => n.type === 'frame');
  const regularNodes = nodes.filter((n) => n.type !== 'frame');

  // Build frame color map for child nodes
  const frameColors = new Map<string, TLDefaultColorStyle>();
  frames.forEach((frame) => {
    const frameColor = getFrameColor(frame.label, frame.description);
    frameColors.set(frame.id, frameColor);
  });

  frames.forEach((frame) => {
    const shapeId = getShapeId(frame.id);
    const frameColor = frameColors.get(frame.id)!;

    try {
      // Create native frame for structure
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

      // Add colored background rectangle inside frame
      editor.createShape({
        type: 'geo',
        id: `${shapeId}_bg` as any,
        x: 0,
        y: 0,
        parentId: shapeId,
        props: {
          w: frame.width,
          h: frame.height,
          geo: 'rectangle',
          color: frameColor,
          fill: 'semi',
          dash: 'draw',
          size: 's',
        },
      });
    } catch (error) {
      console.error(`Failed to create frame for node ${frame.id}:`, error);
    }
  });

  // Create regular nodes with parent-child relationships
  regularNodes.forEach((node) => {
    const shapeId = getShapeId(node.id);
    const parentId = node.parentId ? getShapeId(node.parentId) : undefined;

    // Always use semantic color based on node type
    const nodeColor = getNodeColor(node.type);

    try {
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
    } catch (error) {
      console.error(`Failed to create shape for node ${node.id}:`, error);
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

        // Create arrow with coordinate-based terminals
        editor.createShape({
          type: 'arrow',
          id: arrowId,
          x: startX,
          y: startY,
          props: {
            start: { x: 0, y: 0 },
            end: { x: endX - startX, y: endY - startY },
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
