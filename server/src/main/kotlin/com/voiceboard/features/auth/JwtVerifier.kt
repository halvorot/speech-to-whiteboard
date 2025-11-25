package com.voiceboard.features.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import org.slf4j.LoggerFactory

class JwtVerifier(supabaseUrl: String) {
    private val logger = LoggerFactory.getLogger(JwtVerifier::class.java)

    // Local Supabase uses HS256 with a known secret
    // Production Supabase uses RS256 with JWKS
    private val isLocal = supabaseUrl.contains("127.0.0.1") || supabaseUrl.contains("localhost")

    private val algorithm = if (isLocal) {
        // Local Supabase demo JWT secret
        logger.info("Using local Supabase JWT verification (HS256)")
        Algorithm.HMAC256("super-secret-jwt-token-with-at-least-32-characters-long")
    } else {
        // For production, you'd use JWKS with RS256
        // For now, fallback to same secret (update this for production)
        logger.warn("Production mode detected but using HS256 - update to use JWKS for production!")
        Algorithm.HMAC256("super-secret-jwt-token-with-at-least-32-characters-long")
    }

    private val verifier = JWT.require(algorithm)
        // Don't validate issuer for local dev (can vary)
        .acceptLeeway(10) // Allow 10 seconds clock skew
        .build()

    fun verify(token: String): Result<String> {
        return try {
            val decodedJWT = verifier.verify(token)
            val userId = decodedJWT.subject
            logger.debug("JWT verified successfully for user: $userId")
            Result.success(userId)
        } catch (e: JWTVerificationException) {
            logger.error("JWT verification failed: ${e.message}", e)
            Result.failure(e)
        }
    }
}
