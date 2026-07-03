FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app

COPY gradle gradle
COPY gradlew gradlew.bat gradle.properties settings.gradle.kts build.gradle.kts ./

RUN chmod +x gradlew \
  && ./gradlew dependencies --no-daemon

COPY src src

RUN ./gradlew installDist --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN apk add --no-cache wget \
  && addgroup -S voiceboard \
  && adduser -S voiceboard -G voiceboard

COPY --from=builder --chown=voiceboard:voiceboard /app/build/install/voiceboard-server /app

USER voiceboard

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/app/bin/voiceboard-server"]
