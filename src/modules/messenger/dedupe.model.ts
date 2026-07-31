import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { mongoConfig } from "../../config/env.js";

// Mongoose is a CJS package; under Node's ESM loader `Schema`/`model`/`models`
// can't reliably be named-imported (cjs-module-lexer can't see `models`,
// which is a getter), so destructure off the default import instead.
const { Schema, model, models } = mongoose;

const messageDedupeSchema = new Schema(
  {
    messageId: { type: String, required: true, unique: true },
    senderId: { type: String },
    isBotSent: { type: Boolean },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

messageDedupeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export type MessageDedupeDoc = InferSchemaType<typeof messageDedupeSchema>;

const modelName = "MessageDedupe";

export const MessageDedupe: Model<MessageDedupeDoc> =
  (models[modelName] as Model<MessageDedupeDoc>) ||
  model<MessageDedupeDoc>(modelName, messageDedupeSchema, mongoConfig.messageDedupeCollection);
