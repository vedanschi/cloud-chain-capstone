# Step 1: Build the Java application using Maven
FROM maven:3.9-eclipse-temurin-17 AS build
COPY . /app
WORKDIR /app
RUN mvn clean package

# Step 2: Run the Java application
FROM eclipse-temurin:17-jre-alpine
COPY --from=build /app/target/cloud-chain-api-1.0-SNAPSHOT.jar /app/app.jar
WORKDIR /app

# Expose the port Render uses
EXPOSE 7070

# Start the application
ENTRYPOINT ["java", "-jar", "app.jar"]
