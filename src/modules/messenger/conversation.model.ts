import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { config } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const conversationMessageSchema = new Schema(
  {
    userId: { type: String, required: true },
    role: { type: String, required: true },
    text: { type: String, required: true },
    hasEmbedding: { type: Boolean, default: false },
    embedding: { type: [Number], required: false },
    isHumanAdmin: { type: Boolean, required: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false, strict: false }
);

conversationMessageSchema.index({ userId: 1, createdAt: -1 });
conversationMessageSchema.index({ userId: 1, role: 1, createdAt: -1 });
conversationMessageSchema.index({ userId: 1, hasEmbedding: 1, createdAt: -1 });

export type ConversationMessageDoc = InferSchemaType<typeof conversationMessageSchema>;

const modelName = "ConversationMessage";

export const ConversationMessage: Model<ConversationMessageDoc> =
  (models[modelName] as Model<ConversationMessageDoc>) ||
  model<ConversationMessageDoc>(
    modelName,
    conversationMessageSchema,
    config.mongodbConversationsCollection
  );
