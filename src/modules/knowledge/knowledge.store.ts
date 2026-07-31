import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { Model } from "mongoose";
import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { createEmbedding } from "./embedding.service.js";
import { KnowledgeChunk, type KnowledgeChunkDoc } from "./knowledge-chunk.model.js";

interface KnowledgeChunkSeed {
  key: string;
  title: string;
  text: string;
  tags: string[];
  source: string;
  active: boolean;
}

const KNOWLEDGE_BASE_FILE = path.join(process.cwd(), "knowledge-base.json");
const KNOWLEDGE_RESULT_LIMIT = 5;

let vectorSearchUnavailable = false;
let cachedKnowledgeChunks: KnowledgeChunkSeed[] | null = null;

function createHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createChunk(
  key: string,
  title: string,
  text: string,
  tags: string[] = []
): KnowledgeChunkSeed {
  return {
    key,
    title,
    text,
    tags,
    source: "knowledgeBase",
    active: true,
  };
}

function formatList(items: unknown[]): string {
  return items.filter(Boolean).join(", ");
}

function buildKnowledgeChunks(knowledgeBase: any): KnowledgeChunkSeed[] {
  const chunks = [
    createChunk(
      "business-profile",
      "Business profile",
      `Business: ${knowledgeBase.business?.name}. Role: ${knowledgeBase.business?.owner_role}. Target customers: ${formatList(knowledgeBase.business?.target_customers || [])}. Language: ${knowledgeBase.business?.language}.`,
      ["business", "target_customer"]
    ),
    createChunk(
      "services",
      "Services",
      `Available services: ${formatList(knowledgeBase.services || [])}.`,
      ["service", "skill"]
    ),
    createChunk(
      "selling-points",
      "Selling points",
      `Selling points: ${formatList(knowledgeBase.selling_points || [])}.`,
      ["benefit", "trust"]
    ),
    createChunk(
      "process",
      "Working process",
      `Process: ${formatList(knowledgeBase.process || [])}.`,
      ["process", "delivery"]
    ),
    createChunk("pricing-policy", "Pricing policy", knowledgeBase.pricing_policy || "", [
      "price",
      "budget",
    ]),
    createChunk(
      "lead-questions",
      "Lead questions",
      `Useful lead questions: ${formatList(knowledgeBase.lead_questions || [])}.`,
      ["lead", "question"]
    ),
    createChunk(
      "reply-style",
      "Reply style",
      `Tone: ${knowledgeBase.reply_style?.tone}. Length: ${knowledgeBase.reply_style?.length}. Rules: ${formatList(knowledgeBase.reply_style?.rules || [])}.`,
      ["style", "rules"]
    ),
    createChunk("fallback-reply", "Fallback reply", knowledgeBase.fallback_reply || "", [
      "fallback",
    ]),
  ];

  return chunks.filter((chunk) => chunk.text.trim());
}

async function loadKnowledgeBase(): Promise<any> {
  const data = await fs.readFile(KNOWLEDGE_BASE_FILE, "utf-8");
  return JSON.parse(data);
}

export async function syncKnowledgeBase(
  model: Model<KnowledgeChunkDoc> = KnowledgeChunk
): Promise<void> {
  const knowledgeBase = await loadKnowledgeBase();
  const chunks = buildKnowledgeChunks(knowledgeBase);
  const activeKeys = chunks.map((chunk) => chunk.key);

  await Promise.all(
    chunks.map(async (chunk) => {
      const contentHash = createHash(chunk.text);
      const existing = await model
        .findOne({ key: chunk.key })
        .select({ _id: 0, contentHash: 1 })
        .lean();

      if (existing?.contentHash === contentHash) {
        await model.updateOne(
          { key: chunk.key },
          { $set: { active: true, updatedAt: new Date() } }
        );
        return;
      }

      const embedding = await createEmbedding(`${chunk.title}\n${chunk.text}`);
      await model.updateOne(
        { key: chunk.key },
        {
          $set: {
            ...chunk,
            contentHash,
            embedding,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    })
  );

  await model.updateMany(
    { source: "knowledgeBase", key: { $nin: activeKeys } },
    { $set: { active: false, updatedAt: new Date() } }
  );

  // Populate cache to avoid DB hits on subsequent requests when vector search is unavailable
  cachedKnowledgeChunks = (await model
    .find({ source: "knowledgeBase", active: true })
    .select({ _id: 0, title: 1, text: 1 })
    .lean()) as unknown as KnowledgeChunkSeed[];
}

export async function getRelevantKnowledge(
  userMessage: string,
  model: Model<KnowledgeChunkDoc> = KnowledgeChunk
): Promise<KnowledgeChunkSeed[]> {
  // If MongoDB URI is not set, immediately fallback to local knowledge-base.json to avoid crashes
  if (!config.mongodbUri) {
    if (cachedKnowledgeChunks) {
      return cachedKnowledgeChunks.slice(0, KNOWLEDGE_RESULT_LIMIT);
    }
    try {
      const data = await fs.readFile(KNOWLEDGE_BASE_FILE, "utf-8");
      const knowledgeBase = JSON.parse(data);
      const chunks = buildKnowledgeChunks(knowledgeBase);
      cachedKnowledgeChunks = chunks;
      return chunks.slice(0, KNOWLEDGE_RESULT_LIMIT);
    } catch (err) {
      logger.warn("Failed to read local knowledge base file:", { error: (err as Error).message });
      return [];
    }
  }

  // If vector search is offline or user query is empty, use memory cache directly to save a DB roundtrip
  if (vectorSearchUnavailable || !userMessage?.trim()) {
    if (cachedKnowledgeChunks) {
      return cachedKnowledgeChunks.slice(0, KNOWLEDGE_RESULT_LIMIT);
    }
    const chunks = (await model
      .find({ source: "knowledgeBase", active: true })
      .sort({ key: 1 })
      .limit(KNOWLEDGE_RESULT_LIMIT)
      .select({ _id: 0, title: 1, text: 1 })
      .lean()) as unknown as KnowledgeChunkSeed[];
    cachedKnowledgeChunks = chunks;
    return chunks;
  }

  try {
    const queryVector = await createEmbedding(userMessage);

    // Run vector search and text search in parallel
    const vectorSearchPromise = model
      .aggregate([
        {
          $vectorSearch: {
            index: config.mongodbKnowledgeVectorIndex,
            path: "embedding",
            queryVector,
            numCandidates: 50,
            limit: KNOWLEDGE_RESULT_LIMIT * 2,
            filter: { source: "knowledgeBase", active: true },
          },
        },
        {
          $project: {
            _id: 0,
            title: 1,
            text: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .catch((err) => {
        logger.warn("Vector search failed in hybrid query:", { error: err.message });
        return [];
      });

    const textSearchPromise = model
      .find({
        source: "knowledgeBase",
        active: true,
        $text: { $search: userMessage },
      } as any)
      .limit(KNOWLEDGE_RESULT_LIMIT * 2)
      .select({ _id: 0, title: 1, text: 1, score: { $meta: "textScore" } })
      .lean()
      .catch((err) => {
        logger.warn("Text search failed in hybrid query:", { error: err.message });
        return [];
      });

    const [vectorDocs, textDocs] = await Promise.all([vectorSearchPromise, textSearchPromise]);

    if (vectorDocs.length === 0 && textDocs.length === 0) {
      if (cachedKnowledgeChunks) {
        return cachedKnowledgeChunks.slice(0, KNOWLEDGE_RESULT_LIMIT);
      }
      return (await model
        .find({ source: "knowledgeBase", active: true })
        .sort({ key: 1 })
        .limit(KNOWLEDGE_RESULT_LIMIT)
        .select({ _id: 0, title: 1, text: 1 })
        .lean()) as unknown as KnowledgeChunkSeed[];
    }

    // Combine results using Reciprocal Rank Fusion (RRF)
    const rrfScores: Record<string, number> = {};
    const docMap = new Map<string, any>();
    const k = 60; // standard constant

    const addScores = (docs: any[]) => {
      docs.forEach((doc, idx) => {
        const docKey = `${doc.title}:${doc.text}`;
        docMap.set(docKey, doc);
        const rank = idx + 1;
        if (!rrfScores[docKey]) {
          rrfScores[docKey] = 0;
        }
        rrfScores[docKey] += 1 / (k + rank);
      });
    };

    addScores(vectorDocs);
    addScores(textDocs);

    const sortedKeys = Object.keys(rrfScores).sort((a, b) => rrfScores[b] - rrfScores[a]);

    return sortedKeys.slice(0, KNOWLEDGE_RESULT_LIMIT).map((docKey) => {
      const { score, ...cleanDoc } = docMap.get(docKey);
      return cleanDoc;
    });
  } catch (error) {
    logger.warn("MongoDB knowledge hybrid search failed. Falling back to cache:", {
      error: (error as Error).message,
    });

    if (
      (error as Error).message.includes("vectorSearch") ||
      (error as Error).message.includes("Vector")
    ) {
      vectorSearchUnavailable = true;
    }

    if (cachedKnowledgeChunks) {
      return cachedKnowledgeChunks.slice(0, KNOWLEDGE_RESULT_LIMIT);
    }

    const chunks = (await model
      .find({ source: "knowledgeBase", active: true })
      .sort({ key: 1 })
      .limit(KNOWLEDGE_RESULT_LIMIT)
      .select({ _id: 0, title: 1, text: 1 })
      .lean()) as unknown as KnowledgeChunkSeed[];
    cachedKnowledgeChunks = chunks;
    return chunks;
  }
}
