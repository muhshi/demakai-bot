# ========================================
# 🐳 DEMAKAI BOT DOCKERFILE — FINAL FIX
# ========================================
FROM node:20-alpine

# Buat direktori kerja
WORKDIR /app

# Salin dependency file dulu (lebih efisien untuk caching)
COPY package*.json ./

# Install semua dependency
RUN npm install --production

# Setelah dependency terinstall, baru salin seluruh source code
COPY . .

# Tentukan port
EXPOSE 3000

# Jalankan sesuai BOT_MODE
CMD ["npm", "run", "start:mode"]
