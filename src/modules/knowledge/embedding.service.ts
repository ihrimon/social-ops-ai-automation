import crypto from "crypto";
import { config } from "../../config/env.js";
import { createRepository } from "../../integrations/mongo/repository.js";
import { genAI, withRetry } from "../../ai/client.js";
import { ExternalServiceError, errorMessage } from "../../infra/errors.js";

interface EmbeddingCacheDoc {
  key: string;
  model: string;
  textPreview: string;
  embedding: number[];
  createdAt: Date;
  lastUsedAt: Date;
}

const cacheRepo = createRepository<EmbeddingCacheDoc>(config.mongodbEmbeddingCacheCollection);

function normalizeText(text: unknown): string {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function createEmbeddingKey(text: string): string {
  return crypto
    .createHash("sha256")
    .update(`${config.embeddingModel}:${normalizeText(text)}`)
    .digest("hex");
}

export async function createEmbedding(text: unknown): Promise<number[]> {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return [];
  }

  const key = createEmbeddingKey(normalizedText);
  const collection = await cacheRepo.collection();
  const cached = await collection.findOne({ key }, { projection: { _id: 0, embedding: 1 } });

  if (cached?.embedding?.length) {
    await collection.updateOne({ key }, { $set: { lastUsedAt: new Date() } });
    return cached.embedding;
  }

  const model = genAI.getGenerativeModel({ model: config.embeddingModel });
  let embedding: number[];
  try {
    const result = await withRetry(() => model.embedContent(normalizedText));
    embedding = result.embedding.values;
  } catch (error) {
    throw new ExternalServiceError("gemini", errorMessage(error), error);
  }
  const now = new Date();

  try {
    await collection.insertOne({
      key,
      model: config.embeddingModel,
      textPreview: normalizedText.slice(0, 300),
      embedding,
      createdAt: now,
      lastUsedAt: now,
    } as EmbeddingCacheDoc);
  } catch (error) {
    if ((error as any).code !== 11000) {
      throw error;
    }

    const winner = await collection.findOne({ key }, { projection: { _id: 0, embedding: 1 } });
    return winner?.embedding || embedding;
  }

  return embedding;
}
