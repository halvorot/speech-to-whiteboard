package com.voiceboard.features.ai

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

@Serializable
data class GroqMessage(
    val role: String? = null,
    val content: String? = null
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

    fun streamCommands(
        graphSummary: String,
        userPrompt: String
    ): Flow<String> = flow {
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

            logger.info("Sending streaming request to Groq")

            val response: HttpResponse = client.post(baseUrl) {
                header("Authorization", "Bearer $apiKey")
                contentType(ContentType.Application.Json)
                setBody(request)
            }

            logger.info("Groq response status: ${response.status}")

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

            val channel: ByteReadChannel = response.bodyAsChannel()
            var tokenCount = 0

            // Read streaming response line by line using readUTF8Line
            try {
                while (!channel.isClosedForRead) {
                    val line = channel.readUTF8Line() ?: break

                    // Parse SSE format: "data: {json}"
                    if (line.startsWith("data: ") && !line.contains("[DONE]")) {
                        try {
                            val jsonLine = line.removePrefix("data: ").trim()
                            if (jsonLine.isNotEmpty()) {
                                val groqResponse = json.decodeFromString<GroqResponse>(jsonLine)
                                val delta = groqResponse.choices.firstOrNull()?.delta?.content
                                if (!delta.isNullOrBlank()) {
                                    tokenCount++
                                    emit(delta)
                                }
                            }
                        } catch (e: Exception) {
                            logger.debug("Skipping line: ${e.message}")
                        }
                    }
                }
            } catch (e: Exception) {
                logger.error("Error reading stream", e)
            }

            logger.info("Groq streaming completed, emitted $tokenCount tokens")
        } catch (e: Exception) {
            logger.error("Error in Groq streaming", e)
            throw e
        }
    }.flowOn(Dispatchers.IO)

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
