package com.voiceboard.features.ai

import java.util.concurrent.ConcurrentHashMap

data class GraphNode(
    val id: String,
    val label: String,
    val description: String,
    val type: NodeType
)

data class GraphEdge(
    val sourceId: String,
    val targetId: String,
    val bidirectional: Boolean = false
)

data class GraphState(
    val nodes: MutableMap<String, GraphNode> = mutableMapOf(),
    val edges: MutableSet<GraphEdge> = mutableSetOf()
) {
    fun toSummary(): String {
        if (nodes.isEmpty()) return "Empty graph"

        val nodeList = nodes.values.joinToString(", ") { "${it.id}:${it.label}" }
        val edgeList = if (edges.isEmpty()) "" else edges.joinToString(", ") {
            val direction = if (it.bidirectional) "<->" else "->"
            "${it.sourceId}${direction}${it.targetId}"
        }

        return buildString {
            append("Nodes: $nodeList")
            if (edgeList.isNotEmpty()) {
                append(" | Edges: $edgeList")
            }
        }
    }

    fun applyAction(action: SketchAction): Boolean {
        return when (action.action) {
            ActionType.create_node -> {
                if (action.id != null && action.label != null && action.type != null) {
                    nodes[action.id] = GraphNode(
                        id = action.id,
                        label = action.label,
                        description = action.description ?: "",
                        type = action.type
                    )
                    true
                } else false
            }
            ActionType.update_node -> {
                if (action.id != null && nodes.containsKey(action.id)) {
                    val existing = nodes[action.id]!!
                    nodes[action.id] = GraphNode(
                        id = action.id,
                        label = action.label ?: existing.label,
                        description = action.description ?: existing.description,
                        type = action.type ?: existing.type
                    )
                    true
                } else false
            }
            ActionType.delete_node -> {
                if (action.id != null) {
                    nodes.remove(action.id)
                    // Remove edges connected to this node
                    edges.removeIf { it.sourceId == action.id || it.targetId == action.id }
                    true
                } else false
            }
            ActionType.create_edge -> {
                if (action.sourceId != null && action.targetId != null) {
                    edges.add(GraphEdge(action.sourceId, action.targetId, action.bidirectional ?: false))
                    true
                } else false
            }
            ActionType.delete_edge -> {
                // Support deletion by ID or by source/target
                if (action.id != null) {
                    // Delete by ID (not currently used much, but supported)
                    edges.removeIf { it.sourceId == action.id || it.targetId == action.id }
                    true
                } else if (action.sourceId != null && action.targetId != null) {
                    // Delete by matching source and target
                    edges.removeIf { it.sourceId == action.sourceId && it.targetId == action.targetId }
                    true
                } else false
            }
        }
    }
}

class GraphStateManager {
    private val sessions = ConcurrentHashMap<String, GraphState>()

    fun getOrCreate(userId: String): GraphState {
        return sessions.getOrPut(userId) { GraphState() }
    }

    fun remove(userId: String) {
        sessions.remove(userId)
    }
}
