import { Collection, CreateIndexesOptions, Document, IndexSpecification } from "mongodb";
import { getMongoCollection } from "./client.js";

export interface IndexSpec {
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}

/**
 * Wraps a Mongo collection so every store stops re-declaring the same
 * "resolve + cache the collection handle" boilerplate, and index creation
 * reads as a plain list instead of repeated createIndex calls.
 */
export function createRepository<T extends Document = Document>(collectionName: string) {
  let collectionPromise: Promise<Collection<T>> | null = null;

  function collection(): Promise<Collection<T>> {
    if (!collectionPromise) {
      collectionPromise = getMongoCollection<T>(collectionName);
    }
    return collectionPromise;
  }

  async function ensureIndexes(specs: IndexSpec[]): Promise<void> {
    const col = await collection();
    await Promise.all(specs.map((spec) => col.createIndex(spec.key, spec.options)));
  }

  return { collection, ensureIndexes };
}
