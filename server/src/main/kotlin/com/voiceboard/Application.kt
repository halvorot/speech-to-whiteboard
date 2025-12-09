package com.voiceboard

import com.voiceboard.features.ai.GraphStateManager
import com.voiceboard.features.ai.GraphSyncMessage
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

            try {
                for (frame in incoming) {
                    when (frame) {
                        is Frame.Binary -> {
                            val audioData = frame.data
                            logger.info("Received complete audio, size: ${audioData.size} bytes")

                            // Transcribe using pre-recorded API
                            launch {
                                try {
                                    val transcript = deepgramClient.transcribeAudio(audioData)
                                    logger.info("Transcript: '$transcript'")

                                    if (transcript.isNotBlank()) {
                                        // Send transcript to client
                                        send(Frame.Text(transcript))

                                        // Get commands from Groq
                                        try {
                                            val graphSummary = graphState.toSummary()
                                            logger.info("Current graph: $graphSummary")

                                            val sketchResponse = groqClient.getCommands(graphSummary, transcript)
                                            logger.info("Got ${sketchResponse.actions.size} actions from Groq")

                                            // Apply actions to graph state
                                            sketchResponse.actions.forEach { action ->
                                                val applied = graphState.applyAction(action)
                                                if (applied) {
                                                    logger.info("Applied action: $action")
                                                } else {
                                                    logger.warn("Failed to apply action: $action")
                                                }
                                            }

                                            // Send JSON commands to client
                                            val jsonResponse = Json.encodeToString(SketchResponse.serializer(), sketchResponse)
                                            send(Frame.Text(jsonResponse))
                                            logger.info("Sent sketch commands to client")
                                        } catch (e: Exception) {
                                            logger.error("Error processing transcript with Groq", e)
                                            // Send error to client
                                            send(Frame.Text("ERROR: Failed to generate diagram - ${e.message ?: "please try again"}"))
                                        }
                                    } else {
                                        logger.warn("Empty transcript received")
                                        send(Frame.Text("ERROR: No speech detected - please speak clearly"))
                                    }
                                } catch (e: IllegalArgumentException) {
                                    logger.error("Invalid audio: ${e.message}")
                                    send(Frame.Text("ERROR: ${e.message}"))
                                } catch (e: IllegalStateException) {
                                    logger.error("Transcription error: ${e.message}")
                                    send(Frame.Text("ERROR: ${e.message}"))
                                } catch (e: Exception) {
                                    logger.error("Error transcribing audio", e)
                                    send(Frame.Text("ERROR: Transcription failed - please try again"))
                                }
                            }
                        }
                        is Frame.Text -> {
                            val text = frame.readText()
                            logger.debug("Received text message: $text")

                            // Try to parse as graph sync message
                            try {
                                val syncMessage = Json.decodeFromString(GraphSyncMessage.serializer(), text)
                                if (syncMessage.type == "graph_sync") {
                                    graphState.syncFrom(syncMessage)
                                    logger.info("Graph state synced: ${syncMessage.nodes.size} nodes, ${syncMessage.edges.size} edges")
                                }
                            } catch (e: Exception) {
                                // Not a graph sync message, ignore
                                logger.debug("Text message is not a graph sync: ${e.message}")
                            }
                        }
                        else -> {}
                    }
                }
            } finally {
                graphStateManager.remove(userId)
                logger.info("User $userId disconnected from WebSocket")
            }
        }
    }
}
