import axios from "axios";
import crypto from "crypto";

// In-memory cache
const embeddingCache = new Map();
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Smart embedding - hanya untuk publikasi mode
 * KBLI/KBJI tidak perlu embedding karena pakai text search
 */
export async function embedText(text, options = {}) {
  const { useCache = true, maxRetries = 3, mode = null } = options;

  try {
    // PENTING: Skip embedding untuk KBLI/KBJI queries
    if (mode === "kbli_kbji") {
      console.log("⏭️ Skipping embedding for KBLI/KBJI (text search only)");
      return null;
    }

    const processedText = preprocessText(text);

    if (!processedText || processedText.trim().length === 0) {
      console.warn("⚠️ Empty text after preprocessing");
      return generateZeroVector();
    }

    // Check cache
    if (useCache) {
      const cached = getCachedEmbedding(processedText);
      if (cached) {
        console.log("✅ Cache hit for embedding");
        return cached;
      }
    }

    // Generate embedding with retry
    const embedding = await generateEmbeddingWithRetry(
      processedText,
      maxRetries
    );

    // Cache the result
    if (useCache && embedding) {
      cacheEmbedding(processedText, embedding);
    }

    return embedding;
  } catch (error) {
    console.error("❌ Fatal error in embedText:", error.message);
    return generateZeroVector();
  }
}

/**
 * Generate embedding dengan retry mechanism
 */
async function generateEmbeddingWithRetry(text, maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `${process.env.OLLAMA_BASE_URL}/api/embeddings`;

      const resp = await axios.post(
        url,
        {
          model: process.env.EMBEDDING_MODEL || "bge-m3",
          prompt: text,
        },
        { timeout: 30000 }
      );

      if (!resp.data || !resp.data.embedding) {
        throw new Error("Invalid response from Ollama");
      }

      console.log(
        `✅ Embedding generated (dim: ${resp.data.embedding.length})`
      );
      return resp.data.embedding;
    } catch (error) {
      lastError = error;
      console.error(
        `❌ Embedding attempt ${attempt}/${maxRetries} failed:`,
        error.message
      );

      if (error.response?.status === 400 || error.response?.status === 404) {
        throw error;
      }

      if (attempt < maxRetries) {
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        await sleep(waitTime);
      }
    }
  }

  throw new Error(
    `Embedding failed after ${maxRetries} attempts: ${lastError.message}`
  );
}

/**
 * Batch embedding untuk publikasi documents
 */
export async function embedBatch(texts, options = {}) {
  const {
    batchSize = 5,
    delayBetweenBatches = 500,
    onProgress = null,
    mode = "publikasi", // Default publikasi
  } = options;

  // Skip jika mode KBLI/KBJI
  if (mode === "kbli_kbji") {
    console.log("⏭️ Skipping batch embedding for KBLI/KBJI");
    return texts.map(() => null);
  }

  const results = [];
  const totalBatches = Math.ceil(texts.length / batchSize);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;

    console.log(`📦 Processing batch ${currentBatch}/${totalBatches}`);

    const batchResults = await Promise.all(
      batch.map((text, idx) =>
        embedText(text, { ...options, mode }).then((emb) => {
          if (onProgress) {
            onProgress(i + idx + 1, texts.length);
          }
          return emb;
        })
      )
    );

    results.push(...batchResults);

    if (i + batchSize < texts.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Preprocess text
 */
function preprocessText(text) {
  if (!text) return "";

  return text.toLowerCase().replace(/\s+/g, " ").trim().substring(0, 2000);
}

/**
 * Cache management
 */
function getCacheKey(text) {
  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .substring(0, 16);
}

function getCachedEmbedding(text) {
  const key = getCacheKey(text);
  const cached = embeddingCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    embeddingCache.delete(key);
    return null;
  }

  return cached.embedding;
}

function cacheEmbedding(text, embedding) {
  const key = getCacheKey(text);

  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    embeddingCache.delete(firstKey);
  }

  embeddingCache.set(key, {
    embedding,
    timestamp: Date.now(),
  });
}

function generateZeroVector() {
  const dimension = parseInt(process.env.EMBEDDING_DIMENSION || "1024");
  return new Array(dimension).fill(0);
}

export function clearEmbeddingCache() {
  const size = embeddingCache.size;
  embeddingCache.clear();
  console.log(`🗑️ Cleared ${size} cached embeddings`);
}

export function getCacheStats() {
  return {
    size: embeddingCache.size,
    maxSize: CACHE_MAX_SIZE,
    usage: `${((embeddingCache.size / CACHE_MAX_SIZE) * 100).toFixed(1)}%`,
  };
}

/**
 * Health check untuk Ollama
 */
export async function checkOllamaHealth() {
  try {
    const url = `${process.env.OLLAMA_BASE_URL}/api/tags`;
    const resp = await axios.get(url, { timeout: 5000 });

    const models = resp.data.models || [];
    const embeddingModel = process.env.EMBEDDING_MODEL || "bge-m3";
    const llmModel = process.env.LLM_MODEL || "llama3.1:8b";

    return {
      status: "healthy",
      available: true,
      embeddingModelLoaded: models.some((m) => m.name.includes(embeddingModel)),
      llmModelLoaded: models.some((m) => m.name.includes(llmModel)),
      models: models.map((m) => m.name),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      available: false,
      error: error.message,
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
