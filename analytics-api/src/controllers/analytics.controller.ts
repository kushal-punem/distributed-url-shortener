import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { analyticsService } from '../services/analytics.service.js';
import { checkMongoHealth } from '../db/mongo.js';
import { checkRedisConsumerHealth } from '../services/event.consumer.js';

const eventSchema = z.object({
  shortCode: z.string().min(1),
  originalUrl: z.string().optional(),
  timestamp: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  referer: z.string().optional(),
  headers: z.record(z.any()).optional(),
});

export class AnalyticsController {
  async recordEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = eventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format(),
        });
        return;
      }

      await analyticsService.recordClick({
        shortCode: parsed.data.shortCode,
        originalUrl: parsed.data.originalUrl || '',
        timestamp: parsed.data.timestamp,
        ip: parsed.data.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
        userAgent: parsed.data.userAgent || req.headers['user-agent'] || 'unknown',
        referer: parsed.data.referer || (req.headers['referer'] as string) || 'direct',
        headers: parsed.data.headers,
      });

      res.status(202).json({ status: 'accepted' });
    } catch (err: unknown) {
      next(err);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortCode = String(req.params.code);
      const summary = await analyticsService.getSummary(shortCode);
      res.json(summary);
    } catch (err: unknown) {
      next(err);
    }
  }

  async getRawEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shortCode = String(req.params.code);
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const skip = Math.max(parseInt(req.query.skip as string, 10) || 0, 0);

      const data = await analyticsService.getRawEvents(shortCode, limit, skip);
      res.json(data);
    } catch (err: unknown) {
      next(err);
    }
  }

  async health(req: Request, res: Response): Promise<void> {
    const [mongoHealthy, redisHealthy] = await Promise.all([
      checkMongoHealth(),
      checkRedisConsumerHealth(),
    ]);

    const isHealthy = mongoHealthy; // Mongo is primary
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      services: {
        mongodb: mongoHealthy ? 'up' : 'down',
        redisSubscriber: redisHealthy ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const analyticsController = new AnalyticsController();
