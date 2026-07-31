import { config } from "../../config/env.js";
import { createRepository } from "../../integrations/mongo/repository.js";

const commentDedupeRepo = createRepository(config.mongodbCommentDedupeCollection);

export async function rememberIncomingComment(
  commentId: string,
  postId: string,
  commenterId: string
): Promise<boolean> {
  const collection = await commentDedupeRepo.collection();

  try {
    await collection.insertOne({
      commentId,
      postId,
      commenterId,
      createdAt: new Date(),
    } as any);
    return true;
  } catch (error) {
    if ((error as any).code === 11000) {
      return false;
    }
    throw error;
  }
}

// Keep a failed event eligible for a later retry instead of permanently
// suppressing it because the Graph API or AI provider had a temporary error.
export async function forgetIncomingComment(commentId: string): Promise<void> {
  const collection = await commentDedupeRepo.collection();
  await collection.deleteOne({ commentId } as any);
}
