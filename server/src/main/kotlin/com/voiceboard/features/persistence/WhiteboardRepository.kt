package com.voiceboard.features.persistence

import com.voiceboard.features.ai.GraphState
import com.voiceboard.features.ai.GraphSyncMessage
import com.voiceboard.features.ai.SerializedGraphEdge
import com.voiceboard.features.ai.SerializedGraphNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.sql.Connection
import java.sql.SQLException

/**
 * Repository for whiteboard persistence operations
 */
class WhiteboardRepository {
    private val logger = LoggerFactory.getLogger(WhiteboardRepository::class.java)
    private val json = Json { prettyPrint = false }

    /**
     * Load a user's whiteboard from the database
     * Returns null if no whiteboard exists for the user
     */
    suspend fun load(userId: String): GraphState? = withContext(Dispatchers.IO) {
        try {
            DatabaseConfig.getDataSource().connection.use { conn ->
                val sql = "SELECT snapshot, graph_state FROM whiteboards WHERE user_id = ?::uuid"
                conn.prepareStatement(sql).use { stmt ->
                    stmt.setString(1, userId)
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) {
                            val snapshot = rs.getString("snapshot")
                            val graphStateJson = rs.getString("graph_state")

                            // Parse graph state
                            val graphSync = json.decodeFromString<GraphSyncMessage>(graphStateJson)

                            // Build GraphState from database
                            val graphState = GraphState()
                            graphState.syncFrom(graphSync)
                            graphState.canvasSnapshot = snapshot

                            logger.info("Loaded whiteboard for user $userId: ${graphSync.nodes.size} nodes, ${graphSync.edges.size} edges")
                            graphState
                        } else {
                            logger.info("No whiteboard found for user $userId")
                            null
                        }
                    }
                }
            }
        } catch (e: SQLException) {
            logger.error("Failed to load whiteboard for user $userId", e)
            null
        } catch (e: Exception) {
            logger.error("Unexpected error loading whiteboard for user $userId", e)
            null
        }
    }

    /**
     * Save a user's whiteboard to the database (upsert)
     * Returns true if successful, false otherwise
     */
    suspend fun save(userId: String, graphState: GraphState): Boolean = withContext(Dispatchers.IO) {
        try {
            // Serialize graph state to JSON
            val graphSync = GraphSyncMessage(
                type = "graph_sync",
                nodes = graphState.nodes.values.map { node ->
                    SerializedGraphNode(
                        id = node.id,
                        label = node.label,
                        description = node.description,
                        type = node.type,
                        parentId = node.parentId,
                        color = node.color,
                        position = node.position,
                        relativeTo = node.relativeTo
                    )
                },
                edges = graphState.edges.map { edge ->
                    SerializedGraphEdge(
                        id = "${edge.sourceId}-${edge.targetId}",
                        sourceId = edge.sourceId,
                        targetId = edge.targetId,
                        bidirectional = edge.bidirectional
                    )
                }
            )

            val graphStateJson = json.encodeToString(graphSync)
            val snapshot = graphState.canvasSnapshot ?: "{}"

            DatabaseConfig.getDataSource().connection.use { conn ->
                val sql = """
                    INSERT INTO whiteboards (user_id, snapshot, graph_state, updated_at)
                    VALUES (?::uuid, ?::jsonb, ?::jsonb, now())
                    ON CONFLICT (user_id)
                    DO UPDATE SET
                        snapshot = EXCLUDED.snapshot,
                        graph_state = EXCLUDED.graph_state,
                        updated_at = now()
                """.trimIndent()

                conn.prepareStatement(sql).use { stmt ->
                    stmt.setString(1, userId)
                    stmt.setString(2, snapshot)
                    stmt.setString(3, graphStateJson)
                    stmt.executeUpdate()
                }
            }

            logger.info("Saved whiteboard for user $userId: ${graphState.nodes.size} nodes, ${graphState.edges.size} edges")
            true
        } catch (e: SQLException) {
            logger.error("Failed to save whiteboard for user $userId", e)
            false
        } catch (e: Exception) {
            logger.error("Unexpected error saving whiteboard for user $userId", e)
            false
        }
    }

    /**
     * Delete a user's whiteboard from the database
     * Returns true if successful, false otherwise
     */
    suspend fun delete(userId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            DatabaseConfig.getDataSource().connection.use { conn ->
                val sql = "DELETE FROM whiteboards WHERE user_id = ?::uuid"
                conn.prepareStatement(sql).use { stmt ->
                    stmt.setString(1, userId)
                    val rowsAffected = stmt.executeUpdate()
                    logger.info("Deleted whiteboard for user $userId: $rowsAffected rows affected")
                    rowsAffected > 0
                }
            }
        } catch (e: SQLException) {
            logger.error("Failed to delete whiteboard for user $userId", e)
            false
        } catch (e: Exception) {
            logger.error("Unexpected error deleting whiteboard for user $userId", e)
            false
        }
    }
}
