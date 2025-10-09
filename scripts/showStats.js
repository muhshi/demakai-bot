import "dotenv/config";
import { connectDB, disconnectDB, getDB } from "../src/db.js";

async function main() {
  try {
    console.log("🔌 Connecting to database...");
    await connectDB();

    console.log("📊 Collecting statistics...\n");

    const db = getDB();
    const stats = await db.getStats();

    console.log("═══════════════════════════════════════");
    console.log("📊 DATABASE STATISTICS");
    console.log("═══════════════════════════════════════\n");

    console.log("📚 Collections:");
    console.table({
      KBLI: stats.kbli,
      KBJI: stats.kbji,
      Documents: stats.documents,
      Sessions: stats.sessions,
    });

    console.log("\n👥 User Activity:");
    console.table({
      "Active (24h)": stats.activeUsers24h,
      "Total Messages": stats.totalMessages,
    });

    if (stats.modeDistribution && stats.modeDistribution.length > 0) {
      console.log("\n🎯 Mode Distribution:");
      const modeTable = {};
      stats.modeDistribution.forEach((m) => {
        modeTable[m.mode] = m.count;
      });
      console.table(modeTable);
    }

    console.log("\n═══════════════════════════════════════");
    console.log("✅ Statistics collected successfully!");
    console.log("═══════════════════════════════════════");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
