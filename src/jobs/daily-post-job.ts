import cron from "node-cron";
import { errorMessage } from "../infra/errors.js";
import { logger } from "../infra/logger.js";
import { createPhotoPost, createPublicPost } from "../integrations/facebook/poster.js";
import { generateArticle } from "../modules/content/article.service.js";
import { generateImage } from "../modules/content/image.service.js";
import {
  createPostLog,
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
