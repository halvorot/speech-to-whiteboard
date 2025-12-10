import { describe, it, expect } from 'vitest';
import { createGraphState, applyAction } from './graphLayout';
import type { SketchAction } from '../types/sketch';

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

    it('creates text node with color', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_node',
        id: 'text1',
        label: 'Title',
        description: 'Description text',
        type: 'text',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.size).toBe(1);
      expect(state.nodes.get('text1')?.type).toBe('text');
      expect(state.nodes.get('text1')?.label).toBe('Title');
    });

    it('creates note node with color', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_node',
        id: 'note1',
        label: 'TODO',
        description: 'Remember to do this',
        type: 'note',
        color: 'yellow',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.size).toBe(1);
      expect(state.nodes.get('note1')?.type).toBe('note');
      expect(state.nodes.get('note1')?.color).toBe('yellow');
    });

    it('creates note with different colors', () => {
      // Arrange
      const state = createGraphState();
      const actions: SketchAction[] = [
        { action: 'create_node', id: 'note1', label: 'Yellow', type: 'note', color: 'yellow' },
        { action: 'create_node', id: 'note2', label: 'Pink', type: 'note', color: 'pink' },
        { action: 'create_node', id: 'note3', label: 'Blue', type: 'note', color: 'blue' },
      ];

      // Act
      actions.forEach((action) => applyAction(state, action));

      // Assert
      expect(state.nodes.size).toBe(3);
      expect(state.nodes.get('note1')?.color).toBe('yellow');
      expect(state.nodes.get('note2')?.color).toBe('pink');
      expect(state.nodes.get('note3')?.color).toBe('blue');
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

    it('updates note color', () => {
      // Arrange
      const state = createGraphState();
      state.nodes.set('note1', {
        id: 'note1',
        label: 'Note',
        description: 'Desc',
        type: 'note',
        color: 'yellow',
      });
      const action: SketchAction = {
        action: 'update_node',
        id: 'note1',
        color: 'pink',
      };

      // Act
      const result = applyAction(state, action);

      // Assert
      expect(result).toBe(true);
      expect(state.nodes.get('note1')?.color).toBe('pink');
      expect(state.nodes.get('note1')?.label).toBe('Note');
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

  describe('layout determinism', () => {
    it('produces identical graph state from sequential vs batched actions', () => {
      // Arrange
      const stateSequential = createGraphState();
      const stateBatched = createGraphState();

      // Sequential actions (simulating: "add server", then "connect database to server")
      const action1: SketchAction = {
        action: 'create_node',
        id: 'api_server',
        label: 'API Server',
        description: 'Node.js',
        type: 'server',
      };
      const action2: SketchAction = {
        action: 'create_node',
        id: 'database',
        label: 'Database',
        description: 'PostgreSQL',
        type: 'database',
      };
      const action3: SketchAction = {
        action: 'create_edge',
        source_id: 'api_server',
        target_id: 'database',
      };

      // Act - Sequential
      applyAction(stateSequential, action1);
      applyAction(stateSequential, action2);
      applyAction(stateSequential, action3);

      // Act - Batched (simulating: "add server and connect database to server")
      [action1, action2, action3].forEach((a) => applyAction(stateBatched, a));

      // Assert - Both states should be identical
      expect(stateSequential.nodes.size).toBe(stateBatched.nodes.size);
      expect(stateSequential.edges.size).toBe(stateBatched.edges.size);
      expect(stateSequential.nodes.get('api_server')?.label).toBe(
        stateBatched.nodes.get('api_server')?.label
      );
      expect(stateSequential.nodes.get('database')?.label).toBe(
        stateBatched.nodes.get('database')?.label
      );

      // Verify edges are identical
      const edgesSeq = Array.from(stateSequential.edges.values());
      const edgesBatch = Array.from(stateBatched.edges.values());
      expect(edgesSeq.length).toBe(edgesBatch.length);
      expect(edgesSeq[0].sourceId).toBe(edgesBatch[0].sourceId);
      expect(edgesSeq[0].targetId).toBe(edgesBatch[0].targetId);
    });

    it('graph state contains no position data', () => {
      // Arrange
      const state = createGraphState();
      const action: SketchAction = {
        action: 'create_node',
        id: 'node1',
        label: 'Test Node',
        type: 'server',
      };

      // Act
      applyAction(state, action);

      // Assert - GraphNode should not have x/y position fields
      const node = state.nodes.get('node1');
      expect(node).toBeDefined();
      expect(node).not.toHaveProperty('x');
      expect(node).not.toHaveProperty('y');

      // Only text/notes should have position hints (not actual coordinates)
      const textAction: SketchAction = {
        action: 'create_node',
        id: 'text1',
        label: 'Title',
        type: 'text',
        position: 'above',
        relative_to: 'node1',
      };
      applyAction(state, textAction);

      const textNode = state.nodes.get('text1');
      expect(textNode?.position).toBe('above'); // Position hint, not coordinate
      expect(textNode?.relativeTo).toBe('node1'); // Relative reference
      expect(textNode).not.toHaveProperty('x'); // No absolute coordinates
      expect(textNode).not.toHaveProperty('y');
    });
  });
});
