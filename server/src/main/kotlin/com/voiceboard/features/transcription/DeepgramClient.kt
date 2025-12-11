package com.voiceboard.features.transcription

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

// Streaming API response
@Serializable
data class DeepgramStreamResponse(
    val type: String,
    val channel: TranscriptChannel? = null
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

            val response: io.ktor.client.statement.HttpResponse = client.post(url) {
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
                    logger.error("Failed to parse Deepgram error response: $responseText")
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
}
