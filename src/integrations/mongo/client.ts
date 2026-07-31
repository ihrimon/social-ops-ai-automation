import { Collection, Document, MongoClient } from "mongodb";
import { config } from "../../config/env.js";
import { ConfigError } from "../../infra/errors.js";

let mongoClientPromise: Promise<MongoClient> | null = null;

function requireMongoUri(): void {
  if (!config.mongodbUri) {
    throw new ConfigError("MONGODB_URI is missing. Add it to your .env file.");
  }
}

export async function getMongoClient(): Promise<MongoClient> {
  requireMongoUri();

  if (!mongoClientPromise) {
    const client = new MongoClient(config.mongodbUri as string, {
      maxPoolSize: config.mongodbMaxPoolSize,
      minPoolSize: config.mongodbMinPoolSize,
      serverSelectionTimeoutMS: config.mongodbServerSelectionTimeoutMs,
    });

    mongoClientPromise = client.connect();
  }

  return mongoClientPromise;
}

export async function getMongoDb() {
  const client = await getMongoClient();
  return client.db(config.mongodbDbName);
}

export async function getMongoCollection<T extends Document = Document>(
  collectionName: string
): Promise<Collection<T>> {
  const db = await getMongoDb();
  return db.collection<T>(collectionName);
}

export async function closeMongoClient(): Promise<void> {
  if (mongoClientPromise) {
    const client = await mongoClientPromise;
    await client.close();
    mongoClientPromise = null;
  }
}
