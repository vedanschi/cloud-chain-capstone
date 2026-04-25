# Step 1: Build the Java application using Maven
FROM maven:3.9-eclipse-temurin-17 AS build
COPY . /app
WORKDIR /app
RUN mvn clean package

# Step 2: Run the Java application
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copy the compiled Java application
COPY --from=build /app/target/cloud-chain-api-1.0-SNAPSHOT.jar /app/app.jar

# CRITICAL FIX: Copy the synthetic datasets so the engine has data to process!
COPY --from=build /app/*.csv /app/

# Expose the port Render uses
EXPOSE 7070

# Explicitly declare the classpath to prevent Manifest errors
ENTRYPOINT ["java", "-cp", "app.jar", "TransshipmentOptimizer"]
