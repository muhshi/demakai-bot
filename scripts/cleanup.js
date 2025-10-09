import "dotenv/config";
import { connectDB, disconnectDB, Session } from "../src/db.js";

async function main() {
  try {
    console.log("🔌 Connecting to database...");
    await connectDB();

    console.log("\n⚠️  WARNING: This will delete ALL sessions data!");
    console.log("═══════════════════════════════════════");
    console.log("This action CANNOT be undone.");
    console.log("Press Ctrl+C to abort within 5 seconds...");
    console.log("═══════════════════════════════════════\n");

    await new Promise((res) => setTimeout(res, 5000));

    console.log("🗑️  Starting cleanup...");

    const result = await Session.deleteMany({});

    console.log(`\n✅ Deleted ${result.deletedCount} sessions.`);
    console.log("✅ Cleanup completed successfully!\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
