package com.voiceboard.features.auth

import com.auth0.jwk.JwkProviderBuilder
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import com.auth0.jwt.interfaces.RSAKeyProvider
import org.slf4j.LoggerFactory
import java.net.URL
import java.security.interfaces.RSAPrivateKey
import java.security.interfaces.RSAPublicKey
import java.util.concurrent.TimeUnit

class JwtVerifier(supabaseUrl: String) {
    private val logger = LoggerFactory.getLogger(JwtVerifier::class.java)

    private val algorithm = let {
        // Default: Use RS256 with JWKS (modern, secure approach)
        logger.info("Using RS256 JWT verification via JWKS (recommended)")
        val jwksUrl = "$supabaseUrl/auth/v1/jwks"
        logger.info("JWKS endpoint: $jwksUrl")

        val provider = JwkProviderBuilder(URL(jwksUrl))
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


    private val verifier = JWT.require(algorithm)
        .acceptLeeway(10)
        .build()

    fun verify(token: String): Result<String> {
        return try {
            // Decode without verification first to see what algorithm is used
            val decoded = JWT.decode(token)
            logger.info("Token algorithm: ${decoded.algorithm}, keyId: ${decoded.keyId}, issuer: ${decoded.issuer}")

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
