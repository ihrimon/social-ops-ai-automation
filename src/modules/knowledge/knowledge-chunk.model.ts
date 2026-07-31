import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { mongoConfig } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const knowledgeChunkSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    tags: { type: [String], default: [] },
    source: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    contentHash: { type: String, required: false },
    embedding: { type: [Number], required: false },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

knowledgeChunkSchema.index({ source: 1, active: 1 });
knowledgeChunkSchema.index({ title: "text", text: "text" }); // local/fallback BM25 matching

export type KnowledgeChunkDoc = InferSchemaType<typeof knowledgeChunkSchema>;

const modelName = "KnowledgeChunk";

export const KnowledgeChunk: Model<KnowledgeChunkDoc> =
  (models[modelName] as Model<KnowledgeChunkDoc>) ||
  model<KnowledgeChunkDoc>(modelName, knowledgeChunkSchema, mongoConfig.knowledgeCollection);
