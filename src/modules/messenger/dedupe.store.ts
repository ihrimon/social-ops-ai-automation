import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { createRepository } from "../../integrations/mongo/repository.js";

const dedupeRepo = createRepository(config.mongodbMessageDedupeCollection);

const botSentMessageMemory = new Set<string>();

export async function rememberIncomingMessage(
  messageId: string,
  senderId: string
): Promise<boolean> {
  const collection = await dedupeRepo.collection();

  try {
    await collection.insertOne({
      messageId,
      senderId,
      createdAt: new Date(),
    } as any);
    return true;
  } catch (error) {
    if ((error as any).code === 11000) {
      return false;
    }

    throw error;
  }
}

export async function rememberBotSentMessage(messageId: string): Promise<void> {
  if (!messageId) return;
  botSentMessageMemory.add(messageId);
  setTimeout(() => botSentMessageMemory.delete(messageId), 120000);

  if (!config.mongodbUri) return;

  try {
    const collection = await dedupeRepo.collection();
    await collection.insertOne({
      messageId: `bot_sent:${messageId}`,
      isBotSent: true,
      createdAt: new Date(),
    } as any);
  } catch (error) {
    if ((error as any).code !== 11000) {
      logger.error("Failed to store bot sent message ID in DB:", {
        error: (error as Error).message,
      });
    }
  }
}

export async function isBotSentMessage(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  if (botSentMessageMemory.has(messageId)) return true;

  if (!config.mongodbUri) return false;

  try {
    const collection = await dedupeRepo.collection();
    const doc = await collection.findOne({ messageId: `bot_sent:${messageId}` } as any);
    return Boolean(doc);
  } catch (error) {
    logger.error("Failed to check bot sent message ID from DB:", {
      error: (error as Error).message,
    });
    return false;
  }
}
