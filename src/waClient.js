import axios from "axios";
import { handleMessage } from "./handlers.js";
import { getDB } from "./db.js";

/**
 * WhatsApp Client (Mimmach / Baileys HTTP API)
 * Cleaned + no webhook mode
 */
export class WhatsAppClient {
  constructor() {
    this.baseURL = process.env.WA_API_BASE_URL || "http://10.133.21.24:5001";
    this.sessionId = process.env.WA_SESSION_ID || "demak-bot";
    this.isReady = false;
    this.polling = false;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  /**
   * Initialize WhatsApp session
   */
  async initialize() {
    console.log("📱 Initializing WhatsApp session...");

    try {
      const status = await this.getSessionStatus();

      if (status.state === "open") {
        console.log("✅ WhatsApp session already active");
        this.isReady = true;
      } else {
        console.log("🔄 Starting new WhatsApp session...");
        await this.startSession();
        await this.waitForConnection();
        this.isReady = true;
      }

      console.log("✅ WhatsApp client ready!");
      global.waClient = this;

      // Start polling incoming messages
      this.startPolling();
    } catch (error) {
      console.error("❌ Failed to initialize WhatsApp:", error.message);
      await this.retryInitialize();
    }
  }

  /**
   * Retry initialization (maxRetries)
   */
  async retryInitialize() {
    if (this.retryCount >= this.maxRetries) {
      console.error("❌ Max retries reached. Manual restart required.");
      return;
    }

    this.retryCount++;
    console.log(
      `🔁 Retrying connection (${this.retryCount}/${this.maxRetries})...`
    );
    await this.sleep(5000);
    await this.initialize();
  }

  /**
   * Get session status
   */
  async getSessionStatus() {
    try {
      const { data } = await axios.get(
        `${this.baseURL}/session/${this.sessionId}/status`
      );
      return data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { state: "not_found" };
      }
      throw error;
    }
  }

  /**
   * Start session (trigger QR code on gateway)
   */
  async startSession() {
    try {
      const { data } = await axios.post(`${this.baseURL}/session/start`, {
        sessionId: this.sessionId,
        options: { printQRInTerminal: true },
      });
      console.log("📲 Session started. Scan QR code in WA Gateway terminal!");
      return data;
    } catch (error) {
      if (error.response?.status === 409) {
        console.log("ℹ️ Session already exists, checking status...");
        return;
      }
      throw error;
    }
  }

  /**
   * Wait until connected
   */
  async waitForConnection(timeout = 60000) {
    const start = Date.now();
    const interval = 3000;

    console.log("⏳ Waiting for WhatsApp to connect...");

    while (Date.now() - start < timeout) {
      const status = await this.getSessionStatus();

      if (status.state === "open") {
        console.log("✅ WhatsApp connected!");
        return true;
      }

      console.log(`   Current status: ${status.state}`);
      await this.sleep(interval);
    }

    throw new Error("Timeout waiting for connection");
  }

  /**
   * Send text message
   */
  async sendMessage(to, text) {
    try {
      const number = to.replace("@s.whatsapp.net", "");
      await axios.post(
        `${this.baseURL}/session/${this.sessionId}/send-message`,
        {
          to: number,
          text,
        }
      );
      console.log(`✅ Message sent to ${number}`);
    } catch (error) {
      console.error(
        "❌ Failed to send message:",
        error.response?.data || error.message
      );
    }
  }

  /**
   * Send typing simulation + message
   */
  async sendMessageWithTyping(to, text) {
    try {
      await this.sendTyping(to);
      const delay = parseInt(process.env.TYPING_DELAY || "1200");
      await this.sleep(delay);
      await this.sendMessage(to, text);
    } catch (err) {
      console.error("⚠️ Error sending message with typing:", err.message);
      await this.sendMessage(to, text);
    }
  }

  /**
   * Typing indicator
   */
  async sendTyping(to) {
    try {
      const number = to.replace("@s.whatsapp.net", "");
      await axios.post(
        `${this.baseURL}/session/${this.sessionId}/send-presence`,
        {
          to: number,
          presence: "composing",
        }
      );
    } catch (err) {
      console.warn("⚠️ Typing indicator failed:", err.message);
    }
  }

  /**
   * Poll messages directly from gateway (no webhook)
   */
  async startPolling(interval = 5000) {
    if (this.polling) return;
    this.polling = true;
    console.log("📡 Starting message polling...");

    while (true) {
      try {
        const { data } = await axios.get(
          `${this.baseURL}/session/${this.sessionId}/messages`
        );
        if (Array.isArray(data)) {
          for (const msg of data) {
            await this.processMessage(msg);
          }
        }
      } catch (error) {
        console.warn("⚠️ Polling error:", error.message);
      }

      await this.sleep(interval);
    }
  }

  /**
   * Process incoming message (same as webhook)
   */
  async processMessage(message) {
    try {
      if (!message) return;
      const from = message.from || message.remoteJid;
      const text = message.text || message.body || message.conversation;

      if (!from || !text) return;
      if (message.fromMe) return; // ignore self messages

      console.log(`📩 Incoming message from ${from}: ${text}`);

      // rate limit check
      if (!(await this.checkRateLimit(from))) {
        await this.sendMessage(
          from,
          "⚠️ Kamu mengirim terlalu banyak pesan. Coba lagi nanti ya!"
        );
        return;
      }

      const db = getDB();
      await db.createOrUpdateSession(from, {
        phoneNumber: from,
        lastMessage: text,
      });

      await this.sendTyping(from);
      const response = await handleMessage(from, text);

      const maxLen = parseInt(process.env.MAX_MESSAGE_LENGTH || "4000");
      if (response.length > maxLen) {
        const chunks = this.splitMessage(response, maxLen);
        for (const chunk of chunks) {
          await this.sendMessage(from, chunk);
          await this.sleep(800);
        }
      } else {
        await this.sendMessage(from, response);
      }

      console.log(`✅ Response sent to ${from}`);
    } catch (err) {
      console.error("❌ Error processing message:", err.message);
      await this.sendMessage(
        from,
        "😅 Maaf, bot lagi error. Coba lagi nanti ya!"
      );
    }
  }

  /**
   * Rate limiting (anti spam)
   */
  messageTimestamps = new Map();

  async checkRateLimit(userId) {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(userId) || [];
    const recent = timestamps.filter((t) => now - t < 60000);
    const max = parseInt(process.env.MAX_MESSAGES_PER_MINUTE || "10");

    if (recent.length >= max) return false;

    recent.push(now);
    this.messageTimestamps.set(userId, recent);
    return true;
  }

  /**
   * Split message
   */
  splitMessage(text, maxLength) {
    const chunks = [];
    let chunk = "";
    for (const line of text.split("\n")) {
      if ((chunk + line + "\n").length > maxLength) {
        chunks.push(chunk.trim());
        chunk = "";
      }
      chunk += line + "\n";
    }
    if (chunk) chunks.push(chunk.trim());
    return chunks;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
