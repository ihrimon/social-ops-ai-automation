import { config } from "../config/ai-config.js";
import { getMongoCollection } from "./mongo-client.js";

async function getCollection() {
  return getMongoCollection(config.mongodbPostLogsCollection);
}


export async function createPostLog(data = {}) {
  const collection = await getCollection();
  const now = new Date();
  const result = await collection.insertOne({
    status: "started",
    topic: null,
    article: null,
    error: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  });

  return result.insertedId;
}

export async function updatePostLog(logId, data = {}) {
  if (!logId) {
    return;
  }

  const collection = await getCollection();
  await collection.updateOne(
    { _id: logId },
    {
      $set: {
        ...data,
        updatedAt: new Date(),
      },
    }
  );
}
