# ========================================
# 🐳 DEMAKAI BOT DOCKERFILE — FIXED
# ========================================
FROM node:20-alpine

# 1️⃣ Set working directory
WORKDIR /app

# 2️⃣ Copy dependency files
COPY package*.json ./

# 3️⃣ Install dependencies
RUN npm install

# 4️⃣ Copy the rest of the code
COPY . .

# 5️⃣ Expose port
EXPOSE 3000

# 6️⃣ Run the app
CMD ["npm", "run", "start:mode"]
