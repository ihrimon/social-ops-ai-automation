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
 *
 * `client` defaults to the shared singleton but can be overridden (e.g. with
 * a mock `GoogleGenerativeAI` in unit tests) instead of importing `genAI`
 * directly, so callers don't need to reach into a module-level singleton.
 */
export async function generateContent(
  modelName: string,
  prompt: string,
  client: GoogleGenerativeAI = genAI
): Promise<string> {
  try {
    const model = client.getGenerativeModel({ model: modelName });
    const result = await withRetry(() => model.generateContent(prompt));
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    throw new ExternalServiceError("gemini", errorMessage(error), error);
  }
}
