# Stage 1: Build
FROM gradle:8-jdk21-alpine AS builder

WORKDIR /app

# Copy gradle wrapper and config files for dependency caching
COPY gradle gradle
COPY gradlew gradlew.bat gradle.properties settings.gradle.kts build.gradle.kts ./

# Download dependencies (cached layer)
RUN ./gradlew dependencies --no-daemon

# Copy source code
COPY src src

# Build the application
RUN ./gradlew installDist --no-daemon

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -S voiceboard && adduser -S voiceboard -G voiceboard

# Copy built application from builder
COPY --from=builder /app/build/install/voiceboard-server /app

# Change ownership
RUN chown -R voiceboard:voiceboard /app

# Switch to non-root user
USER voiceboard

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/app/bin/voiceboard-server"]
