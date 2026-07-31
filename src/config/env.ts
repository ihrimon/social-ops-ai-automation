import dotenv from "dotenv";
dotenv.config();

import { assertRequiredEnv } from "../infra/validation.js";

// Fail fast at boot instead of surfacing confusing errors deep inside a
// generation/posting flow later.
assertRequiredEnv(process.env);

/** Gemini / AI (required) + optional AI add-ons */
export const aiConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  model: "gemini-3.6-flash",
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
  imgbbApiKey: process.env.IMGBB_API_KEY,
  aiHordeApiKey: process.env.AI_HORDE_API_KEY || "gyU_LA6nswk_bt0cl83Ogg",
};

/** Facebook Graph API / Messenger / webhook */
export const facebookConfig = {
  pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN,
  pageId: process.env.FB_PAGE_ID,
  verifyToken: process.env.FB_VERIFY_TOKEN,
  appSecret: process.env.FB_APP_SECRET,
  graphApiVersion: process.env.FB_GRAPH_API_VERSION || "v23.0",
};

/** HTTP server. */
export const serverConfig = {
  port: process.env.PORT || 3000,
};

/** MongoDB connection, collection names, and vector search index names. */
export const mongoConfig = {
  uri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB_NAME || "social-ops-ai-automation",
  conversationsCollection: process.env.MONGODB_CONVERSATIONS_COLLECTION || "conversation_messages",
  conversationVectorIndex:
    process.env.MONGODB_CONVERSATION_VECTOR_INDEX ||
    process.env.MONGODB_VECTOR_INDEX ||
    "conversation_embedding_index",
  knowledgeCollection: process.env.MONGODB_KNOWLEDGE_COLLECTION || "knowledge_chunks",
  knowledgeVectorIndex: process.env.MONGODB_KNOWLEDGE_VECTOR_INDEX || "knowledge_embedding_index",
  embeddingCacheCollection: process.env.MONGODB_EMBEDDING_CACHE_COLLECTION || "embedding_cache",
  postLogsCollection: process.env.MONGODB_POST_LOGS_COLLECTION || "post_logs",
  messageDedupeCollection: process.env.MONGODB_MESSAGE_DEDUPE_COLLECTION || "processed_messages",
  commentDedupeCollection: process.env.MONGODB_COMMENT_DEDUPE_COLLECTION || "processed_comments",
  pendingRepliesCollection: process.env.MONGODB_PENDING_REPLIES_COLLECTION || "pending_replies",
  topicsCollection: process.env.MONGODB_TOPICS_COLLECTION || "topics",
  maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
  minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 0),
  serverSelectionTimeoutMs: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
};

/** Messenger consolidated-reply debounce queue/worker tuning. */
export const messengerConfig = {
  replyDebounceMs: Number(process.env.MESSENGER_REPLY_DEBOUNCE_MS || 20 * 1000),
  adminPauseMs: Number(process.env.MESSENGER_ADMIN_PAUSE_MS || 10 * 60 * 1000),
  replyPollMs: Number(process.env.MESSENGER_REPLY_POLL_MS || 10 * 1000),
  replyConcurrency: Number(process.env.MESSENGER_REPLY_CONCURRENCY || 3),
  replyLeaseMs: Number(process.env.MESSENGER_REPLY_LEASE_MS || 5 * 60 * 1000),
  replyRetryMs: Number(process.env.MESSENGER_REPLY_RETRY_MS || 60 * 1000),
  pendingMessageLimit: Number(process.env.MESSENGER_PENDING_MESSAGE_LIMIT || 20),
};

/** Convenience bundle — prefer importing the topic-specific config */
export const config = {
  ai: aiConfig,
  facebook: facebookConfig,
  server: serverConfig,
  mongo: mongoConfig,
  messenger: messengerConfig,
};
