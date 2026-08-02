import { describe, expect, it, vi } from "vitest";
import type { Model } from "mongoose";
import {
  isBotSentMessage,
  rememberBotSentMessage,
  rememberIncomingMessage,
} from "../../src/modules/messenger/dedupe.store.js";
import type { MessageDedupeDoc } from "../../src/modules/messenger/dedupe.model.js";
import {
  forgetIncomingComment,
  rememberIncomingComment,
} from "../../src/modules/comments/dedupe.store.js";
import type { CommentDedupeDoc } from "../../src/modules/comments/dedupe.model.js";

/** Mongo's real duplicate-key error shape — the dedupe stores branch on `.code === 11000`. */
function duplicateKeyError(): Error & { code: number } {
  const error = new Error("E11000 duplicate key error") as Error & { code: number };
  error.code = 11000;
  return error;
}

function fakeModel(overrides: Record<string, unknown>) {
  return overrides as unknown as Model<MessageDedupeDoc & CommentDedupeDoc>;
}

describe("messenger dedupe store", () => {
  it("rememberIncomingMessage returns true for a first-seen message id", async () => {
    const create = vi.fn().mockResolvedValue({});
    const model = fakeModel({ create });

    const result = await rememberIncomingMessage("msg-1", "user-1", model);

    expect(result).toBe(true);
    expect(create).toHaveBeenCalledWith({ messageId: "msg-1", senderId: "user-1" });
  });

  it("rememberIncomingMessage returns false on a duplicate message id", async () => {
    const create = vi.fn().mockRejectedValue(duplicateKeyError());
    const model = fakeModel({ create });

    const result = await rememberIncomingMessage("msg-1", "user-1", model);

    expect(result).toBe(false);
  });

  it("rememberIncomingMessage rethrows unrelated errors", async () => {
    const create = vi.fn().mockRejectedValue(new Error("connection lost"));
    const model = fakeModel({ create });

    await expect(rememberIncomingMessage("msg-1", "user-1", model)).rejects.toThrow(
      "connection lost"
    );
  });

  it("isBotSentMessage returns true from the in-memory cache without hitting the DB", async () => {
    const create = vi.fn().mockResolvedValue({});
    const exists = vi.fn().mockResolvedValue(null);
    const model = fakeModel({ create, exists });

    await rememberBotSentMessage("bot-msg-1", model);
    const result = await isBotSentMessage("bot-msg-1", model);

    expect(result).toBe(true);
    expect(exists).not.toHaveBeenCalled();
  });

  it("isBotSentMessage returns false for an unknown message id", async () => {
    const exists = vi.fn().mockResolvedValue(null);
    const model = fakeModel({ exists });

    const result = await isBotSentMessage("never-seen", model);

    expect(result).toBe(false);
  });
});

describe("comments dedupe store", () => {
  it("rememberIncomingComment returns true for a first-seen comment id", async () => {
    const create = vi.fn().mockResolvedValue({});
    const model = fakeModel({ create });

    const result = await rememberIncomingComment("c1", "p1", "u1", model);

    expect(result).toBe(true);
    expect(create).toHaveBeenCalledWith({ commentId: "c1", postId: "p1", commenterId: "u1" });
  });

  it("rememberIncomingComment returns false on a duplicate comment id", async () => {
    const create = vi.fn().mockRejectedValue(duplicateKeyError());
    const model = fakeModel({ create });

    const result = await rememberIncomingComment("c1", "p1", "u1", model);

    expect(result).toBe(false);
  });

  it("forgetIncomingComment deletes the dedupe record so a failed reply can be retried", async () => {
    const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const model = fakeModel({ deleteOne });

    await forgetIncomingComment("c1", model);

    expect(deleteOne).toHaveBeenCalledWith({ commentId: "c1" });
  });
});
