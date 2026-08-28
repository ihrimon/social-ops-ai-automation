import * as Sentry from "@sentry/node";
import { appConfig, monitoringConfig } from "../config/env.js";
import { logger } from "./logger.js";

let initialized = false;

/** Initializes Sentry error tracking. No-ops (logs once) if SENTRY_DSN isn't set — an optional integration, not a required one. */
export function initSentry(): void {
  if (!monitoringConfig.sentryDsn) {
    logger.info("SENTRY_DSN not set. Error tracking is disabled.");
    return;
  }

  Sentry.init({
    dsn: monitoringConfig.sentryDsn,
    environment: appConfig.nodeEnv,
  });
  initialized = true;
  logger.info("Sentry error tracking initialized.");
}

/** Reports an error to Sentry. No-op if Sentry wasn't initialized (SENTRY_DSN unset). */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
