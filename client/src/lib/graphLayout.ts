import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { TLShapeId } from 'tldraw';
import type { SketchAction, NodeType, GraphSyncMessage } from '../types/sketch';

const elk = new ELK();

export interface GraphNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  parentId?: string;
  color?: string;
  position?: string;
  relativeTo?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  bidirectional?: boolean;
}

export interface GraphState {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

export interface LayoutNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  color?: string;
  position?: string;
  relativeTo?: string;
}

export interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  bidirectional?: boolean;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

// Node dimensions
const NODE_WIDTH = 200;
const NODE_HEIGHT = 100;
const TEXT_WIDTH = 300;
const TEXT_HEIGHT = 100;
const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 150;

// Get dimensions based on node type
function getNodeDimensions(type: NodeType): { width: number; height: number } {
  if (type === 'text') return { width: TEXT_WIDTH, height: TEXT_HEIGHT };
  if (type === 'note') return { width: NOTE_WIDTH, height: NOTE_HEIGHT };
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

export function createGraphState(): GraphState {
  return {
    nodes: new Map(),
    edges: new Map(),
  };
}

export function applyAction(state: GraphState, action: SketchAction): boolean {
  switch (action.action) {
    case 'create_node':
      if (action.id && action.label && action.type) {
        state.nodes.set(action.id, {
          id: action.id,
          label: action.label,
          description: action.description || '',
          type: action.type,
          parentId: action.parent_id,
          color: action.color,
          position: action.position,
          relativeTo: action.relative_to,
        });
        return true;
      }
      return false;

    case 'update_node':
      if (action.id && state.nodes.has(action.id)) {
        const existing = state.nodes.get(action.id)!;
        state.nodes.set(action.id, {
          id: action.id,
          label: action.label || existing.label,
          description: action.description !== undefined ? action.description : existing.description,
          type: action.type || existing.type,
          parentId: action.parent_id !== undefined ? action.parent_id : existing.parentId,
          color: action.color !== undefined ? action.color : existing.color,
          position: action.position !== undefined ? action.position : existing.position,
          relativeTo: action.relative_to !== undefined ? action.relative_to : existing.relativeTo,
        });
        return true;
      }
      return false;

    case 'delete_node':
      if (action.id) {
        state.nodes.delete(action.id);
        // Remove edges connected to this node
        for (const [edgeId, edge] of state.edges) {
          if (edge.sourceId === action.id || edge.targetId === action.id) {
            state.edges.delete(edgeId);
          }
        }
        // Remove child nodes if deleting a frame
        for (const [nodeId, node] of state.nodes) {
          if (node.parentId === action.id) {
            state.nodes.delete(nodeId);
          }
        }
        return true;
      }
      return false;

    case 'create_edge':
      if (action.source_id && action.target_id) {
        const edgeId = action.id || `${action.source_id}->${action.target_id}`;
        state.edges.set(edgeId, {
          id: edgeId,
          sourceId: action.source_id,
          targetId: action.target_id,
          bidirectional: action.bidirectional || false,
        });
        return true;
      }
      return false;

    case 'delete_edge':
      // Support deletion by ID or by source/target
      if (action.id) {
        state.edges.delete(action.id);
        return true;
      } else if (action.source_id && action.target_id) {
        // Find and delete edge matching source and target
        for (const [edgeId, edge] of state.edges) {
          if (edge.sourceId === action.source_id && edge.targetId === action.target_id) {
            state.edges.delete(edgeId);
            return true;
          }
        }
        return false;
      }
      return false;

    default:
      return false;
  }
}

export async function layoutGraph(state: GraphState): Promise<LayoutResult> {
  const nodesArray = Array.from(state.nodes.values());
  const frames = nodesArray.filter((n) => n.type === 'frame');

  // Separate positioned nodes (text/notes with position hints) from regular nodes
  const positionedNodes = nodesArray.filter((n) =>
    n.type !== 'frame' && n.position
  );
  const regularNodes = nodesArray.filter((n) =>
    n.type !== 'frame' && !n.position
  );

  // Build ELK nodes with hierarchy (frames contain their children)
  const elkFrames: ElkNode[] = frames.map((frame) => {
    const children = regularNodes.filter((n) => n.parentId === frame.id);
    return {
      id: frame.id,
      width: NODE_WIDTH * 2,
      height: NODE_HEIGHT * 2,
      labels: [{ text: frame.label }],
      layoutOptions: {
        'elk.padding': '[top=60,left=20,bottom=20,right=20]',
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '40',
      },
      children: children.map((n) => {
        const dims = getNodeDimensions(n.type);
        return {
          id: n.id,
          width: dims.width,
          height: dims.height,
          labels: [{ text: n.label }],
        };
      }),
    };
  });

  // Top-level nodes (not in any frame)
  const topLevelNodes: ElkNode[] = regularNodes
    .filter((n) => !n.parentId)
    .map((n) => {
      const dims = getNodeDimensions(n.type);
      return {
        id: n.id,
        width: dims.width,
        height: dims.height,
        labels: [{ text: n.label }],
      };
    });

  // Only filter edges to/from frames (frames are containers, not nodes)
  // But ALLOW cross-hierarchy edges (outside → inside frame)
  const frameIds = new Set(frames.map((f) => f.id));

  const elkEdges = Array.from(state.edges.values())
    .filter((edge) => {
      // Don't allow edges to/from frames themselves
      return !frameIds.has(edge.sourceId) && !frameIds.has(edge.targetId);
    })
    .map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
    }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      // SEPARATE_CHILDREN properly handles cross-hierarchy edges
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      // Allow edges to cross hierarchy boundaries
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: [...elkFrames, ...topLevelNodes],
    edges: elkEdges,
  };

  // Run ELK layout
  const layouted = await elk.layout(graph);

  // Extract all nodes (frames and children) with positions
  const nodes: LayoutNode[] = [];

  function extractNodes(parent: ElkNode) {
    for (const node of parent.children || []) {
      const original = state.nodes.get(node.id)!;

      // Use ELK's positions directly - they're already relative to parent
      nodes.push({
        id: node.id,
        label: original.label,
        description: original.description,
        type: original.type,
        x: node.x || 0,
        y: node.y || 0,
        width: node.width || NODE_WIDTH,
        height: node.height || NODE_HEIGHT,
        parentId: original.parentId,
        color: original.color,
      });

      // Recursively extract children (they'll have positions relative to this node)
      if (node.children && node.children.length > 0) {
        extractNodes(node);
      }
    }
  }

  extractNodes(layouted);

  // Now position the positioned nodes based on their hints
  for (const posNode of positionedNodes) {
    const dims = getNodeDimensions(posNode.type);
    const position = calculatePosition(posNode, nodes, dims);

    nodes.push({
      id: posNode.id,
      label: posNode.label,
      description: posNode.description,
      type: posNode.type,
      x: position.x,
      y: position.y,
      width: dims.width,
      height: dims.height,
      parentId: posNode.parentId,
      color: posNode.color,
      position: posNode.position,
      relativeTo: posNode.relativeTo,
    });
  }

  const edges: LayoutEdge[] = Array.from(state.edges.values()).map((edge) => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    bidirectional: edge.bidirectional,
  }));

  return { nodes, edges };
}

// Calculate position for a positioned node
function calculatePosition(
  node: GraphNode,
  existingNodes: LayoutNode[],
  dims: { width: number; height: number }
): { x: number; y: number } {
  const GAP = 50; // Gap between nodes

  // If relative to a specific node
  if (node.relativeTo) {
    const targetNode = existingNodes.find((n) => n.id === node.relativeTo);
    if (targetNode) {
      return calculateRelativePosition(node.position || 'right', targetNode, dims, GAP);
    }
  }

  // Relative to entire canvas/drawing
  return calculateCanvasPosition(node.position || 'right', existingNodes, dims, GAP);
}

// Calculate position relative to a specific node
function calculateRelativePosition(
  position: string,
  targetNode: LayoutNode,
  dims: { width: number; height: number },
  gap: number
): { x: number; y: number } {
  const centerX = targetNode.x + targetNode.width / 2;
  const centerY = targetNode.y + targetNode.height / 2;

  switch (position.toLowerCase()) {
    case 'above':
    case 'top':
      return {
        x: centerX - dims.width / 2,
        y: targetNode.y - dims.height - gap,
      };
    case 'below':
    case 'bottom':
      return {
        x: centerX - dims.width / 2,
        y: targetNode.y + targetNode.height + gap,
      };
    case 'left':
      return {
        x: targetNode.x - dims.width - gap,
        y: centerY - dims.height / 2,
      };
    case 'right':
      return {
        x: targetNode.x + targetNode.width + gap,
        y: centerY - dims.height / 2,
      };
    case 'top-left':
      return {
        x: targetNode.x - dims.width - gap,
        y: targetNode.y - dims.height - gap,
      };
    case 'top-right':
      return {
        x: targetNode.x + targetNode.width + gap,
        y: targetNode.y - dims.height - gap,
      };
    case 'bottom-left':
      return {
        x: targetNode.x - dims.width - gap,
        y: targetNode.y + targetNode.height + gap,
      };
    case 'bottom-right':
      return {
        x: targetNode.x + targetNode.width + gap,
        y: targetNode.y + targetNode.height + gap,
      };
    default:
      // Default to right
      return {
        x: targetNode.x + targetNode.width + gap,
        y: centerY - dims.height / 2,
      };
  }
}

// Calculate position relative to entire canvas
function calculateCanvasPosition(
  position: string,
  existingNodes: LayoutNode[],
  dims: { width: number; height: number },
  gap: number
): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: 0, y: 0 };
  }

  // Calculate bounding box of existing nodes
  const minX = Math.min(...existingNodes.map((n) => n.x));
  const maxX = Math.max(...existingNodes.map((n) => n.x + n.width));
  const minY = Math.min(...existingNodes.map((n) => n.y));
  const maxY = Math.max(...existingNodes.map((n) => n.y + n.height));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  switch (position.toLowerCase()) {
    case 'above':
    case 'top':
      return {
        x: centerX - dims.width / 2,
        y: minY - dims.height - gap,
      };
    case 'below':
    case 'bottom':
      return {
        x: centerX - dims.width / 2,
        y: maxY + gap,
      };
    case 'left':
      return {
        x: minX - dims.width - gap,
        y: centerY - dims.height / 2,
      };
    case 'right':
      return {
        x: maxX + gap,
        y: centerY - dims.height / 2,
      };
    case 'top-left':
      return {
        x: minX - dims.width - gap,
        y: minY - dims.height - gap,
      };
    case 'top-right':
      return {
        x: maxX + gap,
        y: minY - dims.height - gap,
      };
    case 'bottom-left':
      return {
        x: minX - dims.width - gap,
        y: maxY + gap,
      };
    case 'bottom-right':
      return {
        x: maxX + gap,
        y: maxY + gap,
      };
    default:
      // Default to right of drawing
      return {
        x: maxX + gap,
        y: centerY - dims.height / 2,
      };
  }
}

// Helper to get tldraw shape ID from node ID
export function getShapeId(nodeId: string): TLShapeId {
  return `shape:${nodeId}` as TLShapeId;
}

export function getArrowId(edgeId: string): TLShapeId {
  return `shape:arrow_${edgeId}` as TLShapeId;
}

// Serialize graph state for sync to backend
export function serializeGraphState(state: GraphState): GraphSyncMessage {
  return {
    type: 'graph_sync',
    nodes: Array.from(state.nodes.values()).map((node) => ({
      id: node.id,
      label: node.label,
      description: node.description,
      type: node.type,
      parentId: node.parentId,
      color: node.color,
      position: node.position,
      relativeTo: node.relativeTo,
    })),
    edges: Array.from(state.edges.values()).map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      bidirectional: edge.bidirectional,
    })),
  };
}
