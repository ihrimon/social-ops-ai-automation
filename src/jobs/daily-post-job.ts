import cron from "node-cron";
import { errorMessage } from "../infra/errors.js";
import { logger } from "../infra/logger.js";
import { createPublicPost } from "../integrations/facebook/poster.js";
import { generateArticle } from "../modules/content/article.service.js";
import {
  createPostLog,
  hasPostedOnDateKey,
  updatePostLog,
} from "../modules/content/post-log.store.js";
import {
  addTopics,
  generateMonthlyTopics,
  getNextTopicFromDb,
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

async function runGenerator(): Promise<void> {
  let postLogId = null;
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

    const { topic, remaining } = await getNextTopic();

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

    const facebookResponse = await createPublicPost(article);
    await updatePostLog(postLogId, {
      status: "posted",
      facebookResponse,
      finishedAt: new Date(),
    });
  } catch (error) {
    logger.error("Problem in main function:", { error: errorMessage(error) });
    await updatePostLog(postLogId, {
      status: "failed",
      error: errorMessage(error),
      finishedAt: new Date(),
    });
  }
}

/** Schedules the daily 1:30 PM Asia/Dhaka text-post generation cycle. */
export function scheduleDailyPostJob(): void {
  cron.schedule(
    DAILY_POST_TIME,
    async () => {
      logger.info("Daily 1:30 PM post job triggered.");
      await runGenerator();
    },
    { timezone: TIMEZONE }
  );

  logger.info("Background worker started. Text posts are scheduled daily at 1:30 PM Asia/Dhaka.");
}
