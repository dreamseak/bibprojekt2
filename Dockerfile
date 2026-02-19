# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy all files (frontend + backend)
COPY . .

# Expose port (Railway/Render will assign the port via environment variable)
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
