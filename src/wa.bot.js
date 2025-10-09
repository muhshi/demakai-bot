import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { handleMessage } from "./handlers.js";
import { getDB } from "./db.js";

const { Client, LocalAuth } = pkg;

/**
 * Konfigurasi dasar bot
 */
const BOT_CONFIG = {
  typingDelayBase: 1000, // delay dasar (ms)
  typingSpeedPerChar: 20, // tambahan delay per karakter (ms)
  maxTypingDelay: 5000, // maksimal delay (ms)
  minTypingDelay: 1000, // minimal delay (ms)
  showResponseTime: true, // tampilkan waktu berpikir bot di reply
};

/**
 * Fungsi simulasi efek mengetik
 */
async function simulateTyping(chat, replyText) {
  try {
    const delay = Math.min(
      BOT_CONFIG.maxTypingDelay,
      BOT_CONFIG.minTypingDelay +
        Math.floor(replyText.length * BOT_CONFIG.typingSpeedPerChar)
    );
    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, delay));
    await chat.clearState();
  } catch (err) {
    console.warn("⚠️ Gagal menampilkan status mengetik:", err.message);
  }
}

/**
 * Start WhatsApp bot untuk development/testing
 * Pakai whatsapp-web.js dengan QR scan
 */
export async function startDevBot() {
  console.log("🚀 Starting Development Bot (whatsapp-web.js)...\n");

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  // QR Code event
  client.on("qr", (qr) => {
    console.log("📱 Scan QR code ini dengan WhatsApp kamu:\n");
    qrcode.generate(qr, { small: true });
    console.log("\n⏳ Menunggu scan...\n");
  });

  // Ready event
  client.on("ready", () => {
    console.log("✅ WhatsApp bot ready!");
    console.log(`📱 Connected as: ${client.info.pushname}`);
    console.log(`📞 Number: ${client.info.wid.user}\n`);
    console.log("🎉 Bot is now listening for messages...\n");
  });

  // Authenticated
  client.on("authenticated", () => {
    console.log("🔐 Authentication successful");
  });

  // Auth failure
  client.on("auth_failure", (msg) => {
    console.error("❌ Authentication failed:", msg);
  });

  // Disconnected
  client.on("disconnected", (reason) => {
    console.log("📴 Bot disconnected:", reason);
  });

  // Message handler
  client.on("message", async (msg) => {
    try {
      const from = msg.from;
      const text = msg.body.trim();
      const isGroup = msg.from.endsWith("@g.us");

      // Ignore group messages
      if (isGroup) {
        console.log(`📢 Group message ignored: ${from}`);
        return;
      }

      // Ignore empty messages
      if (!text || text.length === 0) return;

      // Ignore media messages
      if (msg.hasMedia) {
        console.log(`🖼️ Media message from ${from} (not supported)`);
        await msg.reply("Maaf, saat ini saya hanya bisa memproses pesan teks.");
        return;
      }

      // Ignore messages from self
      if (msg.fromMe) return;

      console.log(`💬 [${from}] ${text}`);

      // Rate limiting check
      const db = getDB();
      const session = await db.getSession(from);

      if (session?.metadata?.lastMessageTime) {
        const timeSinceLastMessage =
          Date.now() - session.metadata.lastMessageTime;
        if (timeSinceLastMessage < 2000) {
          console.log(`⚠️ Rate limit: ${from}`);
          return;
        }
      }

      // Update session last message time
      await db.createOrUpdateSession(from, {
        metadata: {
          ...session?.metadata,
          lastMessageTime: Date.now(),
        },
      });

      // Mark sebagai online dan sudah dibaca
      await client.sendPresenceAvailable();
      await client.sendSeen(from);

      // ⏱️ MULAI hitung waktu berpikir bot
      const startTime = Date.now();

      // Process message
      const reply = await handleMessage(from, text);

      const endTime = Date.now();
      const responseTimeSec = ((endTime - startTime) / 1000).toFixed(2);

      // 🧠 Simulasi mengetik
      const chat = await msg.getChat();
      await simulateTyping(chat, reply);

      // Tambahkan info waktu respon (kalau diaktifkan)
      const finalReply = BOT_CONFIG.showResponseTime
        ? `${reply}\n\n⏱️ (Dijawab dalam ${responseTimeSec} detik)`
        : reply;

      // Send reply
      await msg.reply(finalReply);

      // Increment message count
      await db.incrementMessageCount(from);

      console.log(`✅ Replied to ${from}\n`);
    } catch (error) {
      console.error("❌ Error handling message:", error);
      try {
        await msg.reply("Maaf, ada kendala teknis. Coba lagi ya!");
      } catch (replyError) {
        console.error("❌ Failed to send error message:", replyError);
      }
    }
  });

  // Initialize
  await client.initialize();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n📴 Shutting down...");
    await client.destroy();
    process.exit(0);
  });

  return client;
}
