import type { Model } from "mongoose";
import { aiConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { generateContent } from "../../ai/client.js";
import { ValidationError, errorMessage } from "../../infra/errors.js";
import { MONTHLY_TOPICS_PROMPT } from "../../ai/prompts/topics.prompt.js";
import { Topic, type TopicDoc } from "./topic.model.js";

export async function generateMonthlyTopics(): Promise<string[]> {
  try {
    const text = await generateContent(aiConfig.model, MONTHLY_TOPICS_PROMPT);
    const cleanedText = text
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/g, "")
      .trim();

    const topics = JSON.parse(cleanedText);

    if (!Array.isArray(topics) || topics.length === 0) {
      throw new ValidationError("Gemini returned an invalid topic list format");
    }

    return topics.slice(0, 30);
  } catch (error) {
    logger.error("Monthly topic generation failed:", { error: errorMessage(error) });
    throw error;
  }
}

export async function addTopics(
  topicsArray: string[],
  model: Model<TopicDoc> = Topic
): Promise<void> {
  if (!Array.isArray(topicsArray) || topicsArray.length === 0) {
    return;
  }
  await model.insertMany(
    topicsArray.map((topic) => ({
      topic,
      used: false,
      createdAt: new Date(),
      usedAt: null,
    }))
  );
}

export async function getNextTopicFromDb(
  model: Model<TopicDoc> = Topic
): Promise<{ id: string; topic: string; remaining: number } | null> {
  // Atomically find and mark the oldest unused topic
  const nextDoc = await model.findOneAndUpdate(
    { used: false },
    { $set: { used: true, usedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!nextDoc) {
    return null;
  }

  // Get remaining unused topics count
  const remaining = await model.countDocuments({ used: false });

  return {
    id: String(nextDoc._id),
    topic: nextDoc.topic,
    remaining,
  };
}

/**
 * Reverts a topic back to unused. Callers must invoke this when a topic was
 * claimed via getNextTopicFromDb() but the run failed before the Facebook
 * post actually succeeded, so the topic isn't lost from the queue.
 */
export async function revertTopicToUnused(
  id: string,
  model: Model<TopicDoc> = Topic
): Promise<void> {
  await model.updateOne({ _id: id, used: true }, { $set: { used: false, usedAt: null } });
}

export async function getUnusedTopicCount(model: Model<TopicDoc> = Topic): Promise<number> {
  return model.countDocuments({ used: false });
}
