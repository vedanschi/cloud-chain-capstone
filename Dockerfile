# Step 1: Build the Java application using Maven
FROM maven:3.9-eclipse-temurin-17 AS build
COPY . /app
WORKDIR /app
RUN mvn clean package

# Step 2: Run the Java application (Standard JRE, No Alpine)
FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy the compiled Java application
COPY --from=build /app/target/cloud-chain-api-1.0-SNAPSHOT.jar /app/app.jar

# Copy the synthetic datasets
COPY --from=build /app/*.csv /app/

# Expose the port Render uses
EXPOSE 7070

# Explicitly declare memory limits so Render doesn't kill the container
ENTRYPOINT ["java", "-Xmx256m", "-jar", "app.jar"]
