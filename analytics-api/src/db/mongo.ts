import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '../config.js';

export interface ClickDocument {
  shortCode: string;
  originalUrl: string;
  timestamp: Date;
  ip: string;
  userAgent: string;
  referer: string;
  headers?: Record<string, unknown>;
  createdAt: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db && client) return db;

  console.log('[MongoDB] Connecting to MongoDB instance...');
  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db(config.mongoDbName);

  console.log(`[MongoDB] Connected successfully to database: ${config.mongoDbName}`);

  // Create optimized indexes for high-volume ingestion and fast aggregations
  const collection = db.collection<ClickDocument>('click_events');
  await collection.createIndex({ shortCode: 1, timestamp: -1 });
  await collection.createIndex({ timestamp: -1 });
  await collection.createIndex({ shortCode: 1, ip: 1 });

  return db;
}

export function getClicksCollection(): Collection<ClickDocument> {
  if (!db) {
    throw new Error('MongoDB not initialized. Call connectMongo() first.');
  }
  return db.collection<ClickDocument>('click_events');
}

export async function checkMongoHealth(): Promise<boolean> {
  try {
    if (!db) return false;
    await db.command({ ping: 1 });
    return true;
  } catch (err) {
    console.error('[MongoDB] Health check ping failed:', err);
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Connection closed.');
  }
}
