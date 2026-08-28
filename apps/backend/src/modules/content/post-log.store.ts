import type { Model } from "mongoose";
import { PostLog, type PostLogDoc } from "./post-log.model.js";

export async function createPostLog(
  data: Record<string, unknown> = {},
  model: Model<PostLogDoc> = PostLog
) {
  const now = new Date();
  const doc = await model.create({
    status: "started",
    topic: null,
    article: null,
    error: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  });

  return doc._id;
}

export async function updatePostLog(
  logId: unknown,
  data: Record<string, unknown> = {},
  model: Model<PostLogDoc> = PostLog
) {
  if (!logId) {
    return;
  }

  await model.updateOne(
    { _id: logId },
    {
      $set: {
        ...data,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Idempotency check for the daily post job: true if a post already succeeded
 * for this calendar-day key, so a duplicate cron trigger (double-fire, manual
 * re-run, restart mid-cycle) doesn't publish the same day's post twice.
 */
export async function hasPostedOnDateKey(
  postDateKey: string,
  model: Model<PostLogDoc> = PostLog
): Promise<boolean> {
  return Boolean(await model.exists({ status: "posted", postDateKey }));
}

/**
 * Same idempotency guard as `hasPostedOnDateKey`, but for a draft still
 * awaiting admin approval — prevents a second cron fire from generating a
 * duplicate draft while one day's post is already pending a decision.
 */
export async function hasPendingApprovalForDateKey(
  postDateKey: string,
  model: Model<PostLogDoc> = PostLog
): Promise<boolean> {
  return Boolean(await model.exists({ status: "pending_approval", postDateKey }));
}

export async function getPostLogById(id: string, model: Model<PostLogDoc> = PostLog) {
  return model.findById(id).lean();
}

/**
 * Atomically flips a pending_approval draft to "publishing" so a double
 * approve-click (or a retry racing a still-in-flight publish) can't fire the
 * Facebook post twice. Returns the claimed doc, or null if it wasn't
 * pending_approval anymore (already published/rejected/being published).
 */
export async function claimPendingPostForPublishing(
  id: string,
  model: Model<PostLogDoc> = PostLog
) {
  return model
    .findOneAndUpdate(
      { _id: id, status: "pending_approval" },
      { $set: { status: "publishing", updatedAt: new Date() } },
      { returnDocument: "after" }
    )
    .lean();
}

export async function listPostLogs(
  { status, limit = 20, before }: { status?: string; limit?: number; before?: Date } = {},
  model: Model<PostLogDoc> = PostLog
) {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (before) filter.createdAt = { $lt: before };

  return model.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}
