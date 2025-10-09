import "dotenv/config";
import { connectDB, disconnectDB } from "../src/db.js";
import {
  cleanupOldSessions,
  getActiveUsersCount,
  cleanupOldHistories,
} from "../src/session.js";

async function main() {
  try {
    console.log("🔌 Connecting to database...");
    await connectDB();

    // Get inactiveDays dari env atau default 90
    const inactiveDays = parseInt(process.env.CLEANUP_INACTIVE_DAYS || "90");
    const cutoffDate = new Date(
      Date.now() - inactiveDays * 24 * 60 * 60 * 1000
    );

    console.log("\n🗑️  Cleaning up old sessions...");
    console.log("═══════════════════════════════════════");
    console.log(`Inactive threshold: ${inactiveDays} days`);
    console.log(`Cutoff date: ${cutoffDate.toISOString()}`);
    console.log("═══════════════════════════════════════\n");

    const deletedCount = await cleanupOldSessions(inactiveDays);

    console.log(`✅ Deleted ${deletedCount} inactive sessions.`);

    // Show remaining active sessions
    const activeCount = await getActiveUsersCount(24);
    const activeCount7d = await getActiveUsersCount(24 * 7);

    console.log("\n📊 Remaining sessions:");
    console.table({
      "Active (24h)": activeCount,
      "Active (7d)": activeCount7d,
    });
    console.log("\n🧹 Cleaning up old conversation histories (>24h idle)...");
    const cleanedHistory = await cleanupOldHistories(24);
    console.log(`✅ Cleared ${cleanedHistory} conversation histories.`);

    console.log("\n✅ Cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
