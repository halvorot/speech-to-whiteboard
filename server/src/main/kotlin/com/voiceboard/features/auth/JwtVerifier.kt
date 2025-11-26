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

    private val isLocal = supabaseUrl.contains("127.0.0.1") || supabaseUrl.contains("localhost")

    private val algorithm = if (isLocal) {
        logger.info("Using local Supabase JWT verification (HS256)")
        Algorithm.HMAC256("super-secret-jwt-token-with-at-least-32-characters-long")
    } else {
        logger.info("Using production Supabase JWT verification (RS256 via JWKS)")
        val jwksUrl = "$supabaseUrl/auth/v1/jwks"
        val provider = JwkProviderBuilder(URL(jwksUrl))
            .cached(10, 24, TimeUnit.HOURS)
            .rateLimited(10, 1, TimeUnit.MINUTES)
            .build()

        val keyProvider = object : RSAKeyProvider {
            override fun getPublicKeyById(keyId: String): RSAPublicKey {
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
