import { z } from "zod";

/**
 * Validates only the envelope shape the webhook controller actually reads
 * (`object`, `entry[].messaging`, `entry[].changes`) — deliberately loose
 * (`.passthrough()`) on the nested message/change objects, since Facebook's
 * payload shape varies across event types and the handlers already access
 * those fields defensively with optional chaining.
 */
const messagingEventSchema = z
  .object({
    sender: z.object({ id: z.string() }).passthrough().optional(),
    recipient: z.object({ id: z.string() }).passthrough().optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
    message: z
      .object({
        mid: z.string().optional(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const feedChangeSchema = z
  .object({
    field: z.string().optional(),
    value: z
      .object({
        item: z.string().optional(),
        verb: z.string().optional(),
        comment_id: z.string().optional(),
        post_id: z.string().optional(),
        parent_id: z.string().optional(),
        message: z.string().optional(),
        from: z.object({ id: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const webhookEntrySchema = z
  .object({
    messaging: z.array(messagingEventSchema).optional(),
    changes: z.array(feedChangeSchema).optional(),
  })
  .passthrough();

export const webhookPayloadSchema = z
  .object({
    object: z.string(),
    entry: z.array(webhookEntrySchema),
  })
  .passthrough();

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
