# syntax=docker/dockerfile:1.7
FROM maven:3-eclipse-temurin-26 AS builder
WORKDIR /workspace

COPY pom.xml ./
COPY common/pom.xml         common/pom.xml
COPY price-service/pom.xml  price-service/pom.xml
COPY ai-service/pom.xml     ai-service/pom.xml
COPY gateway/pom.xml        gateway/pom.xml

RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -f pom.xml -pl common,gateway -am dependency:go-offline

COPY common   common
COPY gateway  gateway
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -f pom.xml -pl gateway -am -DskipTests package

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S -G app app
COPY --from=builder --chown=app:app /workspace/gateway/target/*.jar /app/app.jar
USER app
EXPOSE 8080 9080
ENV JAVA_TOOL_OPTIONS="-XX:+UseG1GC -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
