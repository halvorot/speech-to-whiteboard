export type ActionType =
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'create_edge'
  | 'delete_edge';

export type NodeType =
  | 'box'
  | 'circle'
  | 'cloud'
  | 'diamond'
  | 'hexagon'
  | 'person'
  | 'process'
  | 'data'
  | 'frame'
  // Legacy types
  | 'database'
  | 'server'
  | 'client'
  | 'storage'
  | 'network'
  | 'unknown';

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
}

export interface SketchResponse {
  actions: SketchAction[];
}
