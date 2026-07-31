import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { mongoConfig } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const embeddingCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    model: { type: String, required: true },
    textPreview: { type: String, required: true },
    embedding: { type: [Number], required: true },
    createdAt: { type: Date, default: () => new Date() },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

embeddingCacheSchema.index({ lastUsedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export type EmbeddingCacheDoc = InferSchemaType<typeof embeddingCacheSchema>;

const modelName = "EmbeddingCache";

export const EmbeddingCache: Model<EmbeddingCacheDoc> =
  (models[modelName] as Model<EmbeddingCacheDoc>) ||
  model<EmbeddingCacheDoc>(modelName, embeddingCacheSchema, mongoConfig.embeddingCacheCollection);
