FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Switch ke root untuk install dependencies
USER root

# Install Node.js dependencies
WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Create directory untuk session storage
RUN mkdir -p /app/wa-session-prod && \
    chown -R pptruser:pptruser /app

# Switch back to puppeteer user
USER pptruser

EXPOSE 3000

CMD ["npm", "run", "start:mode"]