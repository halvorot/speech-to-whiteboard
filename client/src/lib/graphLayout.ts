import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { TLShapeId } from 'tldraw';
import type { SketchAction, NodeType } from '../types/sketch';

const elk = new ELK();

export interface GraphNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
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
  // Convert to ELK format
  const elkNodes = Array.from(state.nodes.values()).map((node) => ({
    id: node.id,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    labels: [{ text: node.label }],
  }));

  const elkEdges = Array.from(state.edges.values()).map((edge) => ({
    id: edge.id,
    sources: [edge.sourceId],
    targets: [edge.targetId],
  }));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  // Run ELK layout
  const layouted = await elk.layout(graph);

  // Convert back to our format
  const nodes: LayoutNode[] = (layouted.children || []).map((node) => {
    const original = state.nodes.get(node.id)!;
    return {
      id: node.id,
      label: original.label,
      description: original.description,
      type: original.type,
      x: node.x || 0,
      y: node.y || 0,
      width: node.width || NODE_WIDTH,
      height: node.height || NODE_HEIGHT,
    };
  });

  const edges: LayoutEdge[] = Array.from(state.edges.values()).map((edge) => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    bidirectional: edge.bidirectional,
  }));

  return { nodes, edges };
}

// Helper to get tldraw shape ID from node ID
export function getShapeId(nodeId: string): TLShapeId {
  return `shape:${nodeId}` as TLShapeId;
}

export function getArrowId(edgeId: string): TLShapeId {
  return `shape:arrow_${edgeId}` as TLShapeId;
}
