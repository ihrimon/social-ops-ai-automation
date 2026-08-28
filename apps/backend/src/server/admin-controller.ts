import express, { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isValidAdminPassword, requireAdminAuth, signAdminToken } from "../modules/admin/auth.js";
import { publishPendingPost, rejectPendingPost } from "../jobs/daily-post-job.js";
import { getPostLogById, listPostLogs } from "../modules/content/post-log.store.js";
import {
  getConversationHistory,
  listConversations,
} from "../modules/messenger/conversation.store.js";
import {
  getPauseStatus,
  pauseUserReplies,
  resumeUserReplies,
} from "../modules/messenger/queue.worker.js";
import {
  getKnowledgeBaseRaw,
  updateKnowledgeBaseRaw,
} from "../modules/knowledge/knowledge.store.js";
import { logger } from "../infra/logger.js";
import { errorMessage } from "../infra/errors.js";

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function parseQueryLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

function parseQueryBefore(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function handleLogin(req: Request, res: Response): Promise<void> {
  if (!isValidAdminPassword(req.body?.password)) {
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  res.status(200).json({ token: signAdminToken() });
}

async function handleListPosts(req: Request, res: Response): Promise<void> {
  const posts = await listPostLogs({
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    limit: parseQueryLimit(req.query.limit, 20),
    before: parseQueryBefore(req.query.before),
  });
  res.status(200).json({ posts });
}

async function handlePendingPosts(_req: Request, res: Response): Promise<void> {
  const posts = await listPostLogs({ status: "pending_approval", limit: 50 });
  res.status(200).json({ posts });
}

async function handleApprovePost(req: Request, res: Response): Promise<void> {
  const result = await publishPendingPost(String(req.params.id));
  res.status(result.ok ? 200 : 409).json(result);
}

async function handleRejectPost(req: Request, res: Response): Promise<void> {
  const result = await rejectPendingPost(String(req.params.id));
  res.status(result.ok ? 200 : 409).json(result);
}

async function handleGetPost(req: Request, res: Response): Promise<void> {
  const post = await getPostLogById(String(req.params.id));
  if (!post) {
    res.status(404).json({ error: "Post log not found." });
    return;
  }
  res.status(200).json({ post });
}

async function handleListConversations(req: Request, res: Response): Promise<void> {
  const conversations = await listConversations({
    limit: parseQueryLimit(req.query.limit, 20),
    before: parseQueryBefore(req.query.before),
  });
  res.status(200).json({ conversations });
}

async function handleGetConversation(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  const [messages, pauseStatus] = await Promise.all([
    getConversationHistory(userId, { limit: 200 }),
    getPauseStatus(userId),
  ]);
  res.status(200).json({ userId, messages, ...pauseStatus });
}

async function handlePauseConversation(req: Request, res: Response): Promise<void> {
  await pauseUserReplies(String(req.params.userId));
  res.status(200).json({ ok: true });
}

async function handleResumeConversation(req: Request, res: Response): Promise<void> {
  await resumeUserReplies(String(req.params.userId));
  res.status(200).json({ ok: true });
}

async function handleGetKnowledge(_req: Request, res: Response): Promise<void> {
  const content = await getKnowledgeBaseRaw();
  res.status(200).json({ content });
}

async function handleUpdateKnowledge(req: Request, res: Response): Promise<void> {
  const content = req.body?.content;
  if (typeof content !== "string") {
    res
      .status(400)
      .json({ error: "Body must be { content: string } (the full knowledge-base.json text)." });
    return;
  }

  try {
    await updateKnowledgeBaseRaw(content);
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn("Admin knowledge base update rejected (invalid JSON):", {
        error: errorMessage(error),
      });
      res.status(400).json({ error: `Invalid JSON: ${errorMessage(error)}` });
      return;
    }

    // The file was already written (JSON was valid) — only the Mongo re-sync
    // failed, e.g. a Gemini embedding call error. The edit isn't lost; it'll
    // be picked up on the next successful sync.
    logger.error("Admin knowledge base re-sync failed after a valid write:", {
      error: errorMessage(error),
    });
    res.status(502).json({
      error: `Saved, but re-syncing into the knowledge store failed: ${errorMessage(error)}`,
    });
  }
}

export const adminRouter: Router = Router();

adminRouter.use(express.json({ limit: "1mb" }));

adminRouter.post("/login", loginRateLimit, handleLogin);

adminRouter.use(requireAdminAuth);

adminRouter.get("/posts", handleListPosts);
adminRouter.get("/posts/pending", handlePendingPosts);
adminRouter.get("/posts/:id", handleGetPost);
adminRouter.post("/posts/:id/approve", handleApprovePost);
adminRouter.post("/posts/:id/reject", handleRejectPost);

adminRouter.get("/conversations", handleListConversations);
adminRouter.get("/conversations/:userId", handleGetConversation);
adminRouter.post("/conversations/:userId/pause", handlePauseConversation);
adminRouter.post("/conversations/:userId/resume", handleResumeConversation);

adminRouter.get("/knowledge", handleGetKnowledge);
adminRouter.put("/knowledge", handleUpdateKnowledge);
