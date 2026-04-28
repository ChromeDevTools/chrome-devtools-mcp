FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run bundle

FROM node:24-bookworm-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/google-chrome

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gnupg wget \
    && mkdir -p /etc/apt/keyrings \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-linux.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/build ./build
COPY --from=build /app/LICENSE ./LICENSE

ENTRYPOINT ["node", "build/src/bin/chrome-devtools-mcp.js"]
CMD ["--headless", "--chrome-arg=--no-sandbox", "--chrome-arg=--disable-dev-shm-usage"]
