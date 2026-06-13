FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      gnupg \
      wget \
    && install -m 0755 -d /etc/apt/keyrings \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /etc/apt/keyrings/google-linux-signing-key.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-linux-signing-key.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --include=dev

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "build/src/bin/chrome-devtools-mcp.js", "--chatgpt", "--headless", "--chrome-arg=--no-sandbox", "--chrome-arg=--disable-dev-shm-usage"]
