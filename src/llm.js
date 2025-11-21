import axios from "axios";
import { getDB } from "./db.js";
import {
  LLM_CONFIG,
  GREETING_PATTERNS,
  TIMEOUTS,
} from "../config/constants.js";

/**
 * Call LLM untuk RAG responses (KBLI/KBJI atau Publikasi)
 */
export async function callLLM(
  userMessage,
  contextDocs = [],
  mode = "natural",
  userId = "default"
) {
  try {
    const history = await getHistory(userId);
    const systemPrompt = buildSystemPrompt(mode);
    const userPrompt = buildUserPrompt(userMessage, contextDocs, mode);

    const response = await callOllama(systemPrompt, userPrompt, history);

    // Save to history
    await addToHistory(userId, "user", userMessage);
    await addToHistory(userId, "assistant", response);

    return response;
  } catch (error) {
    console.error("❌ LLM call failed:", error.message);
    throw error;
  }
}

/**
 * Handle natural conversation (no RAG)
 */
export async function handleNaturalQuery(userMessage, userId = "default") {
  try {
    const history = await getHistory(userId);

    // Check if this is first interaction (greeting)
    if (history.length === 0 && isGreeting(userMessage)) {
      return getWelcomeMessage();
    }

    const systemPrompt = `Kamu adalah DemakAI 🤖 — asisten AI dari Badan Pusat Statistik (BPS) Kabupaten Demak.

Tugasmu:
• Menjawab pertanyaan pengguna dengan ramah dan jelas, terutama yang berkaitan dengan Klasifikasi usaha (KBLI) dan jabatan (KBJI) dan Publikasi
• Menjelaskan konsep data, statistik, dan ekonomi daerah secara singkat.
• Tidak mengarang data. Jika topiknya bukan statistik, jawab natural seperti teman.

Gunakan bahasa Indonesia yang santai tapi profesional, seolah kamu petugas BPS yang membantu masyarakat memahami data.`;

    const response = await callOllama(systemPrompt, userMessage, history);

    await addToHistory(userId, "user", userMessage);
    await addToHistory(userId, "assistant", response);

    return response;
  } catch (error) {
    console.error("❌ Natural query failed:", error.message);
    return "Maaf, ada kendala teknis. Coba lagi ya!";
  }
}

/**
 * Call LLM (Ollama / Gemini / OpenAI / Groq) berdasarkan LLM_BASE_URL
 */
async function callOllama(systemPrompt, userPrompt, history = []) {
  try {
    const base = process.env.LLM_BASE_URL;
    const model = process.env.LLM_MODEL;

    // ✳️ Deteksi provider dari URL
    console.log(`🤖 [DemakAI] Using LLM provider from: ${base}`);

    const messages = [
      { role: "system", content: String(systemPrompt ?? "") },
      ...history.slice(-LLM_CONFIG.context_window).map((m) => ({
        role: String(m?.role ?? "user"),
        content: String(m?.content ?? ""),
      })),
      { role: "user", content: String(userPrompt ?? "") },
    ];

    const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    if (!GEMINI_KEYS.length) {
      console.warn("⚠️ No GEMINI_API_KEYS set. Falling back to GEMINI_API_KEY (single).");
      if (process.env.GEMINI_API_KEY) {
        GEMINI_KEYS.push(process.env.GEMINI_API_KEY);
      }
    }

    const GEMINI_ERROR_STATUS_FOR_ROTATE = [402, 403, 429];

    // ---- 1️⃣ GEMINI ----
    if (base.includes("generativelanguage.googleapis.com")) {
      console.log("⚡ Provider: Gemini API");

      if (!GEMINI_KEYS.length) {
        throw new Error("No Gemini API key configured.");
      }

      let lastError;

      for (let i = 0; i < GEMINI_KEYS.length; i++) {
        const key = GEMINI_KEYS[i];
        console.log(`🔑 Trying Gemini key ${i + 1}/${GEMINI_KEYS.length}`);

        try {
          const resp = await axios.post(
            `${base}${model}:generateContent?key=${key}`,
            {
              contents: [
                {
                  role: "user",
                  parts: messages.map((m) => ({ text: m.content })),
                },
              ],
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: TIMEOUTS.ollama_request,
            }
          );

          const text =
            resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

          if (!text) {
            console.warn("⚠️ Empty response from Gemini.");
          }

          return text;
        } catch (err) {
          lastError = err;

          const status = err.response?.status;
          const data = err.response?.data;

          console.warn(
            `⚠️ Gemini key #${i + 1} failed (status ${status || "no-status"}), ${
              i < GEMINI_KEYS.length - 1
                ? "trying next key..."
                : "no more keys to try."
            }`
          );

          // Kalau error-nya bukan terkait kuota/rate limit, langsung lempar
          if (!GEMINI_ERROR_STATUS_FOR_ROTATE.includes(status)) {
            throw err;
          }

          // Kalau status 402/403/429 → lanjut ke key berikutnya
          console.warn("   Error detail:", data || err.message);
        }
      }

      // Semua key gagal
      throw lastError || new Error("All Gemini API keys failed.");
    }

    // ---- 2️⃣ OPENAI (GPT) ----
    if (base.includes("openai.com")) {
      console.log("⚡ Provider: OpenAI API");
      const resp = await axios.post(
        base,
        { model, messages },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: TIMEOUTS.ollama_request,
        }
      );

      return resp.data?.choices?.[0]?.message?.content || "";
    }

    // ---- 3️⃣ GROQ ----
    if (base.includes("groq")) {
      console.log("⚡ Provider: Groq API");
      const resp = await axios.post(
        base,
        { model, messages },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: TIMEOUTS.ollama_request,
        }
      );

      return resp.data?.choices?.[0]?.message?.content || "";
    }

    // ---- 4️⃣ OLLAMA (default / local) ----
    console.log("⚡ Provider: Ollama (Local)");
    const payload = {
      model,
      messages,
      stream: false,
      options: {
        temperature: LLM_CONFIG.temperature,
        top_p: LLM_CONFIG.top_p,
        num_predict: LLM_CONFIG.max_tokens,
      },
    };

    // Warmup supaya model aktif di memori
    await warmupModel(model);

    // Retry 2x jika koneksi error
    const maxRetry = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetry + 1; attempt++) {
      try {
        const resp = await axios.post(`${base}/api/chat`, payload, {
          timeout: TIMEOUTS.ollama_request,
        });
        return resp.data?.message?.content || "";
      } catch (err) {
        lastError = err;
        const isTimeout = err.code === "ECONNABORTED";
        const maybeBusy =
          err.response?.status === 500 ||
          err.message?.includes("connection") ||
          err.message?.includes("ECONNRESET");

        if (attempt <= maxRetry && (isTimeout || maybeBusy)) {
          console.warn(
            `⚠️ Retry Ollama ${attempt}/${maxRetry} karena: ${err.message}`
          );
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        console.error("❌ Ollama call failed:", err.message);
        throw err;
      }
    }

    throw lastError;
  } catch (error) {
    console.error("❌ LLM call failed:", error.message);
    throw error;
  }
}


/**
 * Warmup supaya model aktif di memori
 */
async function warmupModel(model) {
  try {
    await axios.post(
      `${process.env.LLM_BASE_URL}/api/generate`,
      {
        model,
        prompt: "ok",
        stream: false,
        options: { num_predict: 1 },
      },
      { timeout: 15000 }
    );
  } catch {
    // tidak fatal, cukup diabaikan
  }
}

/**
 * Build system prompt - LOOSE, tidak overfitting
 */
function buildSystemPrompt(mode) {
  // 🧩 MODE BARU: KBLI/KBJI CORRECTIVE
  if (mode === "kbli_kbji") {
    return `Kamu asisten yang membantu mencari kode KBLI dan KBJI.

KBLI = Klasifikasi Baku Lapangan Usaha Indonesia (5 digit) - untuk usaha/kegiatan
KBJI = Klasifikasi Baku Jabatan Indonesia (4 digit) - untuk pekerjaan/okupasi

Tugas kamu:
- Evaluasi hasil pencarian KBLI/KBJI yang diberikan.
- Jika ada yang kurang tepat, koreksi dan perbaiki deskripsinya.
- Jika ada kekurangan, tambahkan konteks singkat yang relevan.
- Jawaban harus **tertutup**, ringkas, tidak perlu menanyakan ulang.
- Format tetap seperti ini:

Berikut kemungkinan yang paling relevan:

KBLI (usaha/kegiatan):
1. [kode] Nama
   Deskripsi singkat

2. [kode] Nama  
   Deskripsi singkat

KBJI (pekerjaan/okupasi):
1. [kode] Nama
   Deskripsi singkat

Singkat, jelas, to the point. Maksimal 3 KBLI dan 3 KBJI dan **jangan bertanya balik kepada pengguna.**`;
  }

  // 🧩 MODE BARU: PUBLIKASI CORRECTIVE
  if (mode === "publikasi") {
    return `Kamu asisten yang membantu menjelaskan data dan publikasi statistik.
Jawab SELALU dalam bahasa Indonesia, ringkas, dan tertutup.

Tugas kamu:
- Evaluasi semua daftar publikasi dan chunk yang diberikan.
- Koreksi, tambahkan penjelasan, atau lengkapi informasi agar bermanfaat.

Jika tidak ada dokumen relevan, BERIKAN penjelasan konsep umum yang akurat
(asal-usul istilah, definisi, contoh), jangan meminta pengguna mengulang.
Sebutkan sumber jika bisa (tanpa link pun tidak apa-apa).`;
  }

  return "Kamu asisten AI yang ramah dan membantu.";
}

/**
 * Build user prompt
 */
function buildUserPrompt(userMessage, contextDocs, mode) {
  if (!contextDocs || contextDocs.length === 0) {
    return `Pertanyaan: ${userMessage}

Tidak ada data yang ditemukan. Beritahu user dengan ramah dan sarankan coba kata kunci lain.`;
  }

  if (mode === "kbli_kbji") {
    // Format context untuk KBLI/KBJI
    const kbliDocs = contextDocs.filter((d) => d.type === "KBLI").slice(0, 3);
    const kbjiDocs = contextDocs.filter((d) => d.type === "KBJI").slice(0, 3);

    let contextText = "";

    if (kbliDocs.length > 0) {
      contextText += "KBLI yang relevan:\n";
      kbliDocs.forEach((d, i) => {
        contextText += `${i + 1}. [${d.kode}] ${d.judul}\n   ${
          d.deskripsi
        }\n\n`;
      });
    }

    if (kbjiDocs.length > 0) {
      contextText += "KBJI yang relevan:\n";
      kbjiDocs.forEach((d, i) => {
        contextText += `${i + 1}. [${d.kode}] ${d.judul}\n   ${
          d.deskripsi
        }\n\n`;
      });
    }

    return `Pertanyaan: ${userMessage}

Data hasil pencarian:
${contextText}

Tolong berikan jawaban yang sudah diperbaiki dan disempurnakan.
Gunakan format seperti contoh dan **jangan bertanya balik**.`;
  }

  if (mode === "publikasi") {
    const contextText = contextDocs
      .slice(0, 5)
      .map(
        (d, i) => `${i + 1}. ${d.title} (${d.year || ""})\n   ${d.deskripsi}`
      )
      .join("\n\n");

    return `Pertanyaan: ${userMessage}

Daftar publikasi hasil pencarian:
${contextText}

Jelaskan secara singkat dan korektif, tambahkan konteks yang relevan bila perlu.
Jawaban harus **tertutup**, langsung, dan tidak memancing percakapan baru.`;
  }

  return userMessage;
}

/**
 * Get welcome message
 */
function getWelcomeMessage() {
  return `Selamat datang di bot KBLI-KBJI!

Saya bisa membantu kamu mencari:
• Kode KBLI (klasifikasi usaha/kegiatan)
• Kode KBJI (klasifikasi pekerjaan/jabatan)
• Data dan publikasi statistik

Cara pakai:
#kbli [pertanyaan] - Cari kode usaha
#kbji [pertanyaan] - Cari kode pekerjaan  
#publikasi [pertanyaan] - Cari data/publikasi

Contoh:
- #kbli Saya mau buka usaha fotokopi
- #kbji kerja sebagai guru madrasah diniyah
- #publikasi data kemiskinan 2023

Fitur lain:
/home - Mode percakapan natural
/help - Panduan lengkap
/stats - Lihat statistik

Silakan tanya apa saja!`;
}

/**
 * Conversation history management
 */
async function getHistory(userId) {
  const db = getDB();
  const session = await db.getSession(userId);

  if (!session || !session.metadata?.conversationHistory) {
    return [];
  }
  return session.metadata.conversationHistory.slice(-5);
}

async function addToHistory(userId, role, content) {
  const db = getDB();
  const session = await db.getSession(userId);

  const safeContent =
    typeof content === "string" ? content : JSON.stringify(content);

  const history = session?.metadata?.conversationHistory || [];
  history.push({ role: String(role), content: safeContent });

  const trimmed = history.slice(-LLM_CONFIG.history_max);
  await db.createOrUpdateSession(userId, {
    metadata: { ...session?.metadata, conversationHistory: trimmed },
  });
}

/**
 * Clear history
 */
export async function clearHistory(userId) {
  const db = getDB();
  await db.createOrUpdateSession(userId, {
    metadata: { conversationHistory: [] },
  });
}

/**
 * Check if message is greeting
 */
function isGreeting(text) {
  return GREETING_PATTERNS.some((pattern) =>
    pattern.test(text.toLowerCase().trim())
  );
}

/**
 * Helper agar semua konten aman dari circular JSON
 */
function safeString(value) {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
