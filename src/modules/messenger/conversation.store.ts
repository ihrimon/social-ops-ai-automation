import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { createRepository } from "../../integrations/mongo/repository.js";
import { createEmbedding } from "../knowledge/embedding.service.js";

interface ConversationMessageDoc {
  userId: string;
  role: string;
  text: string;
  hasEmbedding: boolean;
  embedding?: number[];
  createdAt: Date;
  isHumanAdmin?: boolean;
}

const MAX_MESSAGES_PER_USER = 60;
const RECENT_MESSAGES_PER_REPLY = 6;
const RELEVANT_MESSAGES_PER_REPLY = 4;

const conversationRepo = createRepository<ConversationMessageDoc>(
  config.mongodbConversationsCollection
);

let vectorSearchUnavailable = false;

function normalizeMessage(message: any) {
  return {
    role: message.role,
    text: message.text,
    createdAt: message.createdAt?.toISOString?.() || message.createdAt,
  };
}

async function getRecentMessages(collection: any, userId: string) {
  const messages = await collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(RECENT_MESSAGES_PER_REPLY)
    .project({ _id: 0, role: 1, text: 1, createdAt: 1 })
    .toArray();

  return messages.reverse().map(normalizeMessage);
}

async function getRelevantMessages(collection: any, userId: string, userMessage: string) {
  if (vectorSearchUnavailable || !userMessage) {
    return [];
  }

  try {
    const safeQuery = String(userMessage).slice(0, 1000);
    const queryVector = await createEmbedding(safeQuery);
    const messages = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: config.mongodbConversationVectorIndex,
            path: "embedding",
            queryVector,
            numCandidates: 50,
            limit: RELEVANT_MESSAGES_PER_REPLY,
            filter: { userId, hasEmbedding: true },
          },
        },
        {
          $project: {
            _id: 0,
            role: 1,
            text: 1,
            createdAt: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    return messages.map(normalizeMessage);
  } catch (error) {
    vectorSearchUnavailable = true;
    logger.warn("MongoDB vector search unavailable. Falling back to recent messages only:", {
      error: (error as Error).message,
    });
    return [];
  }
}

async function trimOldMessages(collection: any, userId: string) {
  const oldMessages = await collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .skip(MAX_MESSAGES_PER_USER)
    .project({ _id: 1 })
    .toArray();

  if (oldMessages.length) {
    await collection.deleteMany({
      _id: { $in: oldMessages.map((message: any) => message._id) },
    });
  }
}

export async function getConversationContext(userId: string, userMessage = "") {
  if (!config.mongodbUri) {
    logger.warn("MONGODB_URI is not set. Skipping conversation memory retrieval.");
    return { recentMessages: [], relevantMemories: [] };
  }
  const collection = await conversationRepo.collection();

  const [recentMessages, relevantMemories] = await Promise.all([
    getRecentMessages(collection, userId),
    getRelevantMessages(collection, userId, userMessage),
  ]);

  const recentKeys = new Set(
    recentMessages.map((message: any) => `${message.role}:${message.text}`)
  );

  return {
    recentMessages,
    relevantMemories: relevantMemories.filter(
      (message: any) => !recentKeys.has(`${message.role}:${message.text}`)
    ),
  };
}

export async function addConversationMessage(
  userId: string,
  role: string,
  text: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!config.mongodbUri) {
    logger.warn("MONGODB_URI is not set. Skipping saving conversation message.");
    return;
  }
  const collection = await conversationRepo.collection();
  const createdAt = new Date();

  const safeText = String(text || "").trim();
  const truncatedText = safeText.length > 1000 ? safeText.slice(0, 1000) + "..." : safeText;
  const shouldEmbed = role === "user" && truncatedText.length >= 12;
  const embedding = shouldEmbed ? await createEmbedding(truncatedText) : null;

  await collection.insertOne({
    userId,
    role,
    text: truncatedText,
    hasEmbedding: Boolean(embedding),
    ...(embedding ? { embedding } : {}),
    createdAt,
    ...metadata,
  } as any);

  await trimOldMessages(collection, userId);
}

export async function getLastHumanInteractionTime(userId: string): Promise<Date | null> {
  if (!config.mongodbUri) {
    return null;
  }
  try {
    const collection = await conversationRepo.collection();
    const lastMessage = await collection.findOne({ userId, isHumanAdmin: true } as any, {
      sort: { createdAt: -1 },
    });
    return lastMessage ? new Date((lastMessage as any).createdAt) : null;
  } catch (error) {
    logger.error("Failed to fetch last human interaction time:", {
      error: (error as Error).message,
    });
    return null;
  }
}
