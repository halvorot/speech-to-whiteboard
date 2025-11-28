package com.voiceboard.features.auth

import com.auth0.jwk.JwkProviderBuilder
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import com.auth0.jwt.interfaces.RSAKeyProvider
import org.slf4j.LoggerFactory
import java.net.URI
import java.security.interfaces.RSAPrivateKey
import java.security.interfaces.RSAPublicKey
import java.util.concurrent.TimeUnit

class JwtVerifier(supabaseUrl: String) {
    private val logger = LoggerFactory.getLogger(JwtVerifier::class.java)

    private val isLocal = supabaseUrl.contains("127.0.0.1") || supabaseUrl.contains("localhost")

    // RS256 algorithm for production (JWKS)
    private val rs256Algorithm by lazy {
        logger.info("Initializing RS256 JWT verification via JWKS")
        val jwksUrl = "$supabaseUrl/auth/v1/jwks"
        logger.info("JWKS endpoint: $jwksUrl")

        val provider = JwkProviderBuilder(URI(jwksUrl).toURL())
            .cached(10, 24, TimeUnit.HOURS)
            .rateLimited(10, 1, TimeUnit.MINUTES)
            .build()

        val keyProvider = object : RSAKeyProvider {
            override fun getPublicKeyById(keyId: String): RSAPublicKey {
                logger.debug("Fetching public key for keyId: $keyId")
                return provider.get(keyId).publicKey as RSAPublicKey
            }

            override fun getPrivateKey(): RSAPrivateKey? = null
            override fun getPrivateKeyId(): String? = null
        }

        Algorithm.RSA256(keyProvider)
    }

    // HS256 algorithm for local dev
    private val hs256Algorithm by lazy {
        logger.info("Initializing HS256 JWT verification with local secret")
        Algorithm.HMAC256("super-secret-jwt-token-with-at-least-32-characters-long")
    }

    fun verify(token: String): Result<String> {
        return try {
            // Decode without verification to detect algorithm
            val decoded = JWT.decode(token)
            logger.info("Token algorithm: ${decoded.algorithm}, keyId: ${decoded.keyId}, issuer: ${decoded.issuer}")

            // Select algorithm based on token and environment
            val algorithm = when (decoded.algorithm) {
                "HS256" -> {
                    if (!isLocal) {
                        logger.warn("HS256 token received in production - this is unexpected")
                    }
                    hs256Algorithm
                }
                "RS256" -> rs256Algorithm
                else -> {
                    logger.error("Unsupported algorithm: ${decoded.algorithm}")
                    return Result.failure(JWTVerificationException("Unsupported algorithm: ${decoded.algorithm}"))
                }
            }

            // Verify with detected algorithm
            val verifier = JWT.require(algorithm)
                .acceptLeeway(10)
                .build()

            val decodedJWT = verifier.verify(token)
            val userId = decodedJWT.subject
            logger.info("JWT verified successfully for user: $userId using ${decoded.algorithm}")
            Result.success(userId)
        } catch (e: JWTVerificationException) {
            logger.error("JWT verification failed: ${e.message}", e)
            Result.failure(e)
        }
    }
}
