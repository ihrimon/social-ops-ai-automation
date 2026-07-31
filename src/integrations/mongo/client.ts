import mongoose from "mongoose";
import { mongoConfig } from "../../config/env.js";
import { ConfigError } from "../../infra/errors.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

function requireMongoUri(): void {
  if (!mongoConfig.uri) {
    throw new ConfigError("MONGODB_URI is missing. Add it to your .env file.");
  }
}

/** Establishes (or reuses) the single Mongoose connection for the app. */
export function connectMongo(): Promise<typeof mongoose> {
  requireMongoUri();

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoConfig.uri as string, {
      dbName: mongoConfig.dbName,
      maxPoolSize: mongoConfig.maxPoolSize,
      minPoolSize: mongoConfig.minPoolSize,
      serverSelectionTimeoutMS: mongoConfig.serverSelectionTimeoutMs,
    });
  }

  return connectionPromise;
}

/** Mongoose connection readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting. */
export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function closeMongoClient(): Promise<void> {
  if (connectionPromise) {
    await mongoose.disconnect();
    connectionPromise = null;
  }
}
