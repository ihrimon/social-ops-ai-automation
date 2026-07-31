import cron from "node-cron";
import { logger } from "../infra/logger.js";
import { errorMessage } from "../infra/errors.js";
import { generateArticle } from "../modules/content/article.service.js";
import {
  addTopics,
  generateMonthlyTopics,
  getNextTopicFromDb,
} from "../modules/content/topic.service.js";
import { createPostLog, updatePostLog } from "../modules/content/post-log.store.js";
import { createPublicPost } from "../integrations/facebook/poster.js";

const TIMEZONE = "Asia/Dhaka";
const DAILY_POST_TIME = "0 21 * * *";

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

  try {
    postLogId = await createPostLog({
      status: "started",
      startedAt: new Date(),
      timezone: TIMEZONE,
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

/** Schedules the daily 9:00 PM Asia/Dhaka text-post generation cycle. */
export function scheduleDailyPostJob(): void {
  cron.schedule(
    DAILY_POST_TIME,
    async () => {
      logger.info("Daily 9:00 PM post job triggered.");
      await runGenerator();
    },
    { timezone: TIMEZONE }
  );

  logger.info("Background worker started. Text posts are scheduled daily at 9:00 PM Asia/Dhaka.");
}
