package com.voiceboard.features.ai

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GraphStateTest {

    @Test
    fun `create_node adds new node to state`() {
        // Arrange
        val state = GraphState()
        val action = SketchAction(
            action = ActionType.create_node,
            id = "node1",
            label = "Test Node",
            description = "Description",
            type = NodeType.server
        )

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals(1, state.nodes.size)
        assertEquals("Test Node", state.nodes["node1"]?.label)
        assertEquals(NodeType.server, state.nodes["node1"]?.type)
    }

    @Test
    fun `create_node fails without required fields`() {
        // Arrange
        val state = GraphState()
        val actionNoId = SketchAction(action = ActionType.create_node, label = "Test", type = NodeType.server)
        val actionNoLabel = SketchAction(action = ActionType.create_node, id = "node1", type = NodeType.server)
        val actionNoType = SketchAction(action = ActionType.create_node, id = "node1", label = "Test")

        // Act & Assert
        assertFalse(state.applyAction(actionNoId))
        assertFalse(state.applyAction(actionNoLabel))
        assertFalse(state.applyAction(actionNoType))
        assertEquals(0, state.nodes.size)
    }

    @Test
    fun `update_node modifies existing node`() {
        // Arrange
        val state = GraphState()
        state.nodes["node1"] = GraphNode("node1", "Original", "Desc", NodeType.server)
        val action = SketchAction(
            action = ActionType.update_node,
            id = "node1",
            label = "Updated"
        )

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals("Updated", state.nodes["node1"]?.label)
        assertEquals("Desc", state.nodes["node1"]?.description)
        assertEquals(NodeType.server, state.nodes["node1"]?.type)
    }

    @Test
    fun `update_node fails for non-existent node`() {
        // Arrange
        val state = GraphState()
        val action = SketchAction(action = ActionType.update_node, id = "node1", label = "Test")

        // Act
        val result = state.applyAction(action)

        // Assert
        assertFalse(result)
    }

    @Test
    fun `delete_node removes node and connected edges`() {
        // Arrange
        val state = GraphState()
        state.nodes["node1"] = GraphNode("node1", "Node 1", "", NodeType.server)
        state.nodes["node2"] = GraphNode("node2", "Node 2", "", NodeType.client)
        state.edges.add(GraphEdge("node1", "node2"))
        state.edges.add(GraphEdge("node2", "node1"))
        val action = SketchAction(action = ActionType.delete_node, id = "node1")

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals(1, state.nodes.size)
        assertEquals(0, state.edges.size)
    }

    @Test
    fun `create_edge adds edge between nodes`() {
        // Arrange
        val state = GraphState()
        val action = SketchAction(
            action = ActionType.create_edge,
            sourceId = "node1",
            targetId = "node2",
            bidirectional = false
        )

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals(1, state.edges.size)
        val edge = state.edges.first()
        assertEquals("node1", edge.sourceId)
        assertEquals("node2", edge.targetId)
        assertFalse(edge.bidirectional)
    }

    @Test
    fun `create_edge supports bidirectional`() {
        // Arrange
        val state = GraphState()
        val action = SketchAction(
            action = ActionType.create_edge,
            sourceId = "node1",
            targetId = "node2",
            bidirectional = true
        )

        // Act
        state.applyAction(action)

        // Assert
        assertTrue(state.edges.first().bidirectional)
    }

    @Test
    fun `create_edge fails without source and target`() {
        // Arrange
        val state = GraphState()
        val actionNoSource = SketchAction(action = ActionType.create_edge, targetId = "node2")
        val actionNoTarget = SketchAction(action = ActionType.create_edge, sourceId = "node1")

        // Act & Assert
        assertFalse(state.applyAction(actionNoSource))
        assertFalse(state.applyAction(actionNoTarget))
        assertEquals(0, state.edges.size)
    }

    @Test
    fun `delete_edge removes edge by source and target`() {
        // Arrange
        val state = GraphState()
        state.edges.add(GraphEdge("node1", "node2"))
        state.edges.add(GraphEdge("node2", "node3"))
        val action = SketchAction(
            action = ActionType.delete_edge,
            sourceId = "node1",
            targetId = "node2"
        )

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals(1, state.edges.size)
        assertEquals("node2", state.edges.first().sourceId)
    }

    @Test
    fun `delete_edge by id removes connected edges`() {
        // Arrange
        val state = GraphState()
        state.edges.add(GraphEdge("node1", "node2"))
        state.edges.add(GraphEdge("node2", "node3"))
        val action = SketchAction(action = ActionType.delete_edge, id = "node1")

        // Act
        val result = state.applyAction(action)

        // Assert
        assertTrue(result)
        assertEquals(1, state.edges.size)
    }

    @Test
    fun `toSummary formats empty graph`() {
        // Arrange
        val state = GraphState()

        // Act
        val summary = state.toSummary()

        // Assert
        assertEquals("Empty graph", summary)
    }

    @Test
    fun `toSummary formats nodes only`() {
        // Arrange
        val state = GraphState()
        state.nodes["node1"] = GraphNode("node1", "Server", "", NodeType.server)
        state.nodes["node2"] = GraphNode("node2", "Client", "", NodeType.client)

        // Act
        val summary = state.toSummary()

        // Assert
        assertTrue(summary.contains("node1:Server"))
        assertTrue(summary.contains("node2:Client"))
        assertFalse(summary.contains("Edges"))
    }

    @Test
    fun `toSummary formats nodes and edges`() {
        // Arrange
        val state = GraphState()
        state.nodes["node1"] = GraphNode("node1", "Server", "", NodeType.server)
        state.nodes["node2"] = GraphNode("node2", "Client", "", NodeType.client)
        state.edges.add(GraphEdge("node1", "node2", false))

        // Act
        val summary = state.toSummary()

        // Assert
        assertTrue(summary.contains("node1:Server"))
        assertTrue(summary.contains("node1->node2"))
    }

    @Test
    fun `toSummary shows bidirectional edges`() {
        // Arrange
        val state = GraphState()
        state.nodes["node1"] = GraphNode("node1", "A", "", NodeType.server)
        state.edges.add(GraphEdge("node1", "node2", true))

        // Act
        val summary = state.toSummary()

        // Assert
        assertTrue(summary.contains("node1<->node2"))
    }
}
