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
