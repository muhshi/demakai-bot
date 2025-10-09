import "dotenv/config";
import { embedText, checkOllamaHealth, getCacheStats } from "./embedding.js";
import { connectDB, disconnectDB } from "./db.js";
import { handleMessage } from "./handlers.js";
import { generateAnswer } from "./rag.js";

async function runTests() {
  console.log("🧪 Running DemakAI Test Suite\n");

  try {
    await testDB();
    await testOllama();
    await testEmbedding();
    await testRAG();
    await testHandler();

    console.log("\n✅ All tests completed!");
  } catch (err) {
    console.error("❌ Test failed:", err);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

async function testDB() {
  console.log("📊 DB connection test");
  await connectDB();
  console.log("   ✅ DB connected\n");
}

async function testOllama() {
  console.log("🏥 Ollama health check");
  const h = await checkOllamaHealth();
  console.log("   Available:", h.available, "Models:", h.models);
  if (!h.available) console.warn("   ⚠️ Ollama unavailable");
  console.log("");
}

async function testEmbedding() {
  console.log("🔢 Embedding test");
  const e1 = await embedText("kopi cafe");
  const e2 = await embedText("kopi cafe"); // should cache
  console.log("   ✅ Dimension:", e1.length, " Cache stats:", getCacheStats());
  console.log("");
}

async function testRAG() {
  console.log("🔍 RAG pipeline test");
  const q = "#kbli usaha fotokopi";
  const ans = await generateAnswer(q, "tester");
  console.log("   ✅ Answer:", ans.substring(0, 80), "...\n");
}

async function testHandler() {
  console.log("💬 Handler test");
  const msgs = [
    "Halo",
    "#KBLI untuk toko online",
    "data kemiskinan",
    "terima kasih",
  ];
  for (const m of msgs) {
    const r = await handleMessage("tester", m);
    console.log("   Input:", m, " → Output:", r.substring(0, 60));
  }
  console.log("");
}

runTests();
