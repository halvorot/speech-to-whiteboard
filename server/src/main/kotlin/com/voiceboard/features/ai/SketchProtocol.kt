package com.voiceboard.features.ai

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SketchAction(
    val action: ActionType,
    val id: String? = null,
    val label: String? = null,
    val description: String? = null,
    val type: NodeType? = null,
    @SerialName("source_id") val sourceId: String? = null,
    @SerialName("target_id") val targetId: String? = null,
    val bidirectional: Boolean? = null,
    @SerialName("parent_id") val parentId: String? = null,
    val color: String? = null,
    val position: String? = null,
    @SerialName("relative_to") val relativeTo: String? = null
)

@Serializable
enum class ActionType {
    create_node,
    update_node,
    delete_node,
    create_edge,
    delete_edge
}

@Serializable
enum class NodeType {
    // Semantic types (infrastructure & data)
    database,
    server,
    client,
    storage,
    network,
    // Shape-based types
    box,
    circle,
    cloud,
    diamond,
    hexagon,
    person,
    process,
    data,
    frame,
    text,
    note
}

@Serializable
data class SketchResponse(
    val actions: List<SketchAction>
)

@Serializable
data class SketchRequest(
    val currentGraphSummary: String,
    val userPrompt: String
)

// Graph sync message types
@Serializable
data class SerializedGraphNode(
    val id: String,
    val label: String,
    val description: String,
    val type: NodeType,
    val parentId: String? = null,
    val color: String? = null,
    val position: String? = null,
    val relativeTo: String? = null
)

@Serializable
data class SerializedGraphEdge(
    val id: String,
    val sourceId: String,
    val targetId: String,
    val bidirectional: Boolean? = null
)

@Serializable
data class GraphSyncMessage(
    val type: String,
    val nodes: List<SerializedGraphNode>,
    val edges: List<SerializedGraphEdge>
)
