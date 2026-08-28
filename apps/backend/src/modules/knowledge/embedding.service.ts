import crypto from "crypto";
import type { GoogleGenerativeAI } from "@google/generative-ai";
import type { Model } from "mongoose";
import { aiConfig } from "../../config/env.js";
import { genAI, withRetry } from "../../ai/client.js";
import { ExternalServiceError, errorMessage } from "../../infra/errors.js";
import { EmbeddingCache, type EmbeddingCacheDoc } from "./embedding-cache.model.js";

function normalizeText(text: unknown): string {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function createEmbeddingKey(text: string): string {
  return crypto
    .createHash("sha256")
    .update(`${aiConfig.embeddingModel}:${normalizeText(text)}`)
    .digest("hex");
}

export async function createEmbedding(
  text: unknown,
  model: Model<EmbeddingCacheDoc> = EmbeddingCache,
  aiClient: GoogleGenerativeAI = genAI
): Promise<number[]> {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return [];
  }

  const key = createEmbeddingKey(normalizedText);
  const cached = await model.findOne({ key }).select({ _id: 0, embedding: 1 }).lean();

  if (cached?.embedding?.length) {
    await model.updateOne({ key }, { $set: { lastUsedAt: new Date() } });
    return cached.embedding;
  }

  const geminiModel = aiClient.getGenerativeModel({ model: aiConfig.embeddingModel });
  let embedding: number[];
  try {
    const result = await withRetry(() => geminiModel.embedContent(normalizedText));
    embedding = result.embedding.values;
  } catch (error) {
    throw new ExternalServiceError("gemini", errorMessage(error), error);
  }
  const now = new Date();

  try {
    await model.create({
      key,
      model: aiConfig.embeddingModel,
      textPreview: normalizedText.slice(0, 300),
      embedding,
      createdAt: now,
      lastUsedAt: now,
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) {
      throw error;
    }

    const winner = await model.findOne({ key }).select({ _id: 0, embedding: 1 }).lean();
    return winner?.embedding || embedding;
  }

  return embedding;
}
