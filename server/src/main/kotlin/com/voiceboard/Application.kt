package com.voiceboard

import com.voiceboard.features.ai.GraphStateManager
import com.voiceboard.features.ai.GroqClient
import com.voiceboard.features.ai.SketchResponse
import com.voiceboard.features.auth.JwtVerifier
import com.voiceboard.features.transcription.DeepgramClient
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import kotlin.time.Duration.Companion.seconds

private val logger = LoggerFactory.getLogger("Application")

fun main() {
    embeddedServer(Netty, port = 8080, host = "0.0.0.0", module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    // Load environment variables
    val supabaseUrl = System.getenv("SUPABASE_URL")
        ?: throw IllegalStateException("SUPABASE_URL not set")
    val deepgramApiKey = System.getenv("DEEPGRAM_API_KEY")
        ?: throw IllegalStateException("DEEPGRAM_API_KEY not set")
    val groqApiKey = System.getenv("GROQ_API_KEY")
        ?: throw IllegalStateException("GROQ_API_KEY not set")

    val jwtVerifier = JwtVerifier(supabaseUrl)
    val graphStateManager = GraphStateManager()

    val httpClient = HttpClient(CIO) {
        install(io.ktor.client.plugins.websocket.WebSockets)
        install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
            })
        }

        engine {
            requestTimeout = 60000
            endpoint {
                connectTimeout = 30000
                socketTimeout = 60000
            }
        }
    }

    val deepgramClient = DeepgramClient(deepgramApiKey, httpClient)
    val groqClient = GroqClient(groqApiKey, httpClient)

    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
            ignoreUnknownKeys = true
        })
    }

    install(CORS) {
        anyHost()
        allowHeader("Authorization")
        allowHeader("Content-Type")
    }

    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 300.seconds
    }

    routing {
        get("/health") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "healthy"))
        }

        webSocket("/ws") {
            // Extract and verify JWT token from query parameter
            val token = call.request.queryParameters["token"]
            if (token == null) {
                logger.warn("WebSocket connection attempt without token")
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Missing authentication token"))
                return@webSocket
            }

            val userIdResult = jwtVerifier.verify(token)

            if (userIdResult.isFailure) {
                logger.warn("JWT verification failed: ${userIdResult.exceptionOrNull()?.message}")
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Invalid JWT token"))
                return@webSocket
            }

            val userId = userIdResult.getOrThrow()
            logger.info("User $userId connected to WebSocket")

            send("Connected to VoiceBoard server")

            val graphState = graphStateManager.getOrCreate(userId)

            var audioChannel: Channel<ByteArray>? = null
            val transcriptBuffer = StringBuilder()

            try {
                for (frame in incoming) {
                    when (frame) {
                        is Frame.Binary -> {
                            val audioData = frame.data
                            logger.info("Received audio chunk, size: ${audioData.size} bytes")

                            // Initialize streaming on first chunk
                            if (audioChannel == null) {
                                logger.info("Starting audio streaming session")
                                val newChannel = Channel<ByteArray>(Channel.UNLIMITED)
                                audioChannel = newChannel
                                transcriptBuffer.clear()

                                // Start Deepgram streaming in background
                                launch {
                                    try {
                                        deepgramClient.streamAudio(newChannel) { transcript, isFinal ->
                                            logger.info("Received transcript (final=$isFinal): '$transcript'")

                                            // Buffer final transcripts for Groq
                                            if (isFinal) {
                                                transcriptBuffer.append(transcript).append(" ")
                                            }

                                            // Send transcripts to client with marker
                                            // Format: "INTERIM:text" or "FINAL:text"
                                            val prefix = if (isFinal) "FINAL:" else "INTERIM:"
                                            send(Frame.Text("$prefix$transcript"))
                                        }
                                        logger.info("Deepgram streaming ended")
                                    } catch (e: Exception) {
                                        logger.error("Error in Deepgram streaming", e)
                                        send(Frame.Text("ERROR: Transcription failed - ${e.message ?: "please try again"}"))
                                    }
                                }
                            }

                            // Send audio chunk to Deepgram
                            audioChannel.send(audioData)
                        }
                        is Frame.Text -> {
                            val text = frame.readText()
                            logger.info("Received text message: $text")

                            if (text == "STOP_RECORDING") {
                                logger.info("Stop recording requested")

                                // Close audio channel to signal end of stream
                                audioChannel?.close()

                                // Wait for Deepgram to finish processing final audio chunks
                                kotlinx.coroutines.delay(2000)

                                val fullTranscript = transcriptBuffer.toString().trim()
                                logger.info("Full transcript: '$fullTranscript'")

                                if (fullTranscript.isNotBlank()) {
                                    // Process with Groq - stream and buffer response
                                    launch {
                                        try {
                                            val graphSummary = graphState.toSummary()
                                            logger.info("Current graph: $graphSummary")

                                            val jsonBuffer = StringBuilder()

                                            // Stream Groq response and buffer
                                            groqClient.streamCommands(graphSummary, fullTranscript).collect { chunk ->
                                                jsonBuffer.append(chunk)
                                            }

                                            val fullJson = jsonBuffer.toString()
                                            logger.info("Complete Groq response: $fullJson")

                                            // Parse the complete JSON response
                                            val cleanedContent = when {
                                                fullJson.contains("```json") -> {
                                                    val start = fullJson.indexOf("```json") + 7
                                                    val end = fullJson.indexOf("```", start)
                                                    if (end > start) fullJson.substring(start, end).trim()
                                                    else fullJson.trim()
                                                }
                                                fullJson.contains("```") -> {
                                                    val start = fullJson.indexOf("```") + 3
                                                    val end = fullJson.indexOf("```", start)
                                                    if (end > start) fullJson.substring(start, end).trim()
                                                    else fullJson.trim()
                                                }
                                                fullJson.contains("{") -> {
                                                    val start = fullJson.indexOf("{")
                                                    val end = fullJson.lastIndexOf("}") + 1
                                                    if (end > start) fullJson.substring(start, end).trim()
                                                    else fullJson.trim()
                                                }
                                                else -> fullJson.trim()
                                            }

                                            val sketchResponse = if (cleanedContent.trimStart().startsWith("[")) {
                                                val actions = Json.decodeFromString<List<com.voiceboard.features.ai.SketchAction>>(cleanedContent)
                                                SketchResponse(actions)
                                            } else {
                                                Json.decodeFromString<SketchResponse>(cleanedContent)
                                            }

                                            logger.info("Parsed ${sketchResponse.actions.size} actions from Groq")

                                            // Apply actions to graph state
                                            sketchResponse.actions.forEach { action ->
                                                val applied = graphState.applyAction(action)
                                                if (applied) {
                                                    logger.info("Applied action: $action")
                                                } else {
                                                    logger.warn("Failed to apply action: $action")
                                                }
                                            }

                                            // Send complete JSON to client
                                            val jsonResponse = Json.encodeToString(SketchResponse.serializer(), sketchResponse)
                                            send(Frame.Text(jsonResponse))
                                            logger.info("Sent sketch commands to client")

                                            // Reset for next recording
                                            audioChannel = null
                                            transcriptBuffer.clear()
                                        } catch (e: Exception) {
                                            logger.error("Error processing with Groq", e)
                                            send(Frame.Text("ERROR: Failed to generate diagram - ${e.message ?: "please try again"}"))

                                            // Reset state
                                            audioChannel = null
                                            transcriptBuffer.clear()
                                        }
                                    }
                                } else {
                                    logger.warn("Empty transcript")
                                    send(Frame.Text("ERROR: No speech detected - please speak clearly"))
                                    audioChannel = null
                                    transcriptBuffer.clear()
                                }
                            }
                        }
                        else -> {}
                    }
                }
            } finally {
                audioChannel?.close()
                graphStateManager.remove(userId)
                logger.info("User $userId disconnected from WebSocket")
            }
        }
    }
}
