# syntax=docker/dockerfile:1.7
# ─── Build stage ──────────────────────────────────────────
# Use the official Maven + Temurin 21 image so `mvn` is on PATH out of the box.
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /workspace

# Copy ALL module poms first so the multi-module parent can be parsed.
# (Maven errors out if any <module> directory is missing on disk, even when
# we only build one module via `-pl`.) Sources for the unused modules stay
# out of the image, so they aren't compiled.
COPY pom.xml ./
COPY common/pom.xml         common/pom.xml
COPY price-service/pom.xml  price-service/pom.xml
COPY ai-service/pom.xml     ai-service/pom.xml
COPY gateway/pom.xml        gateway/pom.xml

# Pre-fetch dependencies for the modules we actually need (cacheable layer).
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -f pom.xml -pl common,price-service -am dependency:go-offline

# Now copy the sources we need and build the fat JAR.
COPY common         common
COPY price-service  price-service
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -f pom.xml -pl price-service -am -DskipTests package

# ─── Runtime stage ───────────────────────────────────────
# Alpine JRE (small + has wget for compose healthchecks). Non-root user.
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S -G app app
COPY --from=builder --chown=app:app /workspace/price-service/target/*.jar /app/app.jar
USER app
EXPOSE 8081 9081
ENV JAVA_TOOL_OPTIONS="-XX:+UseG1GC -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
