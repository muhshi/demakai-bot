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
    this.enablePolling = process.env.WA_ENABLE_POLLING === "true";
    this.healthInterval = null;
    this.lastKnownState = null;
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

      // Start polling incoming messages (optional for gateways without webhook env)
      if (this.enablePolling) {
        this.startPolling();
      } else {
        console.log("ℹ️ Polling disabled (set WA_ENABLE_POLLING=true to enable).");
      }
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
    // Gateway docs do not include a status route; try best-effort and fallback gracefully
    const statusUrl = `${this.baseURL}/session/status`;

    try {
      const { data } = await axios.get(statusUrl, {
        params: { session: this.sessionId },
      });
      return this.normalizeStatusResponse(data);
    } catch (error) {
      const status = error.response?.status;

      if (status === 404 || status === 400) {
        const fallback = await this.checkSessionList();
        if (fallback) return fallback;
      }

      console.warn("⚠️ Status check failed (assuming unknown):", error.message);
      return { state: "unknown" };
    }
  }

  /**
   * Start session (trigger QR code on gateway)
   */
  async startSession() {
    const url = `${this.baseURL}/session/start`;

    try {
      // Gateway supports GET with query param "session"
      const { data } = await axios.get(url, {
        params: { session: this.sessionId },
      });
      console.log("📲 Session started. Scan QR code in WA Gateway terminal!");
      return data;
    } catch (error) {
      // Try POST fallback
      try {
        const { data } = await axios.post(url, { session: this.sessionId });
        console.log("📲 Session started via POST. Scan QR code in WA Gateway terminal!");
        return data;
      } catch (err) {
        if (err.response?.status === 409) {
          console.log("ℹ️ Session already exists, checking status...");
          return;
        }

        throw new Error(this.formatAxiosError(err, "startSession"));
      }
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
      } else if (status.state === "unknown") {
        console.log("ℹ️ WhatsApp status unknown; continuing without wait.");
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
      await axios.post(`${this.baseURL}/message/send-text`, {
        session: this.sessionId,
        to: number,
        text,
      });
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
    // Current gateway does not expose presence endpoint; skip typing to avoid noise
    return;
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
        // Gateway does not expose a polling endpoint; stop to avoid 404 spam
        console.warn("⚠️ Polling is not supported by this gateway. Stopping polling.");
        this.polling = false;
        return;
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

      const from =
        message.from ||
        message.remoteJid ||
        message.key?.remoteJid ||
        message.key?.participant ||
        message.sender ||
        message.chatId ||
        message.number;

      const text =
        message.text ||
        message.body ||
        message.conversation ||
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.caption ||
        message.messageText ||
        message.content ||
        message.msg;

      if (!from || !text) return;
      if (message.fromMe || message.key?.fromMe) return; // ignore self messages
      if (from.endsWith("@g.us")) return; // ignore group chats

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
      if (from) {
        await this.sendMessage(
          from,
          "😅 Maaf, bot lagi error. Coba lagi nanti ya!"
        );
      }
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

  /**
   * Normalize status response from different gateways
   */
  normalizeStatusResponse(data) {
    const state =
      data?.state ||
      data?.status ||
      data?.connectionStatus ||
      (data?.connected ? "open" : null) ||
      (data?.isConnected ? "open" : null);

    return {
      state: state || "unknown",
      raw: data,
    };
  }

  /**
   * Fallback: check if session exists in /session listing
   */
  async checkSessionList() {
    try {
      const { data } = await axios.get(`${this.baseURL}/session`);
      const sessions = Array.isArray(data?.data) ? data.data : data;
      if (Array.isArray(sessions) && sessions.includes(this.sessionId)) {
        return { state: "open", raw: { via: "session_list" } };
      }
      return { state: "not_found" };
    } catch (err) {
      console.warn(
        "⚠️ Failed to check session list:",
        err.response?.data || err.message
      );
      return null;
    }
  }

  /**
   * Background health check
   */
  startHealthCheck(interval = 15000) {
    if (this.healthInterval) return;

    const check = async () => {
      try {
        const status = await this.getSessionStatus();
        const state = status.state || "unknown";

        if (state !== this.lastKnownState) {
          console.log(`📶 WhatsApp state: ${state}`);
          this.lastKnownState = state;
        }

        if (state !== "open" && state !== "unknown") {
          console.warn(
            `⚠️ Session "${this.sessionId}" not open (state: ${state})`
          );
        }
      } catch (err) {
        console.warn("⚠️ Health check failed:", err.message);
      }
    };

    this.healthInterval = setInterval(check, interval);
    check();
  }

  stopHealthCheck() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  /**
   * Register webhook with gateway (best effort)
   */
  async setupWebhook(webhookUrl) {
    try {
      await axios.post(`${this.baseURL}/session/${this.sessionId}/webhook`, {
        url: webhookUrl,
      });
      console.log("✅ Webhook registered on WA gateway");
    } catch (error) {
      console.warn(
        "⚠️ Failed to register webhook on WA gateway:",
        this.formatAxiosError(error, "setupWebhook")
      );
      console.warn("   Bot will continue using polling mode.");
    }
  }

  formatAxiosError(error, context) {
    const status = error.response?.status;
    const data = error.response?.data;
    return `${context}: ${
      status ? `${status} ` : ""
    }${error.message}${data ? ` — ${JSON.stringify(data)}` : ""}`;
  }
}

/**
 * Express webhook handler — process messages pushed from WA gateway
 */
export async function handleWebhook(req, res) {
  try {
    const path = req.originalUrl || "/webhook";
    console.log(`📨 Webhook hit: ${path}`);

    if (!global.waClient) {
      return res
        .status(503)
        .json({ error: "WhatsApp client not initialized yet" });
    }

    const payload = req.body;
    console.log("🔍 Raw webhook payload:", JSON.stringify(payload, null, 2));

    if (!payload) {
      console.warn("⚠️ Webhook received empty payload");
      return res.status(400).json({ error: "Empty payload" });
    }

    let messages = [];

    // 1️⃣ Format wa-gateway yang kamu pakai sekarang:
    // { session, from, message, media: {...} }
    if (payload?.session && payload?.from) {
      if (!payload.message) {
        console.log("⚠️ No message text in payload, skipping.");
        return res.json({ status: "ignored-no-message" });
      }

      messages = [
        {
          from: payload.from,
          text: payload.message,
        },
      ];
    }

    // 2️⃣ Fallback: format { messages: [...] }
    else if (Array.isArray(payload?.messages)) {
      messages = payload.messages;
    }

    // 3️⃣ Fallback: format curl manual { from, text }
    else if (payload?.from && payload?.text) {
      messages = [
        {
          from: payload.from,
          text: payload.text,
        },
      ];
    }

    // 4️⃣ Tidak dikenali
    else {
      console.warn("⚠️ Unknown webhook payload format");
      return res.json({ status: "ignored-unknown-format" });
    }

    for (const msg of messages) {
      await global.waClient.processMessage(msg);
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error("❌ Webhook handling failed:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}


