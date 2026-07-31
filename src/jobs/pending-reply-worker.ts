import { config } from "../config/env.js";
import { logger } from "../infra/logger.js";
import { errorMessage } from "../infra/errors.js";
import {
  addConversationMessage,
  getConversationContext,
} from "../modules/messenger/conversation.store.js";
import {
  claimNextDueReply,
  completeClaim,
  releaseClaim,
  wasPausedAfterClaim,
  type PendingReplyJob,
} from "../modules/messenger/queue.worker.js";
import { rememberBotSentMessage } from "../modules/messenger/dedupe.store.js";
import { generateMessengerReply } from "../modules/messenger/reply.service.js";
import { sendMessengerReply } from "../integrations/facebook/messenger.js";

let pendingReplyWorkerRunning = false;

async function processPendingReply(job: PendingReplyJob): Promise<void> {
  const messageText = job.messages
    .map((message) => message.text)
    .join("\n")
    .trim();
  if (!messageText) {
    await completeClaim(job);
    return;
  }

  try {
    const conversationContext = await getConversationContext(job.userId, messageText);
    const reply = await generateMessengerReply(messageText, conversationContext);

    // Give a newly-arrived human admin message priority over an in-flight job.
    if (await wasPausedAfterClaim(job.userId, job.claimedAt)) {
      logger.info(`Pending reply for ${job.userId} deferred because a human admin took over.`);
      await releaseClaim(job, 0);
      return;
    }

    const sentResult: any = await sendMessengerReply(job.userId, reply);
    if (!sentResult?.message_id) {
      throw new Error("Messenger did not return a message ID.");
    }

    await rememberBotSentMessage(sentResult.message_id);

    // Delivery succeeded. Do not retry the message just because storing its
    // optional long-term memory has a temporary problem.
    try {
      await addConversationMessage(job.userId, "user", messageText);
      await addConversationMessage(job.userId, "assistant", reply);
    } catch (error) {
      logger.error(`Could not save Messenger conversation for ${job.userId}:`, {
        error: errorMessage(error),
      });
    }

    try {
      await completeClaim(job);
    } catch (error) {
      // The message has already reached Messenger. Retrying this claim could
      // send a duplicate reply, so leave it for operational cleanup instead.
      logger.error(`Could not finalize Messenger reply for ${job.userId}:`, {
        error: errorMessage(error),
      });
      return;
    }
    logger.info(`Sent consolidated Messenger reply to ${job.userId}.`);
  } catch (error) {
    logger.error(`Pending Messenger reply failed for ${job.userId}:`, {
      error: errorMessage(error),
    });
    await releaseClaim(job);
  }
}

async function runPendingReplyWorker(): Promise<void> {
  if (pendingReplyWorkerRunning) {
    return;
  }

  pendingReplyWorkerRunning = true;
  try {
    const jobs = [];
    for (let index = 0; index < config.messengerReplyConcurrency; index += 1) {
      const job = await claimNextDueReply();
      if (!job) break;
      jobs.push(processPendingReply(job));
    }
    await Promise.all(jobs);
  } catch (error) {
    logger.error("Pending reply worker failed:", { error: errorMessage(error) });
  } finally {
    pendingReplyWorkerRunning = false;
  }
}

/** Starts the polling loop that debounces and sends consolidated Messenger replies. */
export function startPendingReplyWorker(): void {
  if (!config.mongodbUri) {
    logger.warn("Pending Messenger reply worker is disabled because MONGODB_URI is not set.");
    return;
  }

  setInterval(runPendingReplyWorker, config.messengerReplyPollMs);
  void runPendingReplyWorker();
  logger.info(
    `Messenger reply worker started (debounce: ${config.messengerReplyDebounceMs / 1000}s).`
  );
}
