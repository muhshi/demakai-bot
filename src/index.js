import "dotenv/config";
import express from "express";
import { connectDB, disconnectDB } from "./db.js";
import { checkOllamaHealth } from "./embedding.js";

/**
 * Main entry point — DemakAI WhatsApp Bot
 * Supports:
 * - Development Mode: whatsapp-web.js (QR scan)
 * - Production Mode: Mimmach HTTP API + Webhook
 */

const MODE = process.env.BOT_MODE; // default = dev

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("🤖 DemakAI WhatsApp Bot");
  console.log(`   Mode: ${MODE === "dev" ? "Development" : "Production"}`);
  console.log("═══════════════════════════════════════\n");

  // 1️⃣ Validate environment
  validateEnvironment();

  // 2️⃣ Connect to MongoDB
  try {
    await connectDB();
    console.log("✅ MongoDB connected\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }

  // 3️⃣ Show LLM provider info
  showLLMProviderInfo();

  // 4️⃣ Check Ollama (for embeddings)
  await showOllamaHealth();

  // 5️⃣ Start bot
  if (MODE === "dev") await startDevMode();
  else await startProdMode();

  // 6️⃣ Graceful shutdown
  setupGracefulShutdown();
}

/**
 * Detect and display current LLM provider
 */
function showLLMProviderInfo() {
  const base = process.env.LLM_BASE_URL || "";
  const model = process.env.LLM_MODEL || "Unknown";
  let provider = "Tidak diketahui";

  if (base.includes("googleapis")) provider = "Gemini API (Google)";
  else if (base.includes("openai.com")) provider = "OpenAI API";
  else if (base.includes("groq")) provider = "Groq API";
  else if (base.includes("localhost") || base.includes("11434"))
    provider = "Ollama Lokal";

  console.log("🧠 LLM Provider Information");
  console.log(`   Provider : ${provider}`);
  console.log(`   Model    : ${model}`);
  console.log(`   Base URL : ${base}\n`);
}

/**
 * Check Ollama local service (for embeddings)
 */
async function showOllamaHealth() {
  console.log("🧩 Checking local Ollama service...");
  try {
    const health = await checkOllamaHealth();

    if (!health.available) {
      console.warn("⚠️ Ollama not available (only affects embeddings).");
      console.warn("   Jalankan: ollama serve\n");
    } else {
      console.log("✅ Ollama is running");
      console.log(
        `   Embedding model: ${health.embeddingModelLoaded ? "✅" : "⚠️"} ${
          process.env.EMBEDDING_MODEL
        }\n`
      );
    }
  } catch (err) {
    console.error("❌ Error checking Ollama:", err.message);
  }
}

/**
 * DEVELOPMENT MODE (whatsapp-web.js)
 */
async function startDevMode() {
  console.log("🔧 Starting in DEVELOPMENT mode...\n");
  const { startDevBot } = await import("./wa.bot.js");

  try {
    await startDevBot();
  } catch (error) {
    console.error("❌ Failed to start dev bot:", error.message);
    process.exit(1);
  }
}

/**
 * PRODUCTION MODE (Mimmach API + Webhook)
 */
async function startProdMode() {
  console.log("🚀 Starting in PRODUCTION mode...\n");

  const { WhatsAppClient, handleWebhook } = await import("./waClient.js");
  const waClient = new WhatsAppClient();
  global.waClient = waClient;

  try {
    await waClient.initialize();
    waClient.startHealthCheck();
  } catch (error) {
    console.error("❌ WhatsApp initialization failed:", error.message);
    console.log("   Ensure WA API is running at:", process.env.WA_API_BASE_URL);
  }

  const app = express();
  app.use(express.json());

  // Webhook endpoint
  app.post("/webhook", handleWebhook);

  // Health check endpoint
  app.get("/health", async (req, res) => {
    const waStatus = await waClient.getSessionStatus();
    const ollamaHealth = await checkOllamaHealth();
    const base = process.env.LLM_BASE_URL || "";
    const model = process.env.LLM_MODEL || "Unknown";

    let provider = "Tidak diketahui";
    if (base.includes("googleapis")) provider = "Gemini API (Google)";
    else if (base.includes("openai.com")) provider = "OpenAI API";
    else if (base.includes("groq")) provider = "Groq API";
    else if (base.includes("localhost") || base.includes("11434"))
      provider = "Ollama Lokal";

    res.json({
      status: "ok",
      mode: MODE,
      whatsapp: {
        ready: waClient.isReady,
        state: waStatus.state,
      },
      embedding: {
        available: ollamaHealth.available,
        model: process.env.EMBEDDING_MODEL,
      },
      llm: {
        provider,
        base_url: base,
        model,
      },
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Webhook server running on port ${PORT}`);
    console.log(`   Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });

  try {
    const webhookUrl =
      process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook`;
    await waClient.setupWebhook(webhookUrl);
  } catch (error) {
    console.warn("⚠️ Failed to setup webhook:", error.message);
  }

  console.log("✨ Production mode ready!");
  console.log("📱 Bot is now listening for messages via webhook\n");
}

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const required = [
    "MONGO_URI",
    "OLLAMA_BASE_URL",
    "EMBEDDING_MODEL",
    "LLM_BASE_URL",
    "LLM_MODEL",
  ];

  if (MODE === "prod") required.push("WA_API_BASE_URL");

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error("\nCheck your .env file before running the bot.\n");
    process.exit(1);
  }

  console.log("✅ Environment variables validated\n");
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    try {
      await disconnectDB();
      console.log("✅ Database disconnected");
    } catch (error) {
      console.error("❌ Error during shutdown:", error.message);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/**
 * Global error handlers
 */
process.on("uncaughtException", (error) => {
  console.error("\n💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("\n💥 Unhandled Rejection:", reason);
  process.exit(1);
});

// 🚀 Start the bot
main().catch((error) => {
  console.error("💥 Fatal error:", error.message);
  process.exit(1);
});
