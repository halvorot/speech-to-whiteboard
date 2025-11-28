package com.voiceboard.features.auth

import com.auth0.jwk.JwkProviderBuilder
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import com.auth0.jwt.interfaces.ECDSAKeyProvider
import com.auth0.jwt.interfaces.RSAKeyProvider
import org.slf4j.LoggerFactory
import java.net.URI
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.interfaces.RSAPrivateKey
import java.security.interfaces.RSAPublicKey
import java.util.concurrent.TimeUnit

class JwtVerifier(supabaseUrl: String) {
    private val logger = LoggerFactory.getLogger(JwtVerifier::class.java)

    private val isLocal = supabaseUrl.contains("127.0.0.1") || supabaseUrl.contains("localhost")

    // JWKS provider (lazy-initialized, supports both RSA and EC keys)
    private val jwksProvider by lazy {
        logger.info("Initializing JWKS provider")
        val jwksUrl = "$supabaseUrl/auth/v1/.well-known/jwks.json"
        logger.info("JWKS endpoint: $jwksUrl")

        JwkProviderBuilder(URI(jwksUrl).toURL())
            .cached(10, 24, TimeUnit.HOURS)
            .rateLimited(10, 1, TimeUnit.MINUTES)
            .build()
    }

    // RS256 algorithm (JWKS)
    private val rs256Algorithm by lazy {
        val keyProvider = object : RSAKeyProvider {
            override fun getPublicKeyById(keyId: String): RSAPublicKey {
                logger.debug("Fetching RSA public key for keyId: $keyId")
                return jwksProvider.get(keyId).publicKey as RSAPublicKey
            }

            override fun getPrivateKey(): RSAPrivateKey? = null
            override fun getPrivateKeyId(): String? = null
        }

        Algorithm.RSA256(keyProvider)
    }

    // ES256 algorithm (JWKS)
    private val es256Algorithm by lazy {
        val keyProvider = object : ECDSAKeyProvider {
            override fun getPublicKeyById(keyId: String): ECPublicKey {
                logger.debug("Fetching EC public key for keyId: $keyId")
                return jwksProvider.get(keyId).publicKey as ECPublicKey
            }

            override fun getPrivateKey(): ECPrivateKey? = null
            override fun getPrivateKeyId(): String? = null
        }

        Algorithm.ECDSA256(keyProvider)
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

            // Select algorithm based on token
            val algorithm = when (decoded.algorithm) {
                "HS256" -> {
                    if (!isLocal) {
                        logger.warn("HS256 token received in production - this is unexpected")
                    }
                    hs256Algorithm
                }
                "RS256" -> {
                    logger.info("Using RS256 verification")
                    rs256Algorithm
                }
                "ES256" -> {
                    logger.info("Using ES256 verification (modern, recommended)")
                    es256Algorithm
                }
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
