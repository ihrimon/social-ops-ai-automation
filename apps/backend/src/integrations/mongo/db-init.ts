import { mongoConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { syncKnowledgeBase } from "../../modules/knowledge/knowledge.store.js";
import { MessageDedupe } from "../../modules/messenger/dedupe.model.js";
import { ConversationMessage } from "../../modules/messenger/conversation.model.js";
import { PendingReply } from "../../modules/messenger/pending-reply.model.js";
import { Lead } from "../../modules/messenger/lead.model.js";
import { CommentDedupe } from "../../modules/comments/dedupe.model.js";
import { PostLog } from "../../modules/content/post-log.model.js";
import { Topic } from "../../modules/content/topic.model.js";
import { KnowledgeChunk } from "../../modules/knowledge/knowledge-chunk.model.js";
import { EmbeddingCache } from "../../modules/knowledge/embedding-cache.model.js";
import { connectMongo } from "./client.js";

export async function initDatabase(): Promise<boolean> {
  logger.info("Initializing database connection and indexes...");

  if (!mongoConfig.uri) {
    logger.warn("MONGODB_URI is not set. Database integration is disabled.");
    return false;
  }

  try {
    await connectMongo();

    // Each model declares its own indexes on its schema; syncIndexes() creates
    // whatever is missing and drops whatever is no longer declared.
    await Promise.all([
      MessageDedupe.syncIndexes(),
      CommentDedupe.syncIndexes(),
      PendingReply.syncIndexes(),
      ConversationMessage.syncIndexes(),
      PostLog.syncIndexes(),
      KnowledgeChunk.syncIndexes(),
      EmbeddingCache.syncIndexes(),
      Topic.syncIndexes(),
      Lead.syncIndexes(),
    ]);

    // Run static knowledge base sync once on startup
    await syncKnowledgeBase();
    logger.info("Database initialized successfully.");
    return true;
  } catch (error) {
    logger.error("Database initialization failed:", { error: errorMessage(error) });
    throw error;
  }
}
