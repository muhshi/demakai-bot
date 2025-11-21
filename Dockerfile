FROM node:20-alpine

# Install Chromium dan dependencies untuk puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

# Set environment variable untuk Puppeteer menggunakan Chromium system
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:mode"]