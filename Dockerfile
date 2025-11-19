# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy all source files
COPY . .

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Build the TypeScript project
RUN npm run build

# Runtime stage
FROM node:22-bookworm-slim

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built files and node_modules from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

# Set environment to tell Puppeteer where Chromium is installed
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run as non-root user for security
RUN groupadd -r mcpuser && useradd -r -g mcpuser -G audio,video mcpuser \
    && mkdir -p /home/mcpuser/Downloads \
    && chown -R mcpuser:mcpuser /home/mcpuser \
    && chown -R mcpuser:mcpuser /app

USER mcpuser

# Expose MCP server via stdio
ENTRYPOINT ["node", "build/src/index.js"]
