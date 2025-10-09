import "dotenv/config";
import express from "express";
import { connectDB, disconnectDB } from "./db.js";
import { checkOllamaHealth } from "./embedding.js";

/**
 * Main application entry point
 * Support both:
 * - Development mode: whatsapp-web.js (QR scan)
 * - Production mode: Mimmach HTTP API (webhook)
 */

const MODE = process.env.BOT_MODE || "dev"; // "dev" or "prod"

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("🤖 DemakAI WhatsApp Bot");
  console.log(`   Mode: ${MODE === "dev" ? "Development" : "Production"}`);
  console.log("═══════════════════════════════════════\n");

  // 1. Validate environment
  validateEnvironment();

  // 2. Connect to database
  try {
    await connectDB();
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }

  // 3. Check Ollama health
  const health = await checkOllamaHealth();
  if (!health.available) {
    console.warn("⚠️ Ollama not available!");
    console.warn("   Start Ollama: ollama serve\n");
  } else {
    console.log("✅ Ollama is running");
    console.log(
      `   LLM: ${health.llmModelLoaded ? "✅" : "⚠️"} ${process.env.LLM_MODEL}`
    );
    console.log(
      `   Embedding: ${health.embeddingModelLoaded ? "✅" : "⚠️"} ${
        process.env.EMBEDDING_MODEL
      }\n`
    );
  }

  // 4. Start bot based on mode
  if (MODE === "dev") {
    await startDevMode();
  } else {
    await startProdMode();
  }

  // 5. Graceful shutdown
  setupGracefulShutdown();
}

/**
 * Development Mode - whatsapp-web.js
 */
async function startDevMode() {
  console.log("🔧 Starting in DEVELOPMENT mode...\n");

  const { startDevBot } = await import("./wa.bot.js");

  try {
    await startDevBot();
  } catch (error) {
    console.error("❌ Failed to start dev bot:", error);
    process.exit(1);
  }
}

/**
 * Production Mode - Mimmach HTTP API + Webhook
 */
async function startProdMode() {
  console.log("🚀 Starting in PRODUCTION mode...\n");

  const { WhatsAppClient, handleWebhook } = await import("./waClient.js");

  // Initialize WA client
  const waClient = new WhatsAppClient();
  global.waClient = waClient; // Store globally for webhook

  try {
    await waClient.initialize();
    waClient.startHealthCheck();
  } catch (error) {
    console.error("❌ WhatsApp initialization failed:", error);
    console.log(
      "   Make sure WA API is running at:",
      process.env.WA_API_BASE_URL
    );
  }

  // Setup Express server for webhook
  const app = express();
  app.use(express.json());

  // Webhook endpoint
  app.post("/webhook", handleWebhook);

  // Health check endpoint
  app.get("/health", async (req, res) => {
    const waStatus = await waClient.getSessionStatus();
    const ollamaHealth = await checkOllamaHealth();

    res.json({
      status: "ok",
      whatsapp: {
        ready: waClient.isReady,
        state: waStatus.state,
      },
      ollama: {
        available: ollamaHealth.available,
        llmModel: process.env.LLM_MODEL,
        embeddingModel: process.env.EMBEDDING_MODEL,
      },
    });
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n✅ Webhook server running on port ${PORT}`);
    console.log(`   Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });

  // Setup webhook
  try {
    const webhookUrl =
      process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook`;
    await waClient.setupWebhook(webhookUrl);
  } catch (error) {
    console.warn("⚠️ Failed to setup webhook:", error.message);
    console.warn("   Configure webhook manually if needed\n");
  }

  console.log("✨ Production mode ready!");
  console.log("📱 Bot is now listening for messages via webhook\n");
}

/**
 * Validate environment variables
 */
function validateEnvironment() {
  const required = ["MONGO_URI", "OLLAMA_BASE_URL", "LLM_MODEL"];

  // Add WA_API_BASE_URL untuk production mode
  if (MODE === "prod") {
    required.push("WA_API_BASE_URL");
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nCheck your .env file");
    process.exit(1);
  }

  console.log("✅ Environment variables validated\n");
}

/**
 * Graceful shutdown
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n\n📴 Received ${signal}, shutting down gracefully...`);

    try {
      await disconnectDB();
      console.log("✅ Database disconnected");
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/**
 * Error handlers
 */
process.on("uncaughtException", (error) => {
  console.error("\n💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("\n💥 Unhandled Rejection:", reason);
  process.exit(1);
});

// Start application
main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
