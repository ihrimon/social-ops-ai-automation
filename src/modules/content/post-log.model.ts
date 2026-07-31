import mongoose, { type InferSchemaType, type Model } from "mongoose";
import { config } from "../../config/env.js";

const { Schema, model, models } = mongoose;

const postLogSchema = new Schema(
  {
    status: { type: String, required: true, default: "started" },
    topic: { type: String, required: false, default: null },
    article: { type: String, required: false, default: null },
    error: { type: String, required: false, default: null },
    reason: { type: String, required: false },
    timezone: { type: String, required: false },
    remainingTopics: { type: Number, required: false },
    /** Calendar-day key (e.g. "2026-07-31" in the configured timezone) set
     * once a post succeeds — the idempotency key `hasPostedOnDateKey` checks
     * against, so a duplicate daily-post trigger doesn't post twice. */
    postDateKey: { type: String, required: false },
    facebookResponse: { type: Schema.Types.Mixed, required: false },
    startedAt: { type: Date, required: false },
    finishedAt: { type: Date, required: false },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false, strict: false }
);

postLogSchema.index({ status: 1, createdAt: -1 });
postLogSchema.index({ topic: 1, createdAt: -1 });
postLogSchema.index({ createdAt: -1 });
postLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type PostLogDoc = InferSchemaType<typeof postLogSchema>;

const modelName = "PostLog";

export const PostLog: Model<PostLogDoc> =
  (models[modelName] as Model<PostLogDoc>) ||
  model<PostLogDoc>(modelName, postLogSchema, config.mongodbPostLogsCollection);
