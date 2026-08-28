import cron from "node-cron";
import { adminConfig } from "../config/env.js";
import { errorMessage } from "../infra/errors.js";
import { logger } from "../infra/logger.js";
import { createPhotoPost, createPublicPost } from "../integrations/facebook/poster.js";
import { generateArticle } from "../modules/content/article.service.js";
import { generateImage } from "../modules/content/image.service.js";
import {
  claimPendingPostForPublishing,
  createPostLog,
  getPostLogById,
  hasPendingApprovalForDateKey,
  hasPostedOnDateKey,
  updatePostLog,
} from "../modules/content/post-log.store.js";
import {
  addTopics,
  generateMonthlyTopics,
  getNextTopicFromDb,
  revertTopicToUnused,
} from "../modules/content/topic.service.js";

const TIMEZONE = "Asia/Dhaka";
const DAILY_POST_TIME = "30 13 * * *";

/** Calendar-day key in the target timezone, e.g. "2026-07-31" — the idempotency key for the daily post. */
function todayDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

async function getNextTopic() {
  let result = await getNextTopicFromDb();

  if (!result) {
    logger.info("No topics available in database. Generating 30 service-focused Bangla topics...");
    const topics = await generateMonthlyTopics();
    await addTopics(topics);
    logger.info(`Successfully generated and saved ${topics.length} topics to database.`);
    result = await getNextTopicFromDb();
  }

  return result;
}

/** Runs one daily-post cycle (topic → article → image → Facebook post). Exported so it can also be triggered manually/from tests, independent of the cron schedule. */
export async function runDailyPostJob(): Promise<void> {
  let postLogId = null;
  let claimedTopicId: string | null = null;
  const postDateKey = todayDateKey();

  try {
    // Idempotency guard: a duplicate cron fire, manual re-trigger, or restart
    // mid-cycle must not publish the same calendar day's post twice.
    if (await hasPostedOnDateKey(postDateKey)) {
      logger.warn(`A post already succeeded for ${postDateKey}. Skipping this run.`);
      await createPostLog({
        status: "skipped",
        reason: `Already posted for ${postDateKey}`,
        postDateKey,
        startedAt: new Date(),
        finishedAt: new Date(),
        timezone: TIMEZONE,
      });
      return;
    }

    if (await hasPendingApprovalForDateKey(postDateKey)) {
      logger.warn(
        `A draft for ${postDateKey} is already awaiting admin approval. Skipping this run.`
      );
      await createPostLog({
        status: "skipped",
        reason: `Draft already pending approval for ${postDateKey}`,
        postDateKey,
        startedAt: new Date(),
        finishedAt: new Date(),
        timezone: TIMEZONE,
      });
      return;
    }

    postLogId = await createPostLog({
      status: "started",
      startedAt: new Date(),
      timezone: TIMEZONE,
      postDateKey,
    });

    logger.info("Starting new text post cycle at:", {
      time: new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
    });

    const { id: topicId, topic, remaining } = await getNextTopic();
    claimedTopicId = topicId;

    logger.info(`Selected topic for today: ${topic}`);
    logger.info(`Remaining topics in queue for future days: ${remaining}`);
    await updatePostLog(postLogId, {
      status: "topic_selected",
      topic,
      remainingTopics: remaining,
    });

    const article = await generateArticle(topic);

    if (!article) {
      logger.warn("Article missing. Skipping Facebook post.");
      await revertTopicToUnused(claimedTopicId);
      await updatePostLog(postLogId, {
        status: "skipped",
        reason: "Article missing",
        finishedAt: new Date(),
      });
      return;
    }

    await updatePostLog(postLogId, {
      status: "article_generated",
      article,
    });

    logger.info(`topic: ${topic}\narticle: ${article}`);

    // Best-effort visual: a failed/slow image generation must never block
    // the text post, since that's the guaranteed daily deliverable.
    const imageUrl = await generateImage({ inputs: topic });
    await updatePostLog(postLogId, {
      status: imageUrl ? "image_generated" : "image_generation_skipped",
      imageUrl: imageUrl ?? undefined,
    });

    if (adminConfig.requirePostApproval) {
      // The topic is intentionally left claimed (not reverted) — it's now
      // embedded in this draft, to be finalized or reverted by an admin
      // decision (publishPendingPost/rejectPendingPost), not lost.
      logger.info(`Draft ready and awaiting admin approval for ${postDateKey}.`);
      await updatePostLog(postLogId, {
        status: "pending_approval",
        topicId: claimedTopicId,
        finishedAt: new Date(),
      });
      return;
    }

    const facebookResponse = imageUrl
      ? await createPhotoPost(imageUrl, article)
      : await createPublicPost(article);

    // Post succeeded — the topic is genuinely consumed now, nothing to revert.
    claimedTopicId = null;

    await updatePostLog(postLogId, {
      status: "posted",
      facebookResponse,
      finishedAt: new Date(),
    });
  } catch (error) {
    logger.error("Problem in main function:", { error: errorMessage(error) });
    if (claimedTopicId) {
      await revertTopicToUnused(claimedTopicId);
    }
    await updatePostLog(postLogId, {
      status: "failed",
      error: errorMessage(error),
      finishedAt: new Date(),
    });
  }
}

/**
 * Publishes a draft that's awaiting admin approval. Used by the admin
 * "approve" action. Atomically claims the draft first so a double-click (or a
 * retry racing an in-flight publish) can't post twice; on failure the draft
 * reverts to pending_approval (with `approveError` set) instead of being
 * lost, so the admin can retry.
 */
export async function publishPendingPost(
  postLogId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const claimed = await claimPendingPostForPublishing(postLogId);
  if (!claimed) {
    return { ok: false, error: "Draft is not awaiting approval (already published/rejected)." };
  }

  try {
    const facebookResponse = claimed.imageUrl
      ? await createPhotoPost(claimed.imageUrl, claimed.article as string)
      : await createPublicPost(claimed.article as string);

    await updatePostLog(postLogId, {
      status: "posted",
      facebookResponse,
      finishedAt: new Date(),
    });
    return { ok: true };
  } catch (error) {
    logger.error(`Failed to publish approved draft ${postLogId}:`, { error: errorMessage(error) });
    await updatePostLog(postLogId, {
      status: "pending_approval",
      approveError: errorMessage(error),
    });
    return { ok: false, error: errorMessage(error) };
  }
}

/** Rejects a draft awaiting admin approval and returns its topic to the unused queue. */
export async function rejectPendingPost(
  postLogId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const draft = await getPostLogById(postLogId);
  if (!draft || draft.status !== "pending_approval") {
    return { ok: false, error: "Draft is not awaiting approval (already published/rejected)." };
  }

  await updatePostLog(postLogId, { status: "rejected", finishedAt: new Date() });
  if (draft.topicId) {
    await revertTopicToUnused(draft.topicId as string);
  }
  return { ok: true };
}

/** Schedules the daily Asia/Dhaka post generation cycle (cron pattern: `DAILY_POST_TIME`). */
export function scheduleDailyPostJob(): void {
  cron.schedule(
    DAILY_POST_TIME,
    async () => {
      logger.info(`Daily post job triggered (cron: "${DAILY_POST_TIME}" ${TIMEZONE}).`);
      await runDailyPostJob();
    },
    { timezone: TIMEZONE }
  );

  logger.info(
    `Background worker started. Posts are scheduled daily via cron "${DAILY_POST_TIME}" (${TIMEZONE}).`
  );
}
