import { generateAnswer } from "./rag.js";
import { handleNaturalQuery, clearHistory } from "./llm.js";
import { checkOllamaHealth, getCacheStats } from "./embedding.js";
import { getDB } from "./db.js";
import { MODE_INDICATORS } from "../config/constants.js";

/**
 * Main message handler dengan hash trigger system
 */
export async function handleMessage(userId, text) {
  try {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return "Maaf, saya tidak menerima pesan kosong.";
    }

    const trimmedText = text.trim();
    const db = getDB();

    // 1. Check if /home command (reset to natural)
    if (trimmedText.toLowerCase() === "/home") {
      await db.resetMode(userId);
      return `${MODE_INDICATORS.natural} Mode Natural aktif!\n\nKamu bisa ngobrol santai dengan saya atau gunakan:\n• #kbli atau #kbji untuk mencari kode KBLI/KBJI\n• #publikasi untuk mencari data/publikasi`;
    }

    // 2. Check for other commands
    if (trimmedText.startsWith("/")) {
      return await handleCommand(trimmedText, userId);
    }

    // 3. Check for hash trigger (#kbli, #kbji, #publikasi)
    const hashMatch = trimmedText.match(/^#(kbli|kbji|publikasi)\s*(.*)/i);

    if (hashMatch) {
      const trigger = hashMatch[1].toLowerCase();
      const query = hashMatch[2].trim();

      // Set mode
      const mode =
        trigger === "kbli" || trigger === "kbji" ? "kbli_kbji" : "publikasi";

      // If no query after hash, just inform mode
      if (!query || query.length === 0) {
        await db.setMode(userId, mode, null);
        return getModeActivationMessage(mode);
      }

      // PENTING: Set mode dan process dengan RAG
      await db.setMode(userId, mode, query);
      console.log(`🔄 Mode switched: ${mode} for user ${userId}`);

      // Process query dengan RAG (ambil dari database)
      const answer = await generateAnswer(query, mode, userId);
      return formatResponseWithFooter(answer, mode);
    }

    // 4. Get current session to check mode
    const session = await db.getSession(userId);
    const currentMode = session?.currentMode || "natural";

    console.log(`👤 User: ${userId}`);
    console.log(`📝 Query: ${trimmedText}`);
    console.log(`🏷️ Current Mode: ${currentMode}`);

    // 5. Process based on current mode
    if (currentMode === "natural") {
      // Mode natural → hanya AI biasa
      const answer = await handleNaturalQuery(trimmedText, userId);

      const footer = `───────────────
      Saya DemakAI 🤖 — asisten statistik Kabupaten Demak.
      Ketik:
      • #kbli / #kbji → cari klasifikasi usaha/jabatan
      • #publikasi → cari data & publikasi
      /home → kembali ke mode awal`;

      return `${MODE_INDICATORS.natural} ${answer}\n\n${footer}`;
    } else if (currentMode === "kbli_kbji") {
      // Mode KBLI/KBJI — hanya jalankan RAG jika ada #
      if (trimmedText.startsWith("#")) {
        const answer = await generateAnswer(trimmedText, "kbli_kbji", userId);
        await db.setMode(userId, currentMode, trimmedText);
        return formatResponseWithFooter(answer, currentMode);
      } else {
        // Chat biasa → natural saja
        const answer = await handleNaturalQuery(trimmedText, userId);
        await db.setMode(userId, currentMode, session?.lastQuery);
        return formatResponseWithFooter(answer, currentMode);
      }
    } else if (currentMode === "publikasi") {
      // Mode publikasi — jalankan RAG hanya jika ada tag #
      if (trimmedText.startsWith("#")) {
        const answer = await generateAnswer(trimmedText, "publikasi", userId);
        await db.setMode(userId, currentMode, trimmedText);
        return formatResponseWithFooter(answer, currentMode);
      } else {
        // Chat biasa → tetap natural
        const answer = await handleNaturalQuery(trimmedText, userId);
        await db.setMode(userId, currentMode, session?.lastQuery);
        return formatResponseWithFooter(answer, currentMode);
      }
    }
  } catch (error) {
    console.error("❌ Error in handleMessage:", error);
    return handleError(error);
  }
}

/**
 * Get mode activation message
 */
function getModeActivationMessage(mode) {
  if (mode === "kbli_kbji") {
    return `${
      MODE_INDICATORS.kbli_kbji
    } Mode KBLI/KBJI aktif!\n\nSekarang kirim query dengan format:\n#kbli [pertanyaan] atau #kbji [pertanyaan]\n\nContoh:\n#kbli usaha warung makan\n#kbji kerja sebagai programmer\n\nSetelah dapat hasil, kamu bisa lanjut ngobrol natural untuk follow-up questions.\n\n${getFooter(
      mode
    )}`;
  } else if (mode === "publikasi") {
    return `${
      MODE_INDICATORS.publikasi
    } Mode Publikasi aktif!\n\nSetiap pertanyaan akan dicari di database publikasi.\n\nContoh:\n- data kemiskinan 2023\n- apa saja publikasi yang tersedia\n\n${getFooter(
      mode
    )}`;
  }
  return "";
}

/**
 * Format response dengan footer (mode indicator + navigation)
 */
function formatResponseWithFooter(answer, mode) {
  const indicator = MODE_INDICATORS[mode] || "💬";
  const footer = getFooter(mode);

  return `${indicator} ${answer}\n\n${footer}`;
}

/**
 * Get footer dengan navigasi antar mode
 */
function getFooter(currentMode) {
  if (currentMode === "kbli_kbji") {
    return "───────────────\n Ketik\n /home untuk mode natural\n /help untuk batuan\n #publikasi untuk publikasi";
  } else if (currentMode === "publikasi") {
    return "───────────────\n Ketik\n /home untuk mode natural\n /help untuk batuan\n #kbli untuk KBLI/KBJI";
  }
  return "";
}

/**
 * Handle commands
 */
async function handleCommand(command, userId) {
  const cmd = command.split(" ")[0].toLowerCase();

  switch (cmd) {
    case "/help":
      return `📋 **DemakAI - Panduan Penggunaan**

**Mode System:**
• #kbli atau #kbji - Cari kode KBLI/KBJI
• #publikasi - Cari data/publikasi
• /home - Kembali ke mode natural

**Commands:**
• /help - Panduan ini
• /clear - Hapus riwayat percakapan
• /stats - Statistik sistem
• /health - Status server

**Contoh:**
#kbli usaha warung makan
#publikasi data kemiskinan 2023
/home`;

    case "/clear":
      await clearHistory(userId);
      return "✅ Riwayat percakapan sudah dihapus.";

    case "/stats":
      const stats = getCacheStats();
      const db = getDB();
      const dbStats = await db.getStats();

      return `📊 **Statistik Sistem**

**Database:**
• KBLI: ${dbStats.kbli.toLocaleString()}
• KBJI: ${dbStats.kbji.toLocaleString()}
• Publikasi: ${dbStats.documents}
• Users: ${dbStats.sessions}

**Activity:**
• Active (24h): ${dbStats.activeUsers24h}
• Total Messages: ${dbStats.totalMessages.toLocaleString()}

**Cache:**
• Embeddings: ${stats.size}/${stats.maxSize} (${stats.usage})`;

    case "/health":
      const health = await checkOllamaHealth();
      return `🏥 **System Health**

**Ollama:**
${health.available ? "✅" : "❌"} ${health.available ? "Online" : "Offline"}

**Models:**
• Embedding: ${health.embeddingModelLoaded ? "✅" : "⚠️"} ${
        process.env.EMBEDDING_MODEL
      }
• LLM: ${health.llmModelLoaded ? "✅" : "⚠️"} ${process.env.LLM_MODEL}
• Provider: ${health.llmProvider}

${!health.available ? "⚠️ Perlu check koneksi ke Ollama!" : ""}`;

    default:
      return `❌ Perintah tidak dikenali: ${cmd}\nKetik /help untuk bantuan.`;
  }
}

/**
 * Handle errors
 */
function handleError(error) {
  console.error("Error details:", error);

  if (error.message?.includes("timeout")) {
    return "⏱️ Sistem sedang lambat. Coba lagi dalam beberapa saat.";
  }

  if (error.message?.includes("ECONNREFUSED")) {
    return "🔌 Tidak bisa terhubung ke server. Hubungi admin.";
  }

  return "😅 Ada kendala teknis. Coba lagi atau hubungi admin.";
}
