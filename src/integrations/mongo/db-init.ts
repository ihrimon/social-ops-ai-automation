import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { syncKnowledgeBase } from "../../modules/knowledge/knowledge.store.js";
import { createRepository } from "./repository.js";

export async function initDatabase(): Promise<boolean> {
  logger.info("Initializing database connection and indexes...");

  if (!config.mongodbUri) {
    logger.warn("MONGODB_URI is not set. Database integration is disabled.");
    return false;
  }

  try {
    // 1. Initialize message dedupe indexes
    await createRepository(config.mongodbMessageDedupeCollection).ensureIndexes([
      { key: { messageId: 1 }, options: { unique: true } },
      { key: { createdAt: 1 }, options: { expireAfterSeconds: 3600 } },
    ]);

    // 2. Keep comment webhook IDs long enough to prevent public reply loops.
    await createRepository(config.mongodbCommentDedupeCollection).ensureIndexes([
      { key: { commentId: 1 }, options: { unique: true } },
      { key: { createdAt: 1 }, options: { expireAfterSeconds: 30 * 24 * 60 * 60 } },
    ]);

    // 3. One short-lived reply buffer per active Messenger user.
    await createRepository(config.mongodbPendingRepliesCollection).ensureIndexes([
      { key: { userId: 1 }, options: { unique: true } },
      { key: { status: 1, hasPendingMessages: 1, replyAt: 1 } },
      { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
    ]);

    // 4. Initialize conversation store indexes
    await createRepository(config.mongodbConversationsCollection).ensureIndexes([
      { key: { userId: 1, createdAt: -1 } },
      { key: { userId: 1, role: 1, createdAt: -1 } },
      { key: { userId: 1, hasEmbedding: 1, createdAt: -1 } },
    ]);

    // 5. Initialize post log store indexes (TTL 90 days)
    await createRepository(config.mongodbPostLogsCollection).ensureIndexes([
      { key: { status: 1, createdAt: -1 } },
      { key: { topic: 1, createdAt: -1 } },
      { key: { createdAt: -1 } },
      { key: { createdAt: 1 }, options: { expireAfterSeconds: 90 * 24 * 60 * 60 } },
    ]);

    // 6. Initialize knowledge store indexes
    await createRepository(config.mongodbKnowledgeCollection).ensureIndexes([
      { key: { key: 1 }, options: { unique: true } },
      { key: { source: 1, active: 1 } },
      { key: { title: "text", text: "text" } }, // For local/fallback BM25 matching
    ]);

    // 7. Initialize embedding cache indexes (TTL 60 days based on lastUsedAt)
    await createRepository(config.mongodbEmbeddingCacheCollection).ensureIndexes([
      { key: { key: 1 }, options: { unique: true } },
      { key: { lastUsedAt: 1 }, options: { expireAfterSeconds: 60 * 24 * 60 * 60 } },
    ]);

    // 8. Initialize topics collection indexes
    await createRepository(config.mongodbTopicsCollection).ensureIndexes([
      { key: { used: 1, createdAt: 1 } },
    ]);

    // 9. Run static knowledge base sync once on startup
    await syncKnowledgeBase();
    logger.info("Database initialized successfully.");
    return true;
  } catch (error) {
    logger.error("Database initialization failed:", { error: errorMessage(error) });
    throw error;
  }
}
