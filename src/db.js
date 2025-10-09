import mongoose from "mongoose";

// ==================== SCHEMAS ====================

// KBLI Schema
const kbliSchema = new mongoose.Schema(
  {
    kode_5_digit: { type: String, required: true, unique: true, index: true },
    judul: { type: String, required: true },
    deskripsi: String,
    // NO embedding field - karena tidak ada di DB
  },
  { collection: "KBLI2020" }
);

// Text index untuk full-text search (pastikan sudah dibuat di MongoDB)
kbliSchema.index({ judul: "text", deskripsi: "text" });

// KBJI Schema
const kbjiSchema = new mongoose.Schema(
  {
    kode_kbji_4d: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    desc: String,
    // NO embedding field
  },
  { collection: "KBJI2014" }
);

kbjiSchema.index({ title: "text", desc: "text" });

// Document Schema
const docSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    year: String,
    source_type: String,
    tags: [String],
    chunks: [
      {
        text: String,
        embedding: [Number], // Publikasi punya embedding
      },
    ],
  },
  { collection: "Document" }
);

// Session Schema - Enhanced untuk mode tracking
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    phoneNumber: String,
    messageCount: { type: Number, default: 0 },
    lastMessage: String,
    lastInteraction: { type: Date, default: Date.now, index: true },
    firstInteraction: { type: Date, default: Date.now },

    // Mode tracking
    currentMode: {
      type: String,
      enum: ["natural", "kbli_kbji", "publikasi"],
      default: "natural",
    },
    modeActivatedAt: { type: Date },
    lastQuery: String, // Store last query untuk context

    isBlocked: { type: Boolean, default: false },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    collection: "sessions",
    timestamps: true,
  }
);

sessionSchema.index({ lastInteraction: -1 });
sessionSchema.index({ currentMode: 1 });

// Models
export const KBLI = mongoose.model("KBLI", kbliSchema, "KBLI2020");
export const KBJI = mongoose.model("KBJI", kbjiSchema, "KBJI2014");
export const Document = mongoose.model("Document", docSchema, "Document");
export const Session = mongoose.model("Session", sessionSchema, "sessions");

// ==================== DATABASE INTERFACE ====================

class DatabaseAdapter {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) {
      console.log("✅ Already connected to MongoDB");
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "demakAI",
      maxPoolSize: 10,
    });

    this.isConnected = true;
    console.log("✅ MongoDB connected");
  }

  async disconnect() {
    if (!this.isConnected) return;

    await mongoose.disconnect();
    this.isConnected = false;
    console.log("📴 MongoDB disconnected");
  }

  // ==================== KBLI Operations (Text Search Only) ====================

  async searchKBLIText(query, limit = 20) {
    try {
      // MongoDB text search dengan scoring
      const results = await KBLI.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();

      return results;
    } catch (error) {
      console.error("Text search error:", error.message);
      return [];
    }
  }

  async searchKBLIRegex(keywords, limit = 20) {
    if (!keywords || keywords.length === 0) return [];

    const regexQueries = keywords.map((kw) => new RegExp(kw, "i"));

    return await KBLI.find({
      $or: [
        { judul: { $in: regexQueries } },
        { deskripsi: { $in: regexQueries } },
      ],
    })
      .limit(limit)
      .lean();
  }

  // ==================== KBJI Operations (Text Search Only) ====================

  async searchKBJIText(query, limit = 25) {
    try {
      const results = await KBJI.find(
        { $text: { $search: query } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();

      return results;
    } catch (error) {
      console.error("Text search error:", error.message);
      return [];
    }
  }

  async searchKBJIRegex(keywords, limit = 25) {
    if (!keywords || keywords.length === 0) return [];

    const regexQueries = keywords.map((kw) => new RegExp(kw, "i"));

    return await KBJI.find({
      $or: [{ title: { $in: regexQueries } }, { desc: { $in: regexQueries } }],
    })
      .limit(limit)
      .lean();
  }

  // ==================== Document Operations (With Embeddings) ====================

  async findDocuments(filter = {}, options = {}) {
    return await Document.find(filter)
      .select(options.select || "title year source_type tags chunks")
      .lean();
  }

  async findAllDocumentsMetadata() {
    return await Document.find({})
      .select("title year source_type tags")
      .sort({ year: -1 })
      .lean();
  }

  // ==================== Session Operations ====================

  async getSession(userId) {
    const session = await Session.findOne({ userId }).lean();

    // Check if mode should auto-reset (15 min idle)
    if (
      session &&
      session.currentMode !== "natural" &&
      session.modeActivatedAt
    ) {
      const idleTime = Date.now() - new Date(session.modeActivatedAt).getTime();
      const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

      if (idleTime > IDLE_TIMEOUT) {
        console.log(`⏰ Auto-reset mode for ${userId} (idle > 15min)`);

        // kirim pesan perpisahan ringan (kalau bot WA aktif)
        try {
          if (global.waClient?.sendMessage) {
            await global.waClient.sendMessage(
              userId,
              "✨ Karena sudah 15 menit berlalu, kita kembali ke mode natural ya!!, silakan tanya apa saja.. 😊"
            );
          }
        } catch (err) {
          console.warn("⚠️ Gagal mengirim pesan auto-reset:", err.message);
        }
        
        await this.resetMode(userId);
        return { ...session, currentMode: "natural", modeActivatedAt: null };
      }
    }

    return session;
  }

  async createOrUpdateSession(userId, data) {
    return await Session.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...data,
          lastInteraction: new Date(),
        },
        $setOnInsert: {
          firstInteraction: new Date(),
          messageCount: 0,
          isBlocked: false,
          currentMode: "natural",
        },
      },
      { upsert: true, new: true, lean: true }
    );
  }

  async setMode(userId, mode, query = null) {
    return await Session.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentMode: mode,
          modeActivatedAt: new Date(),
          lastQuery: query,
          lastInteraction: new Date(),
        },
      },
      { upsert: true, new: true, lean: true }
    );
  }

  async resetMode(userId) {
    return await Session.findOneAndUpdate(
      { userId },
      {
        $set: {
          currentMode: "natural",
          modeActivatedAt: null,
          lastQuery: null,
          lastInteraction: new Date(),
        },
      },
      { new: true, lean: true }
    );
  }

  async incrementMessageCount(userId) {
    return await Session.updateOne(
      { userId },
      {
        $inc: { messageCount: 1 },
        $set: { lastInteraction: new Date() },
      }
    );
  }

  async getActiveUsersCount(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await Session.countDocuments({
      lastInteraction: { $gte: since },
      isBlocked: false,
    });
  }

  async cleanupOldSessions(daysInactive = 90) {
    const cutoffDate = new Date(
      Date.now() - daysInactive * 24 * 60 * 60 * 1000
    );
    const result = await Session.deleteMany({
      lastInteraction: { $lt: cutoffDate },
      isBlocked: false,
    });
    console.log(
      `🗑️ Deleted ${result.deletedCount} old sessions (> ${daysInactive}d)`
    );
    return result.deletedCount;
  }

  /**
   * 🧹 Kosongkan conversationHistory dari user yang idle > X jam (default 24h)
   * Tidak menghapus session, hanya metadata.history
   */
  async cleanupOldHistories(hoursInactive = 24) {
    const cutoff = new Date(Date.now() - hoursInactive * 60 * 60 * 1000);
    const sessions = await Session.find({
      lastInteraction: { $lt: cutoff },
      "metadata.conversationHistory.0": { $exists: true },
    }).lean();

    let cleaned = 0;
    for (const s of sessions) {
      await Session.updateOne(
        { userId: s.userId },
        { $set: { "metadata.conversationHistory": [] } }
      );
      cleaned++;
    }
    console.log(
      `🧹 Cleared conversation history from ${cleaned} sessions (> ${hoursInactive}h idle)`
    );
    return cleaned;
  }

  // ==================== Statistics ====================

  async getStats() {
    const [kbliCount, kbjiCount, docCount, sessionCount, activeUsers] =
      await Promise.all([
        KBLI.countDocuments(),
        KBJI.countDocuments(),
        Document.countDocuments(),
        Session.countDocuments(),
        this.getActiveUsersCount(24),
      ]);

    const totalMessages = await Session.aggregate([
      { $group: { _id: null, total: { $sum: "$messageCount" } } },
    ]);

    const modeDistribution = await Session.aggregate([
      { $match: { isBlocked: false } },
      { $group: { _id: "$currentMode", count: { $sum: 1 } } },
    ]);

    return {
      kbli: kbliCount,
      kbji: kbjiCount,
      documents: docCount,
      sessions: sessionCount,
      activeUsers24h: activeUsers,
      totalMessages: totalMessages[0]?.total || 0,
      modeDistribution: modeDistribution.map((m) => ({
        mode: m._id,
        count: m.count,
      })),
    };
  }
}

// Singleton instance
let dbInstance = null;

export async function connectDB() {
  if (!dbInstance) {
    dbInstance = new DatabaseAdapter();
  }
  await dbInstance.connect();
  return dbInstance;
}

export function getDB() {
  if (!dbInstance) {
    throw new Error("Database not connected. Call connectDB() first.");
  }
  return dbInstance;
}

export async function disconnectDB() {
  if (dbInstance) {
    await dbInstance.disconnect();
    dbInstance = null;
  }
}
