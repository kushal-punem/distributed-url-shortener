import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id SERIAL PRIMARY KEY,
        short_code VARCHAR(32) NOT NULL,
        original_url TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_urls_short_code ON urls (short_code);
      CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls (created_at DESC);
    `);
    console.log('[PostgreSQL] Database schema initialized successfully');
  } catch (error) {
    console.error('[PostgreSQL] Error initializing database schema', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkPostgresHealth(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 as healthy');
    return res.rows.length > 0;
  } catch (error) {
    console.error('[PostgreSQL] Health check failed', error);
    return false;
  }
}
