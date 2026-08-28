import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { mongoConfig } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const topicSchema = new Schema(
  {
    topic: { type: String, required: true },
    used: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, default: () => new Date() },
    usedAt: { type: Date, required: false, default: null },
  },
  { versionKey: false }
);

topicSchema.index({ used: 1, createdAt: 1 });

export type TopicDoc = InferSchemaType<typeof topicSchema>;

const modelName = "Topic";

export const Topic: Model<TopicDoc> =
  (models[modelName] as Model<TopicDoc>) ||
  model<TopicDoc>(modelName, topicSchema, mongoConfig.topicsCollection);
