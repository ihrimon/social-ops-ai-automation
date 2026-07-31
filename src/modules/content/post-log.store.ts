import { config } from "../../config/env.js";
import { createRepository } from "../../integrations/mongo/repository.js";

const postLogRepo = createRepository(config.mongodbPostLogsCollection);

export async function createPostLog(data: Record<string, unknown> = {}) {
  const collection = await postLogRepo.collection();
  const now = new Date();
  const result = await collection.insertOne({
    status: "started",
    topic: null,
    article: null,
    error: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  } as any);

  return result.insertedId;
}

export async function updatePostLog(logId: unknown, data: Record<string, unknown> = {}) {
  if (!logId) {
    return;
  }

  const collection = await postLogRepo.collection();
  await collection.updateOne({ _id: logId } as any, {
    $set: {
      ...data,
      updatedAt: new Date(),
    },
  });
}
