# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install http-server globally to serve static files
RUN npm install -g http-server

# Expose port (Railway/Render will assign the port via environment variable)
EXPOSE 3000

# Start the static file server
CMD ["http-server", "-p", "3000", "-g"]
