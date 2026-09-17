import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { analyticsService } from '../src/services/analytics.service.js';
import * as mongo from '../src/db/mongo.js';
import * as consumer from '../src/services/event.consumer.js';

describe('Analytics API Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 when MongoDB and Redis consumer are healthy', async () => {
      vi.spyOn(mongo, 'checkMongoHealth').mockResolvedValue(true);
      vi.spyOn(consumer, 'checkRedisConsumerHealth').mockResolvedValue(true);

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.services.mongodb).toBe('up');
      expect(res.body.services.redisSubscriber).toBe('up');
    });

    it('should return 503 when MongoDB is down', async () => {
      vi.spyOn(mongo, 'checkMongoHealth').mockResolvedValue(false);
      vi.spyOn(consumer, 'checkRedisConsumerHealth').mockResolvedValue(true);

      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.services.mongodb).toBe('down');
    });
  });

  describe('POST /api/events', () => {
    it('should accept valid click event and return 202', async () => {
      vi.spyOn(analyticsService, 'recordClick').mockResolvedValue({
        shortCode: 'code123',
        originalUrl: 'https://example.com',
        timestamp: new Date(),
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        referer: 'https://referrer.com',
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/api/events')
        .send({
          shortCode: 'code123',
          originalUrl: 'https://example.com',
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('accepted');
      expect(analyticsService.recordClick).toHaveBeenCalled();
    });

    it('should reject invalid click event without shortCode', async () => {
      const res = await request(app)
        .post('/api/events')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/analytics/:code', () => {
    it('should return aggregated metrics for short code', async () => {
      vi.spyOn(analyticsService, 'getSummary').mockResolvedValue({
        shortCode: 'code123',
        totalClicks: 42,
        uniqueVisitors: 30,
        clicksByDate: [{ date: '2026-09-17', count: 42 }],
        topReferrers: [{ referrer: 'https://twitter.com', count: 20 }],
        topUserAgents: [{ userAgent: 'Mozilla/5.0', count: 42 }],
        recentClicks: [
          {
            timestamp: new Date(),
            ip: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            referer: 'https://twitter.com',
          },
        ],
      });

      const res = await request(app).get('/api/analytics/code123');
      expect(res.status).toBe(200);
      expect(res.body.shortCode).toBe('code123');
      expect(res.body.totalClicks).toBe(42);
      expect(res.body.uniqueVisitors).toBe(30);
      expect(res.body.topReferrers[0].referrer).toBe('https://twitter.com');
    });
  });

  describe('GET /api/analytics/:code/events', () => {
    it('should return raw event list with pagination info', async () => {
      vi.spyOn(analyticsService, 'getRawEvents').mockResolvedValue({
        shortCode: 'code123',
        total: 1,
        limit: 50,
        skip: 0,
        events: [
          {
            shortCode: 'code123',
            originalUrl: 'https://example.com',
            timestamp: new Date(),
            ip: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
            referer: 'direct',
            createdAt: new Date(),
          },
        ],
      });

      const res = await request(app).get('/api/analytics/code123/events?limit=10&skip=0');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.events).toHaveLength(1);
    });
  });
});
