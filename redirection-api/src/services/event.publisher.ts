import { publishClickEvent, appendToClickStream } from '../cache/redis.js';
import { config } from '../config.js';

export interface ClickEvent {
  shortCode: string;
  originalUrl: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  referer: string;
  headers?: Record<string, string | string[] | undefined>;
}

export function dispatchClickEventAsync(event: ClickEvent): void {
  // Use setImmediate to ensure event delivery doesn't block HTTP redirect response
  setImmediate(async () => {
    let redisSuccess = false;

    try {
      // 1. Primary path: Redis Streams (durable log) + Redis Pub/Sub (live broadcasts)
      await Promise.all([
        appendToClickStream('stream:click_events', event),
        publishClickEvent(config.redisEventChannel, event),
      ]);
      redisSuccess = true;
    } catch (err) {
      console.warn('[EventPublisher] Failed to publish event via Redis:', err);
    }

    // 2. Backup HTTP path only if Redis was unavailable or failed
    if (!redisSuccess && config.analyticsApiUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        await fetch(`${config.analyticsApiUrl}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          signal: controller.signal,
        }).catch((httpErr) => {
          if (process.env.DEBUG_EVENTS) {
            console.debug('[EventPublisher] HTTP fallback post error:', httpErr.message);
          }
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      } catch {
        // Ignored in fire-and-forget
      }
    }
  });
}
