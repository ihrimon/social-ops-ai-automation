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
  is_hidden?: boolean;
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
        fields: "id,message,from,is_hidden",
        // `filter=stream` (vs the default `toplevel`) is required for the
        // Graph API to include hidden/spam-flagged comments in the response
        // at all — needed to confirm/refute the hidden-comment theory below.
        filter: "stream",
        limit: commentsConfig.commentsPerPost,
      });

      const comments = commentsResponse?.data.data ?? [];

      for (const comment of comments) {
        const commentText = comment.message?.trim();
        if (!commentText || !comment.from?.id) {
          continue;
        }

        if (comment.is_hidden) {
          // Diagnostic for the "unknown-account comments get no reply"
          // issue: Meta's spam/hidden-comment filter can auto-hide a
          // first-time commenter's comment from public view, and such
          // comments may not surface from the default `/comments` edge at
          // all. Requesting `is_hidden` + `filter=stream` above should
          // surface them; this log confirms whether that theory holds and
          // still lets the comment flow through moderateComment() below so
          // a reply is attempted even when hidden.
          logger.warn(
            `Hidden Facebook comment found via polling (commenter likely new/unrecognized): ${comment.id}`
          );
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
