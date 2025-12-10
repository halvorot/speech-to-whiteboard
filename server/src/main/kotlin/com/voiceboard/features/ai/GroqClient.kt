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
import kotlinx.serialization.json.*
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

@Serializable
data class GroqError(
    val error: GroqErrorDetail
)

@Serializable
data class GroqErrorDetail(
    val message: String,
    val type: String? = null,
    val code: String? = null
)

class GroqClient(
    private val apiKey: String,
    private val client: HttpClient
) {
    private val logger = LoggerFactory.getLogger(GroqClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }
    private val baseUrl = "https://api.groq.com/openai/v1/chat/completions"

    private val systemPrompt: String = loadSystemPrompt()

    private fun loadSystemPrompt(): String {
        return try {
            val resource = this::class.java.classLoader.getResourceAsStream("prompts/sketch-protocol.md")
                ?: throw IllegalStateException("System prompt file not found: prompts/sketch-protocol.md")

            resource.bufferedReader().use { it.readText() }
                .also { logger.info("Loaded system prompt (${it.length} chars)") }
        } catch (e: Exception) {
            logger.error("Failed to load system prompt from file", e)
            throw IllegalStateException("Could not load system prompt", e)
        }
    }

    suspend fun streamCommands(
        graphSummary: String,
        userPrompt: String,
        conversationHistory: String = "No previous commands"
    ): Flow<String> = flow {
        withContext(Dispatchers.IO) {
            try {
                val userMessage = buildString {
                    append("Recent commands: $conversationHistory\n\n")
                    append("Current graph: $graphSummary\n\n")
                    append("User command: $userPrompt")
                }

                val request = GroqRequest(
                    model = "llama-3.3-70b-versatile",
                    messages = listOf(
                        GroqMessage("system", systemPrompt),
                        GroqMessage("user", userMessage)
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

                // Check for error responses
                if (!response.status.isSuccess()) {
                    val errorResponse = try {
                        json.decodeFromString<GroqError>(text)
                    } catch (e: Exception) {
                        logger.error("Failed to parse Groq streaming error: $text")
                        null
                    }

                    if (errorResponse != null) {
                        val errorMsg = errorResponse.error.message
                        logger.error("Error from Groq: $errorMsg")

                        // Handle rate limit errors specially
                        if (errorResponse.error.code == "rate_limit_exceeded") {
                            val retryTimeRegex = """try again in (\d+[hms.]+)""".toRegex()
                            val retryTime = retryTimeRegex.find(errorMsg)?.groupValues?.get(1)?.replace(".072s", "s")

                            if (retryTime != null) {
                                throw IllegalStateException("AI model rate limit reached. Please try again in $retryTime")
                            } else {
                                throw IllegalStateException("AI model rate limit reached. Please try again later")
                            }
                        }

                        throw IllegalStateException("AI service error: $errorMsg")
                    } else {
                        throw IllegalStateException("AI service error (status ${response.status.value})")
                    }
                }

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
        userPrompt: String,
        conversationHistory: String = "No previous commands"
    ): SketchResponse = withContext(Dispatchers.IO) {
        try {
            val userMessage = buildString {
                append("Recent commands: $conversationHistory\n\n")
                append("Current graph: $graphSummary\n\n")
                append("User command: $userPrompt")
            }

            val request = GroqRequest(
                model = "llama-3.3-70b-versatile",
                messages = listOf(
                    GroqMessage("system", systemPrompt),
                    GroqMessage("user", userMessage)
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

            val responseBody = response.bodyAsText()

            // Check for error responses
            if (!response.status.isSuccess()) {
                val errorResponse = try {
                    json.decodeFromString<GroqError>(responseBody)
                } catch (e: Exception) {
                    logger.error("Failed to parse Groq error response: $responseBody")
                    null
                }

                if (errorResponse != null) {
                    val errorMsg = errorResponse.error.message
                    logger.error("Error from Groq: $errorMsg")

                    // Handle rate limit errors specially
                    if (errorResponse.error.code == "rate_limit_exceeded") {
                        // Extract retry time from message like "Please try again in 4m39.072s"
                        val retryTimeRegex = """try again in (\d+[hms.]+)""".toRegex()
                        val retryTime = retryTimeRegex.find(errorMsg)?.groupValues?.get(1)?.replace(".072s", "s")

                        if (retryTime != null) {
                            throw IllegalStateException("AI model rate limit reached. Please try again in $retryTime")
                        } else {
                            throw IllegalStateException("AI model rate limit reached. Please try again later")
                        }
                    }

                    // Generic error
                    throw IllegalStateException("AI service error: $errorMsg")
                } else {
                    throw IllegalStateException("AI service error (status ${response.status.value})")
                }
            }

            // Try to parse as normal response
            val groqResponse = try {
                json.decodeFromString<GroqResponse>(responseBody)
            } catch (e: Exception) {
                // Log the actual response for debugging
                logger.error("Failed to parse Groq response: $responseBody")
                throw IllegalStateException("Invalid response from Groq API: ${e.message}")
            }

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
            // IMPORTANT: Filter out invalid actions to handle AI hallucinations
            try {
                val validActionTypes = setOf("create_node", "update_node", "delete_node", "create_edge", "delete_edge")
                val response = if (cleanedContent.trimStart().startsWith("[")) {
                    // Direct array format - wrap it
                    val actions = json.decodeFromString<List<SketchAction>>(cleanedContent)
                    SketchResponse(actions)
                } else {
                    // Standard format
                    json.decodeFromString<SketchResponse>(cleanedContent)
                }

                // Filter out actions with invalid types (AI hallucinations like "update_edge")
                val validActions = response.actions.filter { action ->
                    val actionName = action.action.name
                    if (validActionTypes.contains(actionName)) {
                        true
                    } else {
                        logger.warn("Filtered out invalid action type: $actionName - ${action}")
                        false
                    }
                }

                if (validActions.size < response.actions.size) {
                    logger.warn("Filtered out ${response.actions.size - validActions.size} invalid actions")
                }

                SketchResponse(validActions)
            } catch (e: Exception) {
                // If deserialization fails (e.g., due to invalid action type), try to manually filter
                logger.error("Error deserializing Groq response, attempting manual filter", e)

                // Parse as generic JSON and filter out actions with invalid types
                val jsonElement = json.parseToJsonElement(cleanedContent)
                val actionsArray = if (jsonElement is JsonObject) {
                    jsonElement.jsonObject["actions"]?.jsonArray
                } else {
                    jsonElement.jsonArray
                }

                val validActions = actionsArray?.filter { actionElement ->
                    val actionObj = actionElement.jsonObject
                    val actionType = actionObj["action"]?.jsonPrimitive?.content
                    setOf("create_node", "update_node", "delete_node", "create_edge", "delete_edge").contains(actionType)
                } ?: emptyList()

                if (validActions.isEmpty()) {
                    logger.error("No valid actions found after filtering")
                    throw IllegalStateException("AI returned no valid actions")
                }

                logger.info("Attempting to deserialize ${validActions.size} filtered actions")
                val filteredJson = """{"actions":${validActions}}"""
                json.decodeFromString<SketchResponse>(filteredJson)
            }
        } catch (e: Exception) {
            logger.error("Error getting commands from Groq", e)
            throw e
        }
    }
}
