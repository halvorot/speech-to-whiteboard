plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.serialization") version "2.3.0"
    application
}

group = "com.voiceboard"
version = "1.0.0"

application {
    mainClass.set("com.voiceboard.ApplicationKt")
}

repositories {
    mavenCentral()
}

dependencies {
    // Ktor Server
    implementation("io.ktor:ktor-server-core:3.5.0")
    implementation("io.ktor:ktor-server-netty:3.5.0")
    implementation("io.ktor:ktor-server-websockets:3.5.0")
    implementation("io.ktor:ktor-server-content-negotiation:3.5.0")
    implementation("io.ktor:ktor-server-cors:3.5.0")

    // Ktor Client (for Deepgram API)
    implementation("io.ktor:ktor-client-core:3.5.0")
    implementation("io.ktor:ktor-client-cio:3.5.0")
    implementation("io.ktor:ktor-client-websockets:3.5.0")
    implementation("io.ktor:ktor-client-content-negotiation:3.5.0")

    // JSON Serialization
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.5.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // JWT for Supabase token verification
    implementation("com.auth0:java-jwt:4.5.1")
    implementation("com.auth0:jwks-rsa:0.24.1")

    // Logging
    implementation("ch.qos.logback:logback-classic:1.5.34")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")

    // Database
    implementation("org.postgresql:postgresql:42.7.11")
    implementation("com.zaxxer:HikariCP:7.1.0")

    // Testing
    testImplementation("io.ktor:ktor-server-test-host:3.5.0")
    testImplementation("org.jetbrains.kotlin:kotlin-test:2.4.0")
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(21)
}
