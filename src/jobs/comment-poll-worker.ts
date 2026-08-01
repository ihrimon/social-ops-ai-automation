import { commentsConfig, facebookConfig, mongoConfig } from "../config/env.js";
import { logger } from "../infra/logger.js";
import { errorMessage } from "../infra/errors.js";
import { graphGet } from "../integrations/facebook/graph-client.js";
import { moderateComment } from "../modules/comments/comment.service.js";

interface FacebookPost {
  id: string;
}

interface FacebookComment {
  id: string;
  message?: string;
  from?: { id: string; name?: string };
}

let pollRunning = false;

/**
 * `feed` webhooks are unreliable for some Pages (see comment on
 * commentsConfig in config/env.ts), so this pulls recent posts/comments
 * directly instead of waiting for a push event. Every comment still goes
 * through the same `moderateComment()` + dedupe store as the webhook path,
 * so this can safely run whether or not webhooks are also working.
 */
async function pollRecentComments(): Promise<void> {
  if (pollRunning) {
    return;
  }

  pollRunning = true;
  try {
    const postsResponse = await graphGet<{ data: FacebookPost[] }>(
      `${facebookConfig.pageId}/posts`,
      {
        fields: "id",
        limit: commentsConfig.postsToCheck,
      }
    );

    const posts = postsResponse?.data.data ?? [];

    for (const post of posts) {
      const commentsResponse = await graphGet<{ data: FacebookComment[] }>(`${post.id}/comments`, {
        fields: "id,message,from",
        limit: commentsConfig.commentsPerPost,
      });

      const comments = commentsResponse?.data.data ?? [];

      for (const comment of comments) {
        const commentText = comment.message?.trim();
        if (!commentText || !comment.from?.id) {
          continue;
        }

        await moderateComment({
          commentId: comment.id,
          postId: post.id,
          commenterId: comment.from.id,
          commentText,
        });
      }
    }
  } catch (error) {
    logger.error("Comment poll worker failed:", { error: errorMessage(error) });
  } finally {
    pollRunning = false;
  }
}

/** Starts the polling fallback for comment moderation. */
export function startCommentPollWorker(): void {
  if (!mongoConfig.uri) {
    logger.warn("Comment poll worker is disabled because MONGODB_URI is not set.");
    return;
  }

  setInterval(() => {
    void pollRecentComments();
  }, commentsConfig.pollMs);
  void pollRecentComments();
  logger.info(`Comment poll worker started (interval: ${commentsConfig.pollMs / 1000}s).`);
}
