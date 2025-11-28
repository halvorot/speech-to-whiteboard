import { describe, it, expect } from 'vitest';
import { createGraphState, applyAction, type GraphState, type SketchAction } from './graphLayout';

describe('graphLayout', () => {
  describe('createGraphState', () => {
    it('creates empty state', () => {
      // Arrange & Act
      const state = createGraphState();

      // Assert
      expect(state.nodes.size).toBe(0);
      expect(state.edges.size).toBe(0);
    });
  });

  describe('applyAction - create_node', () => {
    it('adds new node to state', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_node',
        id: 'node1',
        label: 'Test Node',
        description: 'Description',
        type: 'server',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.size).toBe(1);
      expect(state.nodes.get('node1')?.label).toBe('Test Node');
      expect(state.nodes.get('node1')?.type).toBe('server');
    });

    it('fails without required fields', () => {
      // Arrange
      const state = createGraphState();
      const actionNoId: SketchAction = { action: 'create_node', label: 'Test', type: 'server' };
      const actionNoLabel: SketchAction = { action: 'create_node', id: 'node1', type: 'server' };
      const actionNoType: SketchAction = { action: 'create_node', id: 'node1', label: 'Test' };

      // Act & Assert
      expect(applyAction(state, actionNoId)).toBe(false);
      expect(applyAction(state, actionNoLabel)).toBe(false);
      expect(applyAction(state, actionNoType)).toBe(false);
      expect(state.nodes.size).toBe(0);
    });
  });

  describe('applyAction - update_node', () => {
    it('modifies existing node', () => {
      // Arrange
      const state = createGraphState();
      state.nodes.set('node1', { id: 'node1', label: 'Original', description: 'Desc', type: 'server' });
      const action: SketchAction = {
        action: 'update_node',
        id: 'node1',
        label: 'Updated',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.get('node1')?.label).toBe('Updated');
      expect(state.nodes.get('node1')?.description).toBe('Desc');
      expect(state.nodes.get('node1')?.type).toBe('server');
    });

    it('fails for non-existent node', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = { action: 'update_node', id: 'node1', label: 'Test' };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('applyAction - delete_node', () => {
    it('removes node and connected edges', () => {
      // Arrange
      const state = createGraphState();
      state.nodes.set('node1', { id: 'node1', label: 'Node 1', description: '', type: 'server' });
      state.nodes.set('node2', { id: 'node2', label: 'Node 2', description: '', type: 'client' });
      state.edges.set('edge1', { id: 'edge1', sourceId: 'node1', targetId: 'node2' });
      state.edges.set('edge2', { id: 'edge2', sourceId: 'node2', targetId: 'node1' });
      const action: SketchAction = { action: 'delete_node', id: 'node1' };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.size).toBe(1);
      expect(state.edges.size).toBe(0);
    });
  });

  describe('applyAction - create_edge', () => {
    it('adds edge between nodes', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_edge',
        source_id: 'node1',
        target_id: 'node2',
        bidirectional: false,
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.edges.size).toBe(1);
      const edge = Array.from(state.edges.values())[0];
      expect(edge.sourceId).toBe('node1');
      expect(edge.targetId).toBe('node2');
      expect(edge.bidirectional).toBe(false);
    });

    it('supports bidirectional edges', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_edge',
        source_id: 'node1',
        target_id: 'node2',
        bidirectional: true,
      };

      // Act
      applyAction(state, action);

      // Assert
      const edge = Array.from(state.edges.values())[0];
      expect(edge.bidirectional).toBe(true);
    });

    it('fails without source and target', () => {
      // Arrange
      const state = createGraphState();
      const actionNoSource: SketchAction = { action: 'create_edge', target_id: 'node2' };
      const actionNoTarget: SketchAction = { action: 'create_edge', source_id: 'node1' };

      // Act & Assert
      expect(applyAction(state, actionNoSource)).toBe(false);
      expect(applyAction(state, actionNoTarget)).toBe(false);
      expect(state.edges.size).toBe(0);
    });
  });

  describe('applyAction - delete_edge', () => {
    it('removes edge by source and target', () => {
      // Arrange
      const state = createGraphState();
      state.edges.set('edge1', { id: 'edge1', sourceId: 'node1', targetId: 'node2' });
      state.edges.set('edge2', { id: 'edge2', sourceId: 'node2', targetId: 'node3' });
      const action: SketchAction = {
        action: 'delete_edge',
        source_id: 'node1',
        target_id: 'node2',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.edges.size).toBe(1);
      const remainingEdge = Array.from(state.edges.values())[0];
      expect(remainingEdge.sourceId).toBe('node2');
    });

    it('removes edge by id', () => {
      // Arrange
      const state = createGraphState();
      state.edges.set('edge1', { id: 'edge1', sourceId: 'node1', targetId: 'node2' });
      state.edges.set('edge2', { id: 'edge2', sourceId: 'node2', targetId: 'node3' });
      const action: SketchAction = { action: 'delete_edge', id: 'edge1' };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.edges.size).toBe(1);
    });
  });
});
