import { mongoConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { MessageDedupe, type MessageDedupeDoc } from "./dedupe.model.js";
import type { Model } from "mongoose";

const botSentMessageMemory = new Set<string>();

export async function rememberIncomingMessage(
  messageId: string,
  senderId: string,
  model: Model<MessageDedupeDoc> = MessageDedupe
): Promise<boolean> {
  try {
    await model.create({ messageId, senderId });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return false;
    }

    throw error;
  }
}

export async function rememberBotSentMessage(
  messageId: string,
  model: Model<MessageDedupeDoc> = MessageDedupe
): Promise<void> {
  if (!messageId) return;
  botSentMessageMemory.add(messageId);
  setTimeout(() => botSentMessageMemory.delete(messageId), 120000);

  if (!mongoConfig.uri) return;

  try {
    await model.create({ messageId: `bot_sent:${messageId}`, isBotSent: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) {
      logger.error("Failed to store bot sent message ID in DB:", { error: errorMessage(error) });
    }
  }
}

export async function isBotSentMessage(
  messageId: string,
  model: Model<MessageDedupeDoc> = MessageDedupe
): Promise<boolean> {
  if (!messageId) return false;
  if (botSentMessageMemory.has(messageId)) return true;

  if (!mongoConfig.uri) return false;

  try {
    const doc = await model.exists({ messageId: `bot_sent:${messageId}` });
    return Boolean(doc);
  } catch (error) {
    logger.error("Failed to check bot sent message ID from DB:", { error: errorMessage(error) });
    return false;
  }
}
