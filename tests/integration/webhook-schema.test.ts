import { describe, expect, it } from "vitest";
import { webhookPayloadSchema } from "../../src/server/webhook.schema.js";

describe("webhookPayloadSchema", () => {
  it("accepts a real-shaped Messenger message payload", () => {
    const payload = {
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-1" },
              recipient: { id: "page-1" },
              timestamp: 1234567890,
              message: { mid: "mid-1", text: "hello" },
            },
          ],
        },
      ],
    };

    const result = webhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts a real-shaped comment (feed change) payload", () => {
    const payload = {
      object: "page",
      entry: [
        {
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "c1",
                post_id: "page-1_p1",
                message: "nice!",
                from: { id: "user-1" },
              },
            },
          ],
        },
      ],
    };

    const result = webhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("passes through unknown extra fields instead of stripping/rejecting them", () => {
    const payload = {
      object: "page",
      entry: [{ messaging: [], unexpected_field: "meta can add fields anytime" }],
      another_unexpected_top_level_field: true,
    };

    const result = webhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing the required `object` field", () => {
    const result = webhookPayloadSchema.safeParse({ entry: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a payload where `entry` is not an array", () => {
    const result = webhookPayloadSchema.safeParse({ object: "page", entry: "not-an-array" });
    expect(result.success).toBe(false);
  });

  it("rejects a completely malformed payload", () => {
    const result = webhookPayloadSchema.safeParse("not even an object");
    expect(result.success).toBe(false);
  });

  it("rejects null and undefined payloads", () => {
    expect(webhookPayloadSchema.safeParse(null).success).toBe(false);
    expect(webhookPayloadSchema.safeParse(undefined).success).toBe(false);
  });
});
