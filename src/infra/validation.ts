import { z } from "zod";
import { ConfigError } from "./errors.js";

/**
 * Vars the app cannot meaningfully run without. Other integrations
 * (MongoDB, AI Horde/imgbb, FB_APP_SECRET) degrade gracefully at runtime
 * when absent, so they stay optional here rather than failing boot.
 */
export const requiredEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required for AI generation"),
  FB_PAGE_ACCESS_TOKEN: z
    .string()
    .min(1, "FB_PAGE_ACCESS_TOKEN is required to post/reply on Facebook"),
  FB_PAGE_ID: z.string().min(1, "FB_PAGE_ID is required to identify the managed Facebook Page"),
  FB_VERIFY_TOKEN: z.string().min(1, "FB_VERIFY_TOKEN is required to verify the Facebook webhook"),
});

/** Validates required env vars and fails fast (before the app boots) if any are missing. */
export function assertRequiredEnv(env: NodeJS.ProcessEnv): void {
  const result = requiredEnvSchema.safeParse(env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Missing/invalid required environment variables:\n${missing}`);
  }
}
