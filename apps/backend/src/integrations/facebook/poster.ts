import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { facebookConfig } from "../../config/env.js";
import { graphPost } from "./graph-client.js";

export async function createPublicPost(article: string) {
  try {
    const response = await graphPost(`${facebookConfig.pageId}/feed`, { message: article });
    logger.info("Facebook text post response:", { data: response.data });
    return response.data;
  } catch (error) {
    logger.error("Failed to post to Facebook.", { error: errorMessage(error) });
    throw error;
  }
}

/** Posts a photo (hosted at `imageUrl`) with a caption to the Page's feed. */
export async function createPhotoPost(imageUrl: string, caption: string) {
  try {
    const response = await graphPost(`${facebookConfig.pageId}/photos`, {
      url: imageUrl,
      caption,
    });
    logger.info("Facebook photo post response:", { data: response.data });
    return response.data;
  } catch (error) {
    logger.error("Failed to post photo to Facebook.", { error: errorMessage(error) });
    throw error;
  }
}
