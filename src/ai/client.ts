import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import { withRetry } from "../infra/retry.js";
import { ExternalServiceError, errorMessage } from "../infra/errors.js";

export const genAI = new GoogleGenerativeAI(config.geminiApiKey);

export { withRetry } from "../infra/retry.js";

/**
 * Runs a text prompt through the given Gemini model with retry, and wraps any
 * failure in one typed error so every call site handles Gemini failures the
 * same way instead of re-deriving `error.message` shape checks individually.
 */
export async function generateContent(modelName: string, prompt: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await withRetry(() => model.generateContent(prompt));
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    throw new ExternalServiceError("gemini", errorMessage(error), error);
  }
}
