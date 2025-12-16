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

        val config = HikariConfig().apply {
            jdbcUrl = databaseUrl
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
