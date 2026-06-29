FROM node:20-slim

# Install sqlite3 compilation tools if needed, but the backend also supports JSON fallback
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose server port
EXPOSE 3000

# Set environment variable for persistent storage directory
ENV DATA_DIR=/data
ENV PORT=3000
ENV NODE_ENV=production

# Create volume mount point
RUN mkdir -p /data

CMD ["node", "server.js"]
