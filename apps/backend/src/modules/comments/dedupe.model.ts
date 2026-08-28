import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { mongoConfig } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const commentDedupeSchema = new Schema(
  {
    commentId: { type: String, required: true, unique: true },
    postId: { type: String, required: true },
    commenterId: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

// Keep comment webhook IDs long enough to prevent public reply loops.
commentDedupeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type CommentDedupeDoc = InferSchemaType<typeof commentDedupeSchema>;

const modelName = "CommentDedupe";

export const CommentDedupe: Model<CommentDedupeDoc> =
  (models[modelName] as Model<CommentDedupeDoc>) ||
  model<CommentDedupeDoc>(modelName, commentDedupeSchema, mongoConfig.commentDedupeCollection);
