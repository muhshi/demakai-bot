# ======================================
# 🧱 DOCKERFILE — multi-mode (dev/prod)
# ======================================

FROM node:20-alpine

# Buat direktori kerja
WORKDIR /app

# Copy file package dan install semua dependency
COPY package*.json ./
RUN npm install

# Copy semua source code
COPY . .

# Port default
EXPOSE 3000

# Jalankan sesuai BOT_MODE
CMD ["npm", "run", "start:mode"]
