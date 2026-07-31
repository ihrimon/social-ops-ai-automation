import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { generateContent } from "../../ai/client.js";
import { ValidationError, errorMessage } from "../../infra/errors.js";
import { MONTHLY_TOPICS_PROMPT } from "../../ai/prompts/topics.prompt.js";
import { createRepository } from "../../integrations/mongo/repository.js";

interface TopicDoc {
  topic: string;
  used: boolean;
  createdAt: Date;
  usedAt: Date | null;
}

const topicsRepo = createRepository<TopicDoc>(config.mongodbTopicsCollection);

export async function generateMonthlyTopics(): Promise<string[]> {
  try {
    const text = await generateContent(config.model, MONTHLY_TOPICS_PROMPT);
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

export async function addTopics(topicsArray: string[]): Promise<void> {
  if (!Array.isArray(topicsArray) || topicsArray.length === 0) {
    return;
  }
  const collection = await topicsRepo.collection();
  const docs: TopicDoc[] = topicsArray.map((topic) => ({
    topic,
    used: false,
    createdAt: new Date(),
    usedAt: null,
  }));
  await collection.insertMany(docs);
}

export async function getNextTopicFromDb(): Promise<{ topic: string; remaining: number } | null> {
  const collection = await topicsRepo.collection();

  // Atomically find and mark the oldest unused topic
  const nextDoc = await collection.findOneAndUpdate(
    { used: false },
    { $set: { used: true, usedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );

  if (!nextDoc) {
    return null;
  }

  // Get remaining unused topics count
  const remaining = await collection.countDocuments({ used: false });

  return {
    topic: (nextDoc as any).topic,
    remaining,
  };
}

export async function getUnusedTopicCount(): Promise<number> {
  const collection = await topicsRepo.collection();
  return collection.countDocuments({ used: false });
}
