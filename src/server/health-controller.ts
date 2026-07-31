import { Router } from "express";
import { aiConfig, mongoConfig } from "../config/env.js";
import { isMongoConnected } from "../integrations/mongo/client.js";

export const healthRouter: Router = Router();

/** Liveness: process is up and serving requests. No dependency checks. */
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * Readiness: can this instance actually do its job right now?
 * - Mongo: "not_configured" is fine (the app degrades gracefully without it);
 *   "connected"/"disconnected" only applies when MONGODB_URI is set.
 * - AI: only checks that a Gemini API key is present — does not make a live
 *   call, so this stays cheap enough to poll frequently.
 */
healthRouter.get("/ready", (_req, res) => {
  const mongoConfigured = Boolean(mongoConfig.uri);
  const mongoReady = !mongoConfigured || isMongoConnected();
  const aiConfigured = Boolean(aiConfig.geminiApiKey);

  const checks = {
    mongo: !mongoConfigured ? "not_configured" : mongoReady ? "connected" : "disconnected",
    ai: aiConfigured ? "configured" : "missing_api_key",
  };

  const ready = mongoReady && aiConfigured;

  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks });
});
