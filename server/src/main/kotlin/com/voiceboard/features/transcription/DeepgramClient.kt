package com.voiceboard.features.transcription

import io.ktor.client.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.websocket.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

// Streaming API response
@Serializable
data class DeepgramStreamResponse(
    val type: String,
    val channel: TranscriptChannel? = null,
    val is_final: Boolean? = null,
    val speech_final: Boolean? = null
)

// Pre-recorded API response
@Serializable
data class DeepgramResponse(
    val results: DeepgramResults
)

// Error response
@Serializable
data class DeepgramErrorResponse(
    val err_code: String,
    val err_msg: String,
    val request_id: String? = null
)

@Serializable
data class DeepgramResults(
    val channels: List<DeepgramChannel>
)

@Serializable
data class DeepgramChannel(
    val alternatives: List<Alternative>
)

@Serializable
data class TranscriptChannel(
    val alternatives: List<Alternative>
)

@Serializable
data class Alternative(
    val transcript: String,
    val confidence: Double? = null
)

class DeepgramClient(
    private val apiKey: String,
    private val client: HttpClient
) {
    private val logger = LoggerFactory.getLogger(DeepgramClient::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Transcribe complete audio file using pre-recorded API (supports WebM)
     */
    suspend fun transcribeAudio(audioData: ByteArray): String = withContext(Dispatchers.IO) {
        try {
            // Check minimum audio size
            if (audioData.size < 100) {
                logger.warn("Audio too small: ${audioData.size} bytes")
                throw IllegalArgumentException("Audio too short - please speak for at least 1 second")
            }

            val url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true"
            logger.info("Sending ${audioData.size} bytes to Deepgram pre-recorded API")

            val response: HttpResponse = client.post(url) {
                header("Authorization", "Token $apiKey")
                header("Content-Type", "audio/webm")
                setBody(audioData)
            }

            val responseText = response.bodyAsText()
            logger.info("Deepgram response: $responseText")

            // Check if response is an error
            if (responseText.contains("err_code")) {
                try {
                    val errorResponse = json.decodeFromString<DeepgramErrorResponse>(responseText)
                    logger.error("Deepgram error: ${errorResponse.err_msg}")
                    throw IllegalStateException("Transcription failed: ${errorResponse.err_msg}")
                } catch (e: kotlinx.serialization.SerializationException) {
                    // If we can't parse the error, throw generic error
                    logger.error("Failed to parse Deepgram error response: $responseText. error: ${e.message}")
                    throw IllegalStateException("Transcription failed - please try again")
                }
            }

            val deepgramResponse = json.decodeFromString<DeepgramResponse>(responseText)
            val transcript = deepgramResponse.results.channels
                .firstOrNull()?.alternatives?.firstOrNull()?.transcript ?: ""

            if (transcript.isBlank()) {
                logger.warn("Empty transcript received")
                throw IllegalStateException("No speech detected - please speak clearly")
            }

            logger.info("Transcript: '$transcript'")
            transcript
        } catch (e: IllegalArgumentException) {
            logger.error("Invalid audio: ${e.message}")
            throw e
        } catch (e: IllegalStateException) {
            logger.error("Transcription error: ${e.message}")
            throw e
        } catch (e: Exception) {
            logger.error("Error transcribing audio with Deepgram", e)
            throw IllegalStateException("Transcription failed - please try again")
        }
    }

    suspend fun streamAudio(
        audioChannel: Channel<ByteArray>,
        transcriptCallback: suspend (String, Boolean) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            // Try encoding=opus for browser MediaRecorder audio
            val url = "wss://api.deepgram.com/v1/listen?model=nova-2&encoding=opus&smart_format=true&interim_results=true&filler_words=true"
            logger.info("Connecting to Deepgram WebSocket: $url")

            client.wss(
                urlString = url,
                request = {
                    headers.append("Authorization", "Token $apiKey")
                }
            ) {
                logger.info("Connected to Deepgram successfully")
                val sendJob = launch {
                    logger.info("Send job started, reading from audio channel...")
                    var chunkCount = 0
                    var totalBytes = 0
                    for (audioData in audioChannel) {
                        totalBytes += audioData.size
                        logger.info("Sending audio chunk #${chunkCount + 1}, size: ${audioData.size} bytes, total: $totalBytes bytes")
                        send(Frame.Binary(true, audioData))
                        chunkCount++
                    }
                    logger.info("Finished sending audio, sent $chunkCount chunks, $totalBytes total bytes")
                    send(Frame.Text("{\"type\": \"CloseStream\"}"))
                }

                val receiveJob = launch {
                    logger.info("Receive job started, listening for Deepgram responses...")
                    try {
                        for (frame in incoming) {
                            logger.info("Received frame from Deepgram, type: ${frame.frameType}")
                            when (frame) {
                                is Frame.Text -> {
                                    val text = frame.readText()
                                    logger.info("Deepgram text frame: $text")
                                    try {
                                        val response = json.decodeFromString<DeepgramStreamResponse>(text)

                                        // Only process transcript results, ignore metadata
                                        if (response.type == "Results" && response.channel != null) {
                                            val transcript = response.channel.alternatives.firstOrNull()?.transcript
                                            val isFinal = response.is_final == true || response.speech_final == true
                                            if (!transcript.isNullOrBlank()) {
                                                logger.info("Transcript (final=$isFinal): $transcript")
                                                transcriptCallback(transcript, isFinal)
                                            }
                                        } else {
                                            logger.info("Received ${response.type} message from Deepgram")
                                        }
                                    } catch (e: Exception) {
                                        logger.warn("Failed to parse Deepgram response: $text", e)
                                    }
                                }
                                is Frame.Close -> {
                                    val reason = frame.readReason()
                                    logger.warn("Deepgram closed connection: code=${reason?.code}, message=${reason?.message}")
                                }
                                else -> {
                                    logger.info("Received non-text frame: ${frame.frameType}")
                                }
                            }
                        }
                    } catch (e: Exception) {
                        logger.error("Error in receive job", e)
                    } finally {
                        logger.info("Receive job ended")
                    }
                }

                sendJob.join()
                receiveJob.join()
            }
        } catch (e: Exception) {
            logger.error("Error in Deepgram streaming", e)
            throw e
        }
    }
}
