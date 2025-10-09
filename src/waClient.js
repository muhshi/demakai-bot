import axios from "axios";
import { handleMessage } from "./handler.js";
import { getDB } from "./db.js";

/**
 * WhatsApp Client untuk Mimmach/Baileys HTTP API
 * Dokumentasi: https://github.com/mimamch/wa-api-baileys
 */
export class WhatsAppClient {
  constructor() {
    this.baseURL = process.env.WA_API_BASE_URL;
    this.sessionId = process.env.WA_SESSION_ID || "demak-bot";
    this.isReady = false;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  /**
   * Initialize WhatsApp session
   */
  async initialize() {
    console.log("📱 Initializing WhatsApp session...");

    try {
      // 1. Check if session exists
      const status = await this.getSessionStatus();

      if (status.state === "open") {
        console.log("✅ WhatsApp session already active");
        this.isReady = true;
        return;
      }

      // 2. Create/start session if not exists
      console.log("🔄 Starting new WhatsApp session...");
      await this.startSession();

      // 3. Wait for QR code or connection
      await this.waitForConnection();

      this.isReady = true;
      console.log("✅ WhatsApp session initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize WhatsApp:", error.message);
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus() {
    try {
      const response = await axios.get(
        `${this.baseURL}/session/${this.sessionId}/status`,
        { timeout: 5000 }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { state: "not_found" };
      }
      throw error;
    }
  }

  /**
   * Start new session
   */
  async startSession() {
    try {
      const response = await axios.post(
        `${this.baseURL}/session/start`,
        {
          sessionId: this.sessionId,
          options: {
            printQRInTerminal: true,
          },
        },
        { timeout: 10000 }
      );

      console.log("📱 Session started. Scan QR code to connect.");
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        console.log("ℹ️ Session already exists, checking status...");
        return;
      }
      throw error;
    }
  }

  /**
   * Wait for connection (polling)
   */
  async waitForConnection(timeout = 60000) {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    console.log("⏳ Waiting for WhatsApp connection...");

    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.getSessionStatus();

        if (status.state === "open") {
          return true;
        }

        console.log(`   Status: ${status.state || "connecting"}...`);
        await this.sleep(pollInterval);
      } catch (error) {
        console.warn("⚠️ Error checking status:", error.message);
      }
    }

    throw new Error("Connection timeout - QR code not scanned");
  }

  /**
   * Send text message
   */
  async sendMessage(to, text) {
    try {
      // Ensure phone number format (remove @ if exists)
      const phoneNumber = to.replace("@s.whatsapp.net", "");

      const response = await axios.post(
        `${this.baseURL}/session/${this.sessionId}/send-message`,
        {
          to: phoneNumber,
          text: text,
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Message sent to ${phoneNumber}`);
      return response.data;
    } catch (error) {
      console.error("❌ Failed to send message:", error.message);
      throw error;
    }
  }

  /**
   * Send message with typing indicator
   */
  async sendMessageWithTyping(to, text) {
    try {
      // Simulate typing
      await this.sendTyping(to);

      // Wait a bit untuk natural feel
      const typingDelay = parseInt(process.env.TYPING_DELAY || "1000");
      await this.sleep(typingDelay);

      // Send actual message
      return await this.sendMessage(to, text);
    } catch (error) {
      console.error("❌ Error sending message with typing:", error.message);
      // Fallback: send without typing
      return await this.sendMessage(to, text);
    }
  }

  /**
   * Send typing indicator
   */
  async sendTyping(to) {
    try {
      const phoneNumber = to.replace("@s.whatsapp.net", "");

      await axios.post(
        `${this.baseURL}/session/${this.sessionId}/send-presence`,
        {
          to: phoneNumber,
          presence: "composing",
        },
        { timeout: 5000 }
      );
    } catch (error) {
      // Non-critical, just log
      console.warn("⚠️ Failed to send typing indicator:", error.message);
    }
  }

  /**
   * Setup webhook untuk receive messages
   */
  async setupWebhook(webhookUrl) {
    try {
      console.log(`🔗 Setting up webhook: ${webhookUrl}`);

      const response = await axios.post(
        `${this.baseURL}/session/${this.sessionId}/webhook`,
        {
          url: webhookUrl,
          events: ["message"], // Only subscribe to messages
        },
        { timeout: 5000 }
      );

      console.log("✅ Webhook configured successfully");
      return response.data;
    } catch (error) {
      // Some Mimmach versions might not support this endpoint
      console.warn("⚠️ Webhook setup failed:", error.message);
      console.warn("   You may need to configure webhook manually in the API");
    }
  }

  /**
   * Delete/logout session
   */
  async deleteSession() {
    try {
      await axios.delete(`${this.baseURL}/session/${this.sessionId}`, {
        timeout: 5000,
      });

      this.isReady = false;
      console.log("✅ Session deleted");
    } catch (error) {
      console.error("❌ Failed to delete session:", error.message);
    }
  }

  /**
   * Health check (periodic)
   */
  async healthCheck() {
    setInterval(async () => {
      try {
        const status = await this.getSessionStatus();

        if (status.state !== "open" && this.isReady) {
          console.warn("⚠️ WhatsApp disconnected! Attempting reconnect...");
          this.isReady = false;
          await this.reconnect();
        }
      } catch (error) {
        console.error("❌ Health check failed:", error.message);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Reconnect logic
   */
  async reconnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error(
        "❌ Max reconnection attempts reached. Manual intervention needed."
      );
      return;
    }

    this.retryCount++;
    console.log(
      `🔄 Reconnection attempt ${this.retryCount}/${this.maxRetries}...`
    );

    try {
      await this.sleep(5000); // Wait before retry
      await this.initialize();
      this.retryCount = 0; // Reset on success
    } catch (error) {
      console.error("❌ Reconnection failed:", error.message);
      await this.sleep(10000); // Wait longer before next attempt
      await this.reconnect();
    }
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Webhook handler untuk incoming messages
 */
export async function handleWebhook(req, res) {
  try {
    const event = req.body;

    console.log("📩 Webhook received:", JSON.stringify(event, null, 2));

    // Validate event
    if (!event || !event.type) {
      console.warn("⚠️ Invalid webhook payload");
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Only process messages
    if (event.type !== "message") {
      return res.status(200).json({ status: "ignored" });
    }

    // Extract message data (adjust based on Mimmach format)
    const message = event.message || event.data;
    if (!message) {
      return res.status(400).json({ error: "No message data" });
    }

    // Ignore own messages
    if (message.fromMe) {
      return res.status(200).json({ status: "ignored_own_message" });
    }

    // Extract necessary info
    const from = message.from || message.remoteJid;
    const text = message.text || message.body || message.conversation;

    if (!from || !text) {
      console.warn("⚠️ Missing from/text in message");
      return res.status(400).json({ error: "Missing from/text" });
    }

    // Respond immediately to webhook (async processing)
    res.status(200).json({ status: "received" });

    // Process message asynchronously
    processMessage(from, text).catch((error) => {
      console.error("❌ Error processing message:", error);
    });
  } catch (error) {
    console.error("❌ Webhook handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Process incoming message
 */
async function processMessage(from, text) {
  try {
    console.log(`\n📨 Message from ${from}: ${text}`);

    // Rate limiting check
    if (!(await checkRateLimit(from))) {
      console.warn(`⚠️ Rate limit exceeded for ${from}`);
      await global.waClient.sendMessage(
        from,
        "⏱️ Kamu mengirim terlalu banyak pesan. Tunggu sebentar ya!"
      );
      return;
    }

    // Update session
    const db = getDB();
    await db.createOrUpdateSession(from, {
      phoneNumber: from,
      lastMessage: text,
    });

    // Send typing indicator
    await global.waClient.sendTyping(from);

    // Process message through handler
    const response = await handleMessage(from, text);

    // Split long messages if needed
    const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH || "4000");
    if (response.length > maxLength) {
      const chunks = splitMessage(response, maxLength);
      for (const chunk of chunks) {
        await global.waClient.sendMessage(from, chunk);
        await global.waClient.sleep(500); // Small delay between chunks
      }
    } else {
      await global.waClient.sendMessage(from, response);
    }

    console.log(`✅ Response sent to ${from}`);
  } catch (error) {
    console.error("❌ Error in processMessage:", error);

    // Send error message to user
    try {
      await global.waClient.sendMessage(
        from,
        "😅 Maaf, ada kendala teknis. Coba lagi dalam beberapa saat ya!"
      );
    } catch (sendError) {
      console.error("❌ Failed to send error message:", sendError);
    }
  }
}

/**
 * Rate limiting
 */
const messageTimestamps = new Map();

async function checkRateLimit(userId) {
  const now = Date.now();
  const timestamps = messageTimestamps.get(userId) || [];

  // Remove timestamps older than 1 minute
  const recentTimestamps = timestamps.filter((t) => now - t < 60000);

  const maxMessages = parseInt(process.env.MAX_MESSAGES_PER_MINUTE || "10");

  if (recentTimestamps.length >= maxMessages) {
    return false;
  }

  recentTimestamps.push(now);
  messageTimestamps.set(userId, recentTimestamps);

  return true;
}

/**
 * Split long messages
 */
function splitMessage(text, maxLength) {
  const chunks = [];
  let currentChunk = "";

  const lines = text.split("\n");

  for (const line of lines) {
    if ((currentChunk + line + "\n").length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // If single line is too long, split it
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          chunks.push(line.substring(i, i + maxLength));
        }
      } else {
        currentChunk = line + "\n";
      }
    } else {
      currentChunk += line + "\n";
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
