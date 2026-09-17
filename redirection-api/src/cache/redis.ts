import { createClient } from 'redis';
import { config } from '../config.js';

export const redisClient = createClient({
  url: config.redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Max retries reached, delaying reconnection...');
        return 5000;
      }
      return Math.min(retries * 200, 3000);
    },
  },
});

redisClient.on('error', (err) => {
  console.error('[Redis] Client error:', err.message);
});

redisClient.on('connect', () => {
  console.log('[Redis] Client connected successfully');
});

export async function initRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

const URL_KEY_PREFIX = 'url:';
const NOT_FOUND_KEY_PREFIX = 'url_404:';

export async function getCachedUrl(code: string): Promise<string | null> {
  try {
    if (!redisClient.isReady) return null;
    return await redisClient.get(`${URL_KEY_PREFIX}${code}`);
  } catch (err) {
    console.warn('[Redis] Error fetching cached URL:', err);
    return null;
  }
}

export async function setCachedUrl(code: string, url: string, ttl: number = config.cacheTtlSeconds): Promise<void> {
  try {
    if (!redisClient.isReady) return;
    await redisClient.set(`${URL_KEY_PREFIX}${code}`, url, {
      EX: ttl,
    });
  } catch (err) {
    console.warn('[Redis] Error setting cached URL:', err);
  }
}

export async function isCachedNotFound(code: string): Promise<boolean> {
  try {
    if (!redisClient.isReady) return false;
    const res = await redisClient.get(`${NOT_FOUND_KEY_PREFIX}${code}`);
    return res !== null;
  } catch (err) {
    console.warn('[Redis] Error checking not-found cache:', err);
    return false;
  }
}

export async function setCachedNotFound(code: string, ttl: number = config.negativeCacheTtlSeconds): Promise<void> {
  try {
    if (!redisClient.isReady) return;
    await redisClient.set(`${NOT_FOUND_KEY_PREFIX}${code}`, '1', {
      EX: ttl,
    });
  } catch (err) {
    console.warn('[Redis] Error setting not-found cache:', err);
  }
}

export async function publishClickEvent(channel: string, payload: unknown): Promise<void> {
  try {
    if (!redisClient.isReady) return;
    await redisClient.publish(channel, JSON.stringify(payload));
  } catch (err) {
    console.warn('[Redis] Error publishing event to channel', channel, err);
  }
}

export async function appendToClickStream(streamKey: string, payload: unknown): Promise<void> {
  try {
    if (!redisClient.isReady) return;
    await redisClient.xAdd(streamKey, '*', {
      payload: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[Redis] Error appending event to stream', streamKey, err);
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient.isReady) return false;
    const reply = await redisClient.ping();
    return reply === 'PONG';
  } catch (err) {
    console.error('[Redis] Health check ping failed:', err);
    return false;
  }
}
