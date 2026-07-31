import type { Model } from "mongoose";
import { CommentDedupe, type CommentDedupeDoc } from "./dedupe.model.js";

export async function rememberIncomingComment(
  commentId: string,
  postId: string,
  commenterId: string,
  model: Model<CommentDedupeDoc> = CommentDedupe
): Promise<boolean> {
  try {
    await model.create({ commentId, postId, commenterId });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return false;
    }
    throw error;
  }
}

// Keep a failed event eligible for a later retry instead of permanently
// suppressing it because the Graph API or AI provider had a temporary error.
export async function forgetIncomingComment(
  commentId: string,
  model: Model<CommentDedupeDoc> = CommentDedupe
): Promise<void> {
  await model.deleteOne({ commentId });
}
