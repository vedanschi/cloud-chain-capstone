# Step 1: Build the Java application using Maven
FROM maven:3.8.5-openjdk-17 AS build
COPY . /app
WORKDIR /app
RUN mvn clean package

# Step 2: Run the Java application
FROM openjdk:17-slim
COPY --from=build /app/target/cloud-chain-api-1.0-SNAPSHOT.jar /app/app.jar
WORKDIR /app

# Expose the port Render uses
EXPOSE 7070

# Start the application
ENTRYPOINT ["java", "-jar", "app.jar"]
