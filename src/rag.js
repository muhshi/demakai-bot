import { embedText } from "./embedding.js";
import { callLLM } from "./llm.js";
import { getDB } from "./db.js";
import {
  SYNONYMS,
  STOPWORDS,
  SIMILARITY_THRESHOLD,
  MAX_RESULTS,
  LISTING_KEYWORDS,
  TOP_LIMITS,
  PUB_KW,
} from "../config/constants.js";

/**
 * Main RAG entry point
 */
export async function generateAnswer(query, mode, userId = "default") {
  console.log(`🟢 Query: ${query}`);
  console.log(`🟢 Mode: ${mode}`);

  try {
    const db = getDB();

    if (mode === "kbli_kbji") {
      return await handleKBLIKBJI(query, userId, db);
    }

    if (mode === "publikasi") {
      return await handlePublikasi(query, userId, db);
    }

    // Fallback
    return "Mode tidak dikenali. Gunakan #kbli, #kbji, atau #publikasi";
  } catch (error) {
    console.error("❌ Error in generateAnswer:", error);
    return "Maaf, ada kendala teknis. Coba lagi ya!";
  }
}

/**
 * Handle KBLI/KBJI - Text Search + LLM Correction Layer
 */
async function handleKBLIKBJI(query, userId, db) {
  // 1. Expand query dengan sinonim
  const expandedQuery = expandQueryKBLI(query);
  console.log(`🔍 Expanded: "${expandedQuery}"`);

  // 2. Text search (MongoDB text index + scoring)
  let kbliResults = await db.searchKBLIText(expandedQuery);
  let kbjiResults = await db.searchKBJIText(expandedQuery);

  // 3. Fallback to regex if text search returns nothing
  if (kbliResults.length === 0) {
    console.log("⚠️ Text search empty for KBLI, trying regex...");
    const keywords = extractKeywords(expandedQuery);
    kbliResults = await db.searchKBLIRegex(keywords, MAX_RESULTS.text_search);
  }

  if (kbjiResults.length === 0) {
    console.log("⚠️ Text search empty for KBJI, trying regex...");
    const keywords = extractKeywords(expandedQuery);
    kbjiResults = await db.searchKBJIRegex(keywords, MAX_RESULTS.text_search);
  }

  console.log(
    `📊 Found: ${kbliResults.length} KBLI, ${kbjiResults.length} KBJI`
  );

  // 4. If still nothing found
  if (kbliResults.length === 0 && kbjiResults.length === 0) {
    return await callLLM(query, [], "kbli_kbji", userId);
  }

  // ambil top N sesuai constants
  const topKBLI = kbliResults.slice(0, TOP_LIMITS.KBLI).map((r) => ({
    kode: String(r.kode_5_digit || ""),
    judul: String(r.judul || ""),
    deskripsi: String(r.deskripsi || "").slice(0, 200),
    type: "KBLI",
  }));

  const topKBJI = kbjiResults.slice(0, TOP_LIMITS.KBJI).map((r) => ({
    kode: String(r.kode_kbji_4d || ""),
    judul: String(r.title || ""),
    deskripsi: String(r.desc || "").slice(0, 200),
    type: "KBJI",
  }));

  console.log(
    `🎯 Dibatasi ke Top ${TOP_LIMITS.KBLI} KBLI dan ${TOP_LIMITS.KBJI} KBJI teratas`
  );

  // 6) Combine
  const candidates = dedupeKBLIKbji([...topKBLI, ...topKBJI]);

  // 🧹 SANITIZE: pastikan plain JSON (buang properti aneh/circular)
  const safeCandidates = candidates.map(({ kode, judul, deskripsi, type }) => ({
    kode: String(kode ?? ""),
    judul: String(judul ?? ""),
    deskripsi: String(deskripsi ?? ""),
    type: String(type ?? ""),
  }));

  try {
    return await callLLM(query, safeCandidates, "kbli_kbji", userId);
  } catch (err) {
    console.warn(
      "⚠️ LLM gagal, fallback ke DB-only:",
      err.message || String(err)
    );
    return renderClosedAnswerFromDB(topKBLI, topKBJI);
  }
}

/**
 * Handle Publikasi - Embedding + LLM Correction Layer
 */
async function handlePublikasi(query, userId, db) {
  // 1. Check if listing query
  if (isListingQuery(query)) {
    return await listAllDocuments(db);
  }

  // expand khusus untuk embedding
  const expandedQuery = await expandQueryPublikasi(query, userId);
  console.log(`🧩 Expanded (Publikasi/embedding): "${expandedQuery}"`);

  // 2. Embed query
  const queryEmb = await embedText(query, { mode: "publikasi" });

  if (!queryEmb) {
    return await callLLM(query, [], "publikasi", userId);
  }

  // 3. Search with embedding
  const docs = await db.findDocuments(
    {},
    { select: "title year source_type chunks" }
  );
  const results = await searchWithEmbedding(
    docs,
    queryEmb,
    TOP_LIMITS.PUBLIKASI
  );

  console.log(
    `🎯 Mengambil ${TOP_LIMITS.PUBLIKASI} publikasi teratas berdasarkan similarity`
  );

  // 4. Filter by similarity threshold
  const THRESHOLD = SIMILARITY_THRESHOLD.publikasi;
  let relevantResults = results.filter((r) => r.sim >= THRESHOLD);
  console.log(
    `✅ ${relevantResults.length} chunks above threshold (${THRESHOLD})`
  );

  // soft fallback: jika kosong, coba threshold lebih longgar
  if (relevantResults.length === 0 && THRESHOLD > 0.2) {
    relevantResults = results.filter((r) => r.sim >= 0.25);
    console.log(
      `↩️  No hits at ${THRESHOLD}. Retrying at 0.25 → ${relevantResults.length} hits`
    );
  }

  if (relevantResults.length === 0) {
    return await callLLM(query, [], "publikasi", userId);
  }

  // 6. Format for LLM
  const formattedDocs = relevantResults.map((r) => ({
    title: String(r.title ?? ""),
    year: String(r.year ?? ""),
    source_type: String(r.source_type ?? ""),
    deskripsi: String(r.deskripsi ?? ""),
    similarity: Number(r.sim ?? 0),
  }));

  // 🧩 NEW: tambahkan fallback juga untuk publikasi
  try {
    return await callLLM(query, formattedDocs, "publikasi", userId);
  } catch (err) {
    console.warn(
      "⚠️ LLM gagal, fallback publikasi:",
      err.message || String(err)
    );
    return renderClosedAnswerFromDocs(formattedDocs);
  }
}

/**
 * Render fallback manual untuk KBLI/KBJI jika LLM gagal
 */
function renderClosedAnswerFromDB(kbliTop3 = [], kbjiTop3 = []) {
  let out = "Berikut kemungkinan yang paling relevan:\n\n";
  if (kbliTop3.length) {
    out += "KBLI (usaha/kegiatan):\n";
    kbliTop3.slice(0, 3).forEach((d, i) => {
      out += `${i + 1}. [${d.kode}] ${d.judul}\n   ${
        d.deskripsi?.slice(0, 180) || "-"
      }\n\n`;
    });
  }
  if (kbjiTop3.length) {
    out += "KBJI (pekerjaan/okupasi):\n";
    kbjiTop3.slice(0, 3).forEach((d, i) => {
      out += `${i + 1}. [${d.kode}] ${d.judul}\n   ${
        d.deskripsi?.slice(0, 180) || "-"
      }\n\n`;
    });
  }
  out += "💡 Gunakan kata kunci lain bila hasil kurang sesuai.";
  return out.trim();
}

/**
 * Render fallback manual untuk publikasi
 */
function renderClosedAnswerFromDocs(docs = []) {
  let out = "📚 Publikasi terkait yang berhasil ditemukan:\n\n";
  docs.slice(0, 5).forEach((d, i) => {
    out += `${i + 1}. ${d.title} (${d.year || "n/a"})\n   ${
      d.deskripsi?.slice(0, 200) || "-"
    }\n\n`;
  });
  out += "💡 Jika data belum muncul lengkap, coba kata kunci lain.";
  return out.trim();
}

/**
 * Search documents with embedding (cosine similarity)
 */
async function searchWithEmbedding(docs, queryEmb, topK) {
  const withSim = [];

  for (const doc of docs) {
    if (!doc.chunks || doc.chunks.length === 0) continue;

    for (const chunk of doc.chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;

      const sim = cosineSimilarity(queryEmb, chunk.embedding);

      withSim.push({
        title: doc.title,
        year: doc.year,
        source_type: doc.source_type,
        deskripsi: (chunk.text || "").substring(0, 200),
        sim: sim,
      });
    }
  }

  return withSim.sort((a, b) => b.sim - a.sim).slice(0, topK);
}

/**
 * Cosine similarity
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;

  let dot = 0,
    normA = 0,
    normB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Query expansion dengan sinonim dari config
 */
function expandQueryKBLI(query) {
  const keywords = extractKeywords(query);
  const expandedTerms = new Set(keywords);

  keywords.forEach((keyword) => {
    if (SYNONYMS[keyword]) {
      SYNONYMS[keyword].forEach((syn) => expandedTerms.add(syn));
    }
  });

  return Array.from(expandedTerms).join(" ") || query;
}

/**
 * PUBLIKASI/EMBEDDING: perluasan kata kunci secukupnya (tetap keyword style),
 * bukan kalimat panjang – agar embedding fokus ke topik.
 * (Tanpa LLM dulu; kalau nanti mau, gampang diaktifkan.)
 */
async function expandQueryPublikasi(query, userId = "default") {
  const q = query.trim().toLowerCase();
  const kw = extractKeywords(q);

  // base context supaya query super pendek tetap punya ‘anchor’ domain
  let expanded = `${kw.join(" ")} kabupaten demak bps publikasi statistik data`;

  // tambah paket topik kalau ada kata kunci yang cocok
  Object.keys(PUB_KW).forEach((key) => {
    if (q.includes(key) || kw.includes(key)) {
      expanded += " " + PUB_KW[key];
    }
  });

  // jika terlalu pendek (<=3 kata), tambahkan booster generik
  if (kw.length <= 3) {
    expanded += " tren indikator definisi metodologi seri waktu";
  }

  // (opsional) Kalau nanti mau aktifkan LLM rephrase, taruh di sini, tapi
  // untuk embedding lebih aman pakai keyword bag-of-words agar tidak noise.
  return expanded.trim();
}

/**
 * Extract keywords (remove stopwords dari config)
 */
function extractKeywords(query) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.includes(word))
    .slice(0, 5);
}

/**
 * Check if query is asking for list
 */
function isListingQuery(query) {
  const lowerQuery = query.toLowerCase();
  return LISTING_KEYWORDS.some((kw) => lowerQuery.includes(kw));
}

/**
 * List all documents
 */
async function listAllDocuments(db) {
  const allDocs = await db.findAllDocumentsMetadata();

  if (!allDocs.length) {
    return "Maaf, saat ini belum ada publikasi yang tersedia.";
  }

  // Group by year
  const byYear = {};
  allDocs.forEach((doc) => {
    const year = doc.year || "Tidak diketahui";
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(doc);
  });

  let response = "📚 Publikasi yang tersedia:\n\n";

  Object.keys(byYear)
    .sort((a, b) => b.localeCompare(a))
    .forEach((year) => {
      response += `**${year}:**\n`;
      byYear[year].forEach((doc, i) => {
        let tags = "";
        if (doc.tags && Array.isArray(doc.tags) && doc.tags.length > 0) {
          tags = ` #${doc.tags.slice(0, 2).join(" #")}`;
        }
        response += `${i + 1}. ${doc.title} [${doc.source_type}]${tags}\n`;
      });
      response += "\n";
    });

  response += "💡 Tanya detail publikasi dengan menyebutkan judulnya!";

  return response;
}

/**
 * Utility: de-duplicate KBLI/KBJI list by (type + kode)
 * (kadang regex fallback bisa mengembalikan item mirip)
 */
function dedupeKBLIKbji(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.type}:${it.kode}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}
