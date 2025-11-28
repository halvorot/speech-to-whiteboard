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
    @SerialName("parent_id") val parentId: String? = null
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
    box,
    circle,
    cloud,
    diamond,
    hexagon,
    person,
    process,
    data,
    frame,
    // Legacy types (mapped to new types)
    database,
    server,
    client,
    storage,
    network,
    unknown
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
