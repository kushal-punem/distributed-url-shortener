import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { urlService } from '../services/url.service.js';
import { dispatchClickEventAsync } from '../services/event.publisher.js';
import { checkPostgresHealth } from '../db/postgres.js';
import { checkRedisHealth } from '../cache/redis.js';
import { config } from '../config.js';
import { validateSafeUrl } from '../middlewares/safety.middleware.js';

const shortenSchema = z.object({
  url: z.string().url('Invalid URL format. Must include protocol (e.g. https://)'),
  customCode: z.string().min(3).max(32).optional(),
});

export class UrlController {
  async shorten(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = shortenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format(),
        });
        return;
      }

      const { url, customCode } = parsed.data;

      // Validate URL against SSRF and loopback targets
      const safetyCheck = validateSafeUrl(url, req.hostname);
      if (!safetyCheck.valid) {
        res.status(400).json({
          error: 'URL Safety Violation',
          message: safetyCheck.error,
        });
        return;
      }

      const record = await urlService.createShortUrl(url, customCode);

      res.status(201).json({
        shortCode: record.short_code,
        shortUrl: `${config.baseUrl}/${record.short_code}`,
        originalUrl: record.original_url,
        createdAt: record.created_at,
      });
    } catch (err: unknown) {
      next(err);
    }
  }

  async getInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = String(req.params.code);
      const record = await urlService.getUrlInfo(code);

      if (!record) {
        res.status(404).json({ error: 'Short URL not found' });
        return;
      }

      res.json({
        shortCode: record.short_code,
        shortUrl: `${config.baseUrl}/${record.short_code}`,
        originalUrl: record.original_url,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      });
    } catch (err: unknown) {
      next(err);
    }
  }

  async redirect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = String(req.params.code);
      const originalUrl = await urlService.resolveUrl(code);

      if (!originalUrl) {
        res.status(404).json({
          error: 'Short URL not found or expired',
          code,
        });
        return;
      }

      // Collect client metadata for analytics
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const referer = req.headers['referer'] || req.headers['referrer'] || '';

      // Asynchronously dispatch click event without awaiting
      dispatchClickEventAsync({
        shortCode: code,
        originalUrl,
        timestamp: new Date().toISOString(),
        ip,
        userAgent: String(userAgent),
        referer: String(referer),
      });

      // Issue HTTP 302 Found redirect
      res.redirect(302, originalUrl);
    } catch (err: unknown) {
      next(err);
    }
  }

  async health(req: Request, res: Response): Promise<void> {
    const [postgresHealthy, redisHealthy] = await Promise.all([
      checkPostgresHealth(),
      checkRedisHealth(),
    ]);

    const isHealthy = postgresHealthy && redisHealthy;
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      services: {
        postgres: postgresHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const urlController = new UrlController();
