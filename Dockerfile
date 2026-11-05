# ClipForge Production Dockerfile
# Optimized for free container platforms (Render, Railway, Fly.io, Koyeb)
FROM node:20-slim

# Install system dependencies: FFmpeg, FFprobe, Python3, and Curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install latest standalone yt-dlp for Linux
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV MAX_UPLOAD_SIZE=1024
ENV CLEANUP_INTERVAL=60

EXPOSE 3000

CMD ["node", "backend/server.js"]

