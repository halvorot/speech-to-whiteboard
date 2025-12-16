package com.voiceboard.features.persistence

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import javax.sql.DataSource

/**
 * Database configuration and connection pooling
 */
object DatabaseConfig {
    private var dataSource: HikariDataSource? = null

    /**
     * Initialize the database connection pool
     */
    fun init(databaseUrl: String) {
        if (dataSource != null) {
            return // Already initialized
        }

        val (baseUrl, query) = if (databaseUrl.contains("?")) {
            databaseUrl.split("?", limit = 2)
        } else {
            listOf(databaseUrl, null)
        }

        val queryParams = query?.split('&')?.mapNotNull {
            it.split('=', limit = 2).let { parts ->
                if (parts.size == 2) parts[0] to parts[1] else null
            }
        }?.associate { it } ?: emptyMap()


        val remainingParams = queryParams.filterKeys { it != "user" && it != "password" }
        val cleanJdbcUrl = if (remainingParams.isNotEmpty()) {
            baseUrl + "?" + remainingParams.map { "${it.key}=${it.value}" }.joinToString("&")
        } else {
            baseUrl
        }

        val config = HikariConfig().apply {
            jdbcUrl = cleanJdbcUrl
            username = queryParams["user"]
            password = queryParams["password"]
            driverClassName = "org.postgresql.Driver"
            maximumPoolSize = 10
            minimumIdle = 2
            idleTimeout = 300000 // 5 minutes
            connectionTimeout = 20000 // 20 seconds
            poolName = "VoiceboardHikariPool"
        }

        dataSource = HikariDataSource(config)
    }

    /**
     * Get the data source for database operations
     */
    fun getDataSource(): DataSource {
        return dataSource ?: throw IllegalStateException("Database not initialized. Call init() first.")
    }

    /**
     * Close the connection pool (for cleanup)
     */
    fun close() {
        dataSource?.close()
        dataSource = null
    }
}
