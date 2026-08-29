import cors from "cors";
import express, { type Application, type NextFunction, type Request, type Response } from "express";
import type { Server } from "http";
import { corsConfig, serverConfig } from "../config/env.js";
import { logger } from "../infra/logger.js";
import { captureException } from "../infra/sentry.js";
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  ValidationError,
  errorMessage,
} from "../infra/errors.js";
import { webhookRouter } from "./webhook-controller.js";
import { healthRouter } from "./health-controller.js";
import { adminRouter } from "./admin-controller.js";

const WEBHOOK_PATH = "/webhook";
const ADMIN_PATH = "/admin";

/** Maps a known AppError subtype (or a body-parser style `.status`) to the HTTP status it should surface as. */
function statusForError(error: unknown): number {
  const declaredStatus =
    (error as { status?: number; statusCode?: number })?.status ??
    (error as { status?: number; statusCode?: number })?.statusCode;
  if (typeof declaredStatus === "number" && declaredStatus >= 400 && declaredStatus < 600) {
    return declaredStatus;
  }

  if (error instanceof ValidationError) return 400;
  if (error instanceof ExternalServiceError) return 502;
  if (error instanceof ConfigError) return 500;
  if (error instanceof AppError) return 500;
  return 500;
}

/** Centralized error-handling middleware (Express 5 forwards rejected async handlers here automatically). */
function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  logger.error(`Unhandled error on ${req.method} ${req.path}:`, { error: errorMessage(error) });
  captureException(error, { method: req.method, path: req.path });
  res.status(statusForError(error)).json({ error: "Internal Server Error" });
}

function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).type("text/plain").send("Not Found");
}

function createApp(): Application {
  const app = express();

  if (serverConfig.trustProxyHops > 0) {
    app.set("trust proxy", serverConfig.trustProxyHops);
  }

  app.get("/", (_req, res) => {
    res.status(200).json({
      status: "ok",
      webhook: WEBHOOK_PATH,
      health: "/health",
      ready: "/ready",
      admin: ADMIN_PATH,
      dailyPost: "1:30 PM Asia/Dhaka",
    });
  });

  app.use(healthRouter);
  app.use(WEBHOOK_PATH, webhookRouter);
  // CORS is scoped to /admin only — webhook/health stay server-to-server, no
  // browser origin needs access to them. Without CORS_ORIGIN configured, no
  // cross-origin access is granted (safer default for a JWT-issuing surface).
  app.use(ADMIN_PATH, cors({ origin: corsConfig.origin, credentials: true }), adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Starts the Express webhook + status HTTP server. */
export function startWebhookServer(): Server {
  const app = createApp();

  const server = app.listen(serverConfig.port, () => {
    logger.info(`Webhook server running on port ${serverConfig.port}. Path: ${WEBHOOK_PATH}`);
  });

  return server;
}
