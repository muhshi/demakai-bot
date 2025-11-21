FROM node:20-alpine

# Install Chromium dan dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# Set Puppeteer environment
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Create session directory with proper permissions
RUN mkdir -p /app/wa-session-prod && \
    chmod 777 /app/wa-session-prod

EXPOSE 3000

CMD ["npm", "run", "start:mode"]