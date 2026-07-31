import { aiConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { generateContent } from "../../ai/client.js";
import { errorMessage } from "../../infra/errors.js";
import { buildCommentClassifyPrompt } from "../../ai/prompts/classify.prompt.js";
import { getRelevantKnowledge } from "../knowledge/knowledge.store.js";
import { graphGet, graphPost } from "../../integrations/facebook/graph-client.js";

const POST_CONTEXT_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_POSTS = 100;
const postContextCache = new Map<string, { text: string; expiresAt: number }>();

function cachePostContext(postId: string, text: string): void {
  postContextCache.set(postId, { text, expiresAt: Date.now() + POST_CONTEXT_CACHE_TTL_MS });
  if (postContextCache.size > MAX_CACHED_POSTS) {
    postContextCache.delete(postContextCache.keys().next().value as string);
  }
}

export async function getFacebookPostContext(postId: string): Promise<string> {
  const cached = postContextCache.get(postId);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info(`Using cached Facebook post context for ${postId}.`);
    return cached.text;
  }

  logger.info(`Requesting Facebook post context: ${postId}`);
  const response = await graphGet(postId, { fields: "message,story,permalink_url" });

  const postText = [response.data.message, response.data.story].filter(Boolean).join("\n").trim();

  cachePostContext(postId, postText || "No post text is available.");
  return postText || "No post text is available.";
}

export async function replyToFacebookComment(commentId: string, text: string) {
  logger.info(`Posting public Facebook reply to comment ${commentId}.`);
  const response = await graphPost(`${commentId}/comments`, { message: text });

  logger.info(`Facebook comment reply API succeeded for ${commentId}.`);
  return response.data;
}

export async function generateFacebookCommentReply(
  postText: string,
  commentText: string
): Promise<string | null> {
  try {
    logger.info("Generating AI decision for Facebook comment reply.");
    const relevantKnowledge = await getRelevantKnowledge(`${postText}\n${commentText}`);
    const prompt = buildCommentClassifyPrompt(postText, commentText, relevantKnowledge);
    const reply = await generateContent(aiConfig.model, prompt);

    if (!reply || reply.toUpperCase() === "SKIP") {
      logger.info("AI classified Facebook comment as non-service-related.");
      return null;
    }

    logger.info("AI classified Facebook comment as service-related.");
    return reply.slice(0, 1000);
  } catch (error) {
    logger.error("Facebook comment reply generation failed:", { error: errorMessage(error) });
    return null;
  }
}
