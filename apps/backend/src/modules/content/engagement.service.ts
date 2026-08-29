import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { graphGet } from "../../integrations/facebook/graph-client.js";

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
  permalinkUrl?: string;
}

/**
 * Facebook's post-create response shapes differ: `/feed` returns `{id}`
 * (the post id itself), `/photos` returns `{id, post_id}` (the photo's own
 * id plus the actual feed post id) — `post_id` is the one that resolves via
 * the Graph API's `/{post-id}` node, so prefer it when present.
 */
export function extractFacebookPostId(facebookResponse: unknown): string | null {
  const response = facebookResponse as { post_id?: unknown; id?: unknown } | null | undefined;
  const postId = response?.post_id ?? response?.id;
  return typeof postId === "string" && postId.length > 0 ? postId : null;
}

const ENGAGEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_POSTS = 200;
const engagementCache = new Map<string, { data: PostEngagement; expiresAt: number }>();

function cacheEngagement(postId: string, data: PostEngagement): void {
  engagementCache.set(postId, { data, expiresAt: Date.now() + ENGAGEMENT_CACHE_TTL_MS });
  if (engagementCache.size > MAX_CACHED_POSTS) {
    engagementCache.delete(engagementCache.keys().next().value as string);
  }
}

/**
 * Basic public engagement counts for one post — only needs `pages_read_engagement`
 * (already granted), unlike the full Insights API (`read_insights`, impressions/reach).
 * Cached briefly since counts don't need per-request freshness and this is called
 * once per post every time the analytics dashboard loads.
 */
export async function getPostEngagement(postId: string): Promise<PostEngagement | null> {
  const cached = engagementCache.get(postId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const response = await graphGet(postId, {
      fields: "likes.summary(true),comments.summary(true),shares,permalink_url",
    });

    const data: PostEngagement = {
      likes: response.data.likes?.summary?.total_count ?? 0,
      comments: response.data.comments?.summary?.total_count ?? 0,
      // Facebook omits `shares` entirely when the count is 0, not an error.
      shares: response.data.shares?.count ?? 0,
      permalinkUrl: response.data.permalink_url,
    };

    cacheEngagement(postId, data);
    return data;
  } catch (error) {
    logger.warn(`Failed to fetch engagement for post ${postId}:`, { error: errorMessage(error) });
    return null;
  }
}
