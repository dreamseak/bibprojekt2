# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
RUN cd backend && npm install --production && cd ..

# Copy all files (frontend + backend)
COPY . .

# Expose port (Railway will assign via PORT environment variable)
EXPOSE 3000

# Start the Express backend server
CMD ["node", "backend/server.js"]
