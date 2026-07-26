plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    application
}

group = "com.voiceboard"
version = "1.0.0"

application {
    mainClass.set("com.voiceboard.ApplicationKt")
}

dependencies {
    // Ktor Server
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.websockets)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.server.cors)

    // Ktor Client (for Deepgram API)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.websockets)
    implementation(libs.ktor.client.content.negotiation)

    // JSON Serialization
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.kotlinx.serialization.json)

    // JWT for Supabase token verification
    implementation(libs.java.jwt)
    implementation(libs.jwks.rsa)

    // Logging
    implementation(libs.logback.classic)

    // Coroutines
    implementation(libs.kotlinx.coroutines.core)

    // Database
    implementation(libs.postgresql)
    implementation(libs.hikari)

    // Testing
    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.kotlin.test)
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(21)
}
