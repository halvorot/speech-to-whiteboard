package com.voiceboard.features.ai

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class GraphStateManagerTest {

    @Test
    fun `getOrCreate returns new state for new user`() {
        // Arrange
        val manager = GraphStateManager()

        // Act
        val state = manager.getOrCreate("user1")

        // Assert
        assertNotNull(state)
        assertTrue(state.nodes.isEmpty())
        assertTrue(state.edges.isEmpty())
    }

    @Test
    fun `getOrCreate returns same state for same user`() {
        // Arrange
        val manager = GraphStateManager()
        val state1 = manager.getOrCreate("user1")
        state1.nodes["node1"] = GraphNode("node1", "Test", "", NodeType.server)

        // Act
        val state2 = manager.getOrCreate("user1")

        // Assert
        assertSame(state1, state2)
        assertEquals(1, state2.nodes.size)
    }

    @Test
    fun `getOrCreate isolates states per user`() {
        // Arrange
        val manager = GraphStateManager()

        // Act
        val state1 = manager.getOrCreate("user1")
        val state2 = manager.getOrCreate("user2")
        state1.nodes["node1"] = GraphNode("node1", "User1Node", "", NodeType.server)

        // Assert
        assertEquals(1, state1.nodes.size)
        assertEquals(0, state2.nodes.size)
    }

    @Test
    fun `remove deletes user state`() {
        // Arrange
        val manager = GraphStateManager()
        val state1 = manager.getOrCreate("user1")
        state1.nodes["node1"] = GraphNode("node1", "Test", "", NodeType.server)

        // Act
        manager.remove("user1")
        val state2 = manager.getOrCreate("user1")

        // Assert
        assertEquals(0, state2.nodes.size)
    }
}
