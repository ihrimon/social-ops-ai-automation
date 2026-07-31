import { randomUUID } from "node:crypto";
import { config } from "../../config/env.js";
import { createRepository } from "../../integrations/mongo/repository.js";

export interface PendingReplyMessage {
  id: string;
  text: string;
  receivedAt: Date;
}

export interface PendingReplyJob {
  _id: unknown;
  userId: string;
  messages: PendingReplyMessage[];
  claimId: string;
  claimedAt: Date;
}

const PENDING_REPLY_TTL_MS = 24 * 60 * 60 * 1000;

const pendingReplyRepo = createRepository(config.mongodbPendingRepliesCollection);

function expiryDate(now = new Date()): Date {
  return new Date(now.getTime() + PENDING_REPLY_TTL_MS);
}

/**
 * Adds a user message to that user's short-lived reply buffer. There is only
 * one buffer document per user, regardless of how many messages they send.
 */
export async function queueUserMessage(
  userId: string,
  text: string,
  messageId: string
): Promise<void> {
  const now = new Date();
  const replyAt = new Date(now.getTime() + config.messengerReplyDebounceMs);
  const message: PendingReplyMessage = { id: messageId, text, receivedAt: now };
  const collection = await pendingReplyRepo.collection();

  await collection.updateOne(
    { userId } as any,
    [
      {
        $set: {
          userId: { $ifNull: ["$userId", userId] },
          createdAt: { $ifNull: ["$createdAt", now] },
          messages: {
            $slice: [
              { $concatArrays: [{ $ifNull: ["$messages", []] }, [message]] },
              -config.messengerPendingMessageLimit,
            ],
          },
          // Do not interrupt a reply already being generated. The new message
          // stays in the buffer and will be handled by the next job.
          status: {
            $cond: [
              { $eq: [{ $ifNull: ["$status", "pending"] }, "processing"] },
              "processing",
              "pending",
            ],
          },
          hasPendingMessages: true,
          replyAt: {
            $cond: [
              { $gt: [{ $ifNull: ["$pausedUntil", new Date(0)] }, replyAt] },
              "$pausedUntil",
              replyAt,
            ],
          },
          updatedAt: now,
          expiresAt: expiryDate(now),
        },
      },
    ] as any,
    { upsert: true }
  );
}

/** Records the 10-minute human-admin handoff without creating chat history. */
export async function pauseUserReplies(userId: string): Promise<void> {
  const now = new Date();
  const pausedUntil = new Date(now.getTime() + config.messengerAdminPauseMs);
  const collection = await pendingReplyRepo.collection();

  await collection.updateOne(
    { userId } as any,
    {
      $setOnInsert: {
        userId,
        messages: [],
        status: "idle",
        hasPendingMessages: false,
        createdAt: now,
      },
      $set: {
        pausedUntil,
        updatedAt: now,
        expiresAt: expiryDate(now),
      },
      // A pending reply must not run before the latest human handoff expires.
      $max: { replyAt: pausedUntil },
    } as any,
    { upsert: true }
  );
}

/**
 * Atomically claims one due reply. A separate claim prevents two scheduler
 * runs (or future app instances) from replying to the same user at once.
 */
export async function claimNextDueReply(): Promise<PendingReplyJob | null> {
  const now = new Date();
  const collection = await pendingReplyRepo.collection();
  const candidate = await collection.findOne(
    {
      status: "pending",
      hasPendingMessages: true,
      replyAt: { $lte: now },
    } as any,
    { sort: { replyAt: 1 } }
  );

  if (!candidate) {
    return null;
  }

  if ((candidate as any).pausedUntil && (candidate as any).pausedUntil > now) {
    await collection.updateOne({ _id: candidate._id, status: "pending" } as any, {
      $set: { replyAt: (candidate as any).pausedUntil, updatedAt: now },
    });
    return null;
  }

  const claimId = randomUUID();
  const job = await collection.findOneAndUpdate(
    {
      _id: candidate._id,
      status: "pending",
      hasPendingMessages: true,
      replyAt: { $lte: now },
      $or: [{ pausedUntil: { $exists: false } }, { pausedUntil: { $lte: now } }],
    } as any,
    {
      $set: {
        status: "processing",
        hasPendingMessages: false,
        claimId,
        claimedAt: now,
        leaseUntil: new Date(now.getTime() + config.messengerReplyLeaseMs),
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );

  return (job as unknown as PendingReplyJob) || null;
}

export async function wasPausedAfterClaim(userId: string, claimedAt: Date): Promise<boolean> {
  const collection = await pendingReplyRepo.collection();
  const state = await collection.findOne({ userId } as any, { projection: { pausedUntil: 1 } });
  return Boolean((state as any)?.pausedUntil && (state as any).pausedUntil > claimedAt);
}

export async function releaseClaim(
  job: PendingReplyJob,
  retryDelayMs = config.messengerReplyRetryMs
): Promise<void> {
  const collection = await pendingReplyRepo.collection();
  const now = new Date();
  await collection.updateOne({ _id: job._id, status: "processing", claimId: job.claimId } as any, {
    $set: {
      status: "pending",
      hasPendingMessages: true,
      replyAt: new Date(now.getTime() + retryDelayMs),
      updatedAt: now,
    },
    $unset: { claimId: "", claimedAt: "", leaseUntil: "" },
  });
}

/** Removes only the messages included in this claim, preserving newer ones. */
export async function completeClaim(job: PendingReplyJob): Promise<void> {
  const claimedMessageIds = job.messages.map((message) => message.id);
  const collection = await pendingReplyRepo.collection();
  const now = new Date();

  await collection.updateOne(
    { _id: job._id, status: "processing", claimId: job.claimId } as any,
    [
      {
        $set: {
          messages: {
            $filter: {
              input: "$messages",
              as: "message",
              cond: { $not: [{ $in: ["$$message.id", claimedMessageIds] }] },
            },
          },
        },
      },
      {
        $set: {
          hasPendingMessages: { $gt: [{ $size: "$messages" }, 0] },
          status: {
            $cond: [{ $gt: [{ $size: "$messages" }, 0] }, "pending", "idle"],
          },
          replyAt: {
            $cond: [{ $gt: [{ $size: "$messages" }, 0] }, "$replyAt", null],
          },
          updatedAt: now,
          lastReplyAt: now,
          expiresAt: expiryDate(now),
        },
      },
      { $unset: ["claimId", "claimedAt", "leaseUntil"] },
    ] as any
  );
}
