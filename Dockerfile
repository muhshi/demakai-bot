# Gunakan image Node.js yang ringan
FROM node:20-alpine

# Tentukan direktori kerja
WORKDIR /app

# Copy file package dan install dependensi
COPY package*.json ./
RUN npm install --production

# Copy semua source code
COPY . .

# Tentukan port yang digunakan app
EXPOSE 3000

# Jalankan aplikasi
CMD ["npm", "run", "dev"]
