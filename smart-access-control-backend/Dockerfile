# Build context: thư mục gốc repo (để build cả admin-web vào static của backend).
#   docker build -f smart-access-control-backend/Dockerfile .
FROM node:22-alpine AS admin
WORKDIR /src
COPY admin-web/package.json admin-web/package-lock.json admin-web/
RUN cd admin-web && npm ci
COPY admin-web admin-web
COPY smart-access-control-backend/src/main/resources smart-access-control-backend/src/main/resources
RUN cd admin-web && npm run build

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY smart-access-control-backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY smart-access-control-backend/src src
COPY --from=admin /src/smart-access-control-backend/src/main/resources/static src/main/resources/static
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd --system --uid 10001 app && mkdir -p /app/uploads && chown app /app/uploads
COPY --from=build /src/target/smart-access-control-backend-0.0.1-SNAPSHOT.jar app.jar
USER app
EXPOSE 8080
ENV TZ=Asia/Ho_Chi_Minh APP_UPLOAD_DIR=/app/uploads
ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "-jar", "/app/app.jar"]
