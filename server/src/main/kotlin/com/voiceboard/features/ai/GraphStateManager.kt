package com.voiceboard.features.ai

import java.util.concurrent.ConcurrentHashMap

data class GraphNode(
    val id: String,
    val label: String,
    val description: String,
    val type: NodeType,
    val parentId: String? = null,
    val color: String? = null,
    val position: String? = null,
    val relativeTo: String? = null
)

data class GraphEdge(
    val sourceId: String,
    val targetId: String,
    val bidirectional: Boolean = false
)

data class GraphState(
    val nodes: MutableMap<String, GraphNode> = mutableMapOf(),
    val edges: MutableSet<GraphEdge> = mutableSetOf(),
    val conversationHistory: MutableList<String> = mutableListOf()
) {
    companion object {
        const val MAX_HISTORY_SIZE = 5 // Limit to last 5 commands for cost control
    }

    fun addToHistory(command: String) {
        conversationHistory.add(command)
        // Keep only last N commands
        if (conversationHistory.size > MAX_HISTORY_SIZE) {
            conversationHistory.removeAt(0)
        }
    }

    fun getHistorySummary(): String {
        if (conversationHistory.isEmpty()) return "No previous commands"
        return conversationHistory.joinToString(" → ")
    }
    fun syncFrom(syncMessage: GraphSyncMessage) {
        // Clear existing state
        nodes.clear()
        edges.clear()

        // Populate from sync message
        syncMessage.nodes.forEach { node ->
            nodes[node.id] = GraphNode(
                id = node.id,
                label = node.label,
                description = node.description,
                type = node.type,
                parentId = node.parentId,
                color = node.color,
                position = node.position,
                relativeTo = node.relativeTo
            )
        }

        syncMessage.edges.forEach { edge ->
            edges.add(GraphEdge(
                sourceId = edge.sourceId,
                targetId = edge.targetId,
                bidirectional = edge.bidirectional ?: false
            ))
        }
    }

    fun toSummary(): String {
        if (nodes.isEmpty()) return "Empty graph"

        val frames = nodes.values.filter { it.type == NodeType.frame }
        val regularNodes = nodes.values.filter { it.type != NodeType.frame }

        val frameList = frames.joinToString(", ") {
            val children = regularNodes.filter { it.parentId == it.id }.map { it.id }
            if (children.isEmpty()) {
                "${it.id}:${it.label}(frame)"
            } else {
                "${it.id}:${it.label}(frame)[${children.joinToString(",")}]"
            }
        }

        val nodeList = regularNodes.joinToString(", ") {
            if (it.parentId != null) {
                "${it.id}:${it.label}→${it.parentId}"
            } else {
                "${it.id}:${it.label}"
            }
        }

        val edgeList = if (edges.isEmpty()) "" else edges.joinToString(", ") {
            val direction = if (it.bidirectional) "<->" else "->"
            "${it.sourceId}${direction}${it.targetId}"
        }

        return buildString {
            if (frameList.isNotEmpty()) {
                append("Frames: $frameList | ")
            }
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
                        type = action.type,
                        parentId = action.parentId,
                        color = action.color,
                        position = action.position,
                        relativeTo = action.relativeTo
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
                        type = action.type ?: existing.type,
                        parentId = action.parentId ?: existing.parentId,
                        color = action.color ?: existing.color,
                        position = action.position ?: existing.position,
                        relativeTo = action.relativeTo ?: existing.relativeTo
                    )
                    true
                } else false
            }
            ActionType.delete_node -> {
                if (action.id != null) {
                    nodes.remove(action.id)
                    // Remove edges connected to this node
                    edges.removeIf { it.sourceId == action.id || it.targetId == action.id }
                    // Remove child nodes if deleting a frame
                    nodes.values.removeIf { it.parentId == action.id }
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
