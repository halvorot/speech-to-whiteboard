export type ActionType =
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'create_edge'
  | 'delete_edge';

export type NodeType =
  // Semantic types (infrastructure & data)
  | 'database'
  | 'server'
  | 'client'
  | 'storage'
  | 'network'
  // Shape-based types
  | 'box'
  | 'circle'
  | 'cloud'
  | 'diamond'
  | 'hexagon'
  | 'person'
  | 'process'
  | 'data'
  | 'frame'
  | 'text'
  | 'note';

export interface SketchAction {
  action: ActionType;
  id?: string;
  label?: string;
  description?: string;
  type?: NodeType;
  source_id?: string;
  target_id?: string;
  bidirectional?: boolean;
  parent_id?: string;
  color?: string;
  position?: string;
  relative_to?: string;
  opacity?: number;
}

export interface SketchResponse {
  actions: SketchAction[];
}

// Graph sync message types
export interface SerializedGraphNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  parentId?: string;
  color?: string;
  position?: string;
  relativeTo?: string;
  opacity?: number;
}

export interface SerializedGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  bidirectional?: boolean;
}

export interface GraphSyncMessage {
  type: 'graph_sync';
  nodes: SerializedGraphNode[];
  edges: SerializedGraphEdge[];
}
