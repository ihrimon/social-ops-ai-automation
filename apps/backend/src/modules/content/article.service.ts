import { aiConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { generateContent } from "../../ai/client.js";
import { errorMessage } from "../../infra/errors.js";
import { buildArticlePrompt } from "../../ai/prompts/article.prompt.js";

export async function generateArticle(topic: string): Promise<string> {
  try {
    return await generateContent(aiConfig.model, buildArticlePrompt(topic));
  } catch (error) {
    logger.error("Article generation failed:", { error: errorMessage(error) });
    throw error;
  }
}
