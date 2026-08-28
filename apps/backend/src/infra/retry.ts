import { logger } from "./logger.js";

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
}

interface RetryableError {
  status?: number;
  code?: string;
  message?: string;
}

function isTransientError(error: RetryableError): boolean {
  return (
    error.status === 429 ||
    (typeof error.status === "number" && error.status >= 500 && error.status < 600) ||
    Boolean(error.message?.includes("429")) ||
    Boolean(error.message?.includes("503")) ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNRESET"
  );
}

/**
 * Executes an async function with exponential backoff retry on transient
 * failure or rate limits. Shared by the Gemini client and Facebook Graph API
 * calls, since both can fail transiently under load.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, initialDelayMs = 1000 }: RetryOptions = {}
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;

      if (attempt >= maxRetries || !isTransientError(error as RetryableError)) {
        throw error;
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`API call failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, {
        error: (error as RetryableError).message,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("withRetry exhausted retries without throwing or returning");
}
