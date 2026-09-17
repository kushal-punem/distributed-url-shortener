import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../cache/redis.js';

export interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  prefix?: string;
}

export function createRedisRateLimiter(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, prefix = 'ratelimit' } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If Redis is not connected, gracefully bypass rate limiting
    if (!redisClient.isOpen || !redisClient.isReady) {
      next();
      return;
    }

    try {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown_ip';

      const key = `${prefix}:${req.path}:${ip}`;

      // Atomic increment & set expiry if new key
      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      const ttl = await redisClient.ttl(key);
      const remaining = Math.max(0, maxRequests - current);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', (Math.floor(Date.now() / 1000) + ttl).toString());

      if (current > maxRequests) {
        res.setHeader('Retry-After', ttl.toString());
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch (err) {
      console.warn('[RateLimiter] Error evaluating rate limit, bypassing:', err);
      next();
    }
  };
}
