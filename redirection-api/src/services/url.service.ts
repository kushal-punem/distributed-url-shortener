import { customAlphabet } from 'nanoid';
import { pool } from '../db/postgres.js';
import {
  getCachedUrl,
  setCachedUrl,
  isCachedNotFound,
  setCachedNotFound,
} from '../cache/redis.js';

// Base62 alphabet for safe, URL-friendly short codes
const generateNanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 7);

export interface UrlRecord {
  id: number;
  short_code: string;
  original_url: string;
  created_at: Date;
  updated_at: Date;
}

export class UrlService {
  /**
   * Resolves a short code to its original URL.
   * Checks Redis first; falls back to PostgreSQL on miss; caches result.
   */
  async resolveUrl(code: string): Promise<string | null> {
    // 1. Fast path: check negative cache to prevent DB hammer
    if (await isCachedNotFound(code)) {
      return null;
    }

    // 2. Fast path: check Redis cache
    const cached = await getCachedUrl(code);
    if (cached) {
      return cached;
    }

    // 3. Fallback path: query PostgreSQL
    const result = await pool.query<UrlRecord>(
      'SELECT original_url FROM urls WHERE short_code = $1 LIMIT 1',
      [code]
    );

    if (result.rows.length === 0) {
      // Set negative cache to guard against cache penetration
      await setCachedNotFound(code);
      return null;
    }

    const originalUrl = result.rows[0].original_url;

    // 4. Populate cache
    await setCachedUrl(code, originalUrl);

    return originalUrl;
  }

  /**
   * Creates a new short URL mapping or returns existing if identical.
   */
  async createShortUrl(originalUrl: string, customCode?: string): Promise<UrlRecord> {
    let code = customCode?.trim();

    if (code) {
      // Validate custom code format (alphanumeric, dash, underscore, 3-32 chars)
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(code)) {
        throw new Error('Custom code must be 3-32 alphanumeric characters, dashes, or underscores');
      }

      // Check if custom code already exists
      const existing = await pool.query<UrlRecord>(
        'SELECT id, short_code, original_url, created_at, updated_at FROM urls WHERE short_code = $1',
        [code]
      );
      if (existing.rows.length > 0) {
        throw new Error('Custom code is already in use');
      }
    } else {
      // Generate unique random code
      let attempts = 0;
      while (!code) {
        attempts++;
        if (attempts > 5) {
          throw new Error('Could not generate unique short code. Please try again.');
        }
        const candidate = generateNanoid();
        const existing = await pool.query(
          'SELECT 1 FROM urls WHERE short_code = $1 LIMIT 1',
          [candidate]
        );
        if (existing.rows.length === 0) {
          code = candidate;
        }
      }
    }

    // Insert into PostgreSQL
    const insertResult = await pool.query<UrlRecord>(
      `INSERT INTO urls (short_code, original_url)
       VALUES ($1, $2)
       RETURNING id, short_code, original_url, created_at, updated_at`,
      [code, originalUrl]
    );

    const record = insertResult.rows[0];

    // Prime cache immediately
    await setCachedUrl(record.short_code, record.original_url);

    return record;
  }

  /**
   * Fetches metadata for a given short code.
   */
  async getUrlInfo(code: string): Promise<UrlRecord | null> {
    const result = await pool.query<UrlRecord>(
      'SELECT id, short_code, original_url, created_at, updated_at FROM urls WHERE short_code = $1 LIMIT 1',
      [code]
    );

    return result.rows[0] || null;
  }
}

export const urlService = new UrlService();
