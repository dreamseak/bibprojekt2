# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install http-server globally to serve static files
RUN npm install -g http-server

# Expose port
EXPOSE 8080

# Start the static file server on the port provided by Railway (defaults to 8080)
CMD ["sh", "-c", "http-server -p ${PORT:-8080}"]
