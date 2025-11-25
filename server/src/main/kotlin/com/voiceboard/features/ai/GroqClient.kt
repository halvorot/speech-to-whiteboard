package com.voiceboard.features.ai

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

@Serializable
data class GroqMessage(
    val role: String,
    val content: String
)

@Serializable
data class GroqRequest(
    val model: String,
    val messages: List<GroqMessage>,
    val temperature: Double = 0.1,
    val stream: Boolean = false
)

@Serializable
data class GroqChoice(
    val message: GroqMessage? = null,
    val delta: GroqMessage? = null
)

@Serializable
data class GroqResponse(
    val choices: List<GroqChoice>
)

class GroqClient(
    private val apiKey: String,
    private val client: HttpClient
) {
    private val logger = LoggerFactory.getLogger(GroqClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val baseUrl = "https://api.groq.com/openai/v1/chat/completions"

    private val systemPrompt = """
You are an intelligent whiteboard assistant that creates professional visual diagrams from natural language.
Convert user descriptions into structured JSON for rendering shapes with icons and detailed text.

INPUTS:
1. current_graph_summary: Existing nodes/edges
2. user_prompt: What to draw/modify

OUTPUT SCHEMA:
{
  "actions": [
    {
      "action": "create_node" | "update_node" | "delete_node" | "create_edge" | "delete_edge",
      "id": "unique_id",
      "label": "Short main title (2-4 words)",
      "description": "Brief detail (optional, 3-8 words)",
      "type": "box" | "circle" | "cloud" | "diamond" | "hexagon" | "person" | "process" | "data" | "database" | "server" | "client" | "storage" | "network" | "unknown",
      "source_id": "for edges",
      "target_id": "for edges",
      "bidirectional": true/false (for edges, default false)
    }
  ]
}

TYPE GUIDELINES:
- database: databases, DB systems (PostgreSQL, MongoDB, Redis)
- server: backend servers, APIs, web servers, app servers
- client: frontends, mobile apps, web clients, desktop apps
- storage: file storage, object storage, S3, blob storage
- network: load balancers, CDNs, routers, gateways
- cloud: cloud services, SaaS, external APIs
- person: people, roles, actors, teams
- process: workflows, pipelines, operations, transformations
- data: data flows, datasets, data sources
- diamond: decisions, conditionals, gateways
- hexagon: processing steps, operations
- box: generic systems, components, modules
- circle: states, endpoints, simple concepts
- unknown: when unsure

LABEL + DESCRIPTION PATTERN:
- label: Short, clear name (e.g., "MySQL", "Web Server", "CEO")
- description: Technology/detail (e.g., "Primary database", "Node.js API", "Chief Executive")

EXAMPLES:
Create node:
{
  "action": "create_node",
  "id": "auth_db",
  "label": "Auth Database",
  "description": "PostgreSQL 14",
  "type": "database"
}

Delete node (user: "remove the auth database"):
{
  "action": "delete_node",
  "id": "auth_db"
}

Create one-way edge (user: "add arrow from server to database"):
{
  "action": "create_edge",
  "source_id": "api_server",
  "target_id": "auth_db",
  "bidirectional": false
}

Create bidirectional edge (user: "make two-way arrow between server and database"):
{
  "action": "create_edge",
  "source_id": "api_server",
  "target_id": "auth_db",
  "bidirectional": true
}

Delete edge (user: "remove arrow between server and database"):
{
  "action": "delete_edge",
  "source_id": "api_server",
  "target_id": "auth_db"
}

Reverse arrow direction (user: "flip the arrow" or "make it point the other way"):
{
  "actions": [
    {
      "action": "delete_edge",
      "source_id": "api_server",
      "target_id": "auth_db"
    },
    {
      "action": "create_edge",
      "source_id": "auth_db",
      "target_id": "api_server"
    }
  ]
}

RULES:
1. Always provide both label AND description for create_node
2. Keep labels SHORT (2-4 words max)
3. Descriptions add technical detail or context
4. Choose types that match icons (database icon for DBs, person icon for people)
5. Connect related items with create_edge actions
6. Handle ANY domain: tech architecture, business processes, org charts
7. ALWAYS return valid JSON with snake_case fields wrapped in { "actions": [...] }
8. For delete_node: Match user's description to existing node IDs/labels in current_graph_summary
   - Example: If user says "remove the AI LLM box" and graph has "ai_llm:AI LLM", use id "ai_llm"
   - Match flexibly: "database" matches "db", "DB", "database", etc.
   - If no match found, return empty actions array
9. When deleting, also remove connected edges automatically (handled by backend)
10. For ambiguous references ("it", "that"), use most recently mentioned node
11. For edges/arrows:
    - delete_edge: Match "between X and Y" to find source_id and target_id
    - "two-way", "bidirectional", "both directions" → bidirectional: true
    - "reverse", "flip", "other direction" → delete old edge, create new with swapped source/target
    - Edge matching: "arrow from X to Y" has source=X, target=Y
    - Converting bidirectional→unidirectional: delete existing edge, create new with bidirectional: false
12. Multiple actions: Always wrap in { "actions": [...] }, never return bare array
""".trimIndent()

    suspend fun streamCommands(
        graphSummary: String,
        userPrompt: String
    ): Flow<String> = flow {
        withContext(Dispatchers.IO) {
            try {
                val request = GroqRequest(
                    model = "llama-3.3-70b-versatile",
                    messages = listOf(
                        GroqMessage("system", systemPrompt),
                        GroqMessage("user", "Current graph: $graphSummary\n\nUser command: $userPrompt")
                    ),
                    temperature = 0.1,
                    stream = true
                )

                logger.info("Sending request to Groq: $userPrompt")

                val response: HttpResponse = client.post(baseUrl) {
                    header("Authorization", "Bearer $apiKey")
                    contentType(ContentType.Application.Json)
                    setBody(request)
                }

                val text = response.bodyAsText()

                // Parse streaming response (SSE format)
                text.lines().forEach { line ->
                    if (line.startsWith("data: ") && !line.contains("[DONE]")) {
                        try {
                            val jsonLine = line.removePrefix("data: ")
                            val groqResponse = json.decodeFromString<GroqResponse>(jsonLine)
                            val delta = groqResponse.choices.firstOrNull()?.delta?.content
                            if (!delta.isNullOrBlank()) {
                                emit(delta)
                            }
                        } catch (e: Exception) {
                            logger.debug("Failed to parse streaming chunk: $line", e)
                        }
                    }
                }
            } catch (e: Exception) {
                logger.error("Error in Groq streaming", e)
                throw e
            }
        }
    }

    suspend fun getCommands(
        graphSummary: String,
        userPrompt: String
    ): SketchResponse = withContext(Dispatchers.IO) {
        try {
            val request = GroqRequest(
                model = "llama-3.3-70b-versatile",
                messages = listOf(
                    GroqMessage("system", systemPrompt),
                    GroqMessage("user", "Current graph: $graphSummary\n\nUser command: $userPrompt")
                ),
                temperature = 0.1,
                stream = false
            )

            logger.info("Sending request to Groq: $userPrompt")

            val response: HttpResponse = client.post(baseUrl) {
                header("Authorization", "Bearer $apiKey")
                contentType(ContentType.Application.Json)
                setBody(request)
            }

            val groqResponse = json.decodeFromString<GroqResponse>(response.bodyAsText())
            val content = groqResponse.choices.firstOrNull()?.message?.content
                ?: throw IllegalStateException("No response from Groq")

            logger.info("Groq response: $content")

            // Extract JSON from response (may have explanatory text + markdown)
            val cleanedContent = when {
                // Has markdown code fence with json
                content.contains("```json") -> {
                    val start = content.indexOf("```json") + 7
                    val end = content.indexOf("```", start)
                    if (end > start) {
                        content.substring(start, end).trim()
                    } else {
                        content.trim()
                    }
                }
                // Has generic code fence
                content.contains("```") -> {
                    val start = content.indexOf("```") + 3
                    val end = content.indexOf("```", start)
                    if (end > start) {
                        content.substring(start, end).trim()
                    } else {
                        content.trim()
                    }
                }
                // Look for JSON object directly
                content.contains("{") -> {
                    val start = content.indexOf("{")
                    val end = content.lastIndexOf("}") + 1
                    if (end > start) {
                        content.substring(start, end).trim()
                    } else {
                        content.trim()
                    }
                }
                else -> content.trim()
            }

            logger.info("Cleaned JSON: $cleanedContent")

            // Parse the JSON response into SketchResponse
            // Handle both { "actions": [...] } and [...] formats
            if (cleanedContent.trimStart().startsWith("[")) {
                // Direct array format - wrap it
                val actions = json.decodeFromString<List<SketchAction>>(cleanedContent)
                SketchResponse(actions)
            } else {
                // Standard format
                json.decodeFromString<SketchResponse>(cleanedContent)
            }
        } catch (e: Exception) {
            logger.error("Error getting commands from Groq", e)
            throw e
        }
    }
}
