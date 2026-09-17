import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { urlService } from '../src/services/url.service.js';
import * as postgres from '../src/db/postgres.js';
import * as redis from '../src/cache/redis.js';

describe('Redirection API Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 when databases are healthy', async () => {
      vi.spyOn(postgres, 'checkPostgresHealth').mockResolvedValue(true);
      vi.spyOn(redis, 'checkRedisHealth').mockResolvedValue(true);

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.services.postgres).toBe('up');
      expect(res.body.services.redis).toBe('up');
    });

    it('should return 503 when a service is degraded', async () => {
      vi.spyOn(postgres, 'checkPostgresHealth').mockResolvedValue(true);
      vi.spyOn(redis, 'checkRedisHealth').mockResolvedValue(false);

      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.services.redis).toBe('down');
    });
  });

  describe('POST /api/urls', () => {
    it('should validate and create a short URL', async () => {
      vi.spyOn(urlService, 'createShortUrl').mockResolvedValue({
        id: 1,
        short_code: 'abc1234',
        original_url: 'https://example.com/long-page',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await request(app)
        .post('/api/urls')
        .send({ url: 'https://example.com/long-page' });

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toBe('abc1234');
      expect(res.body.originalUrl).toBe('https://example.com/long-page');
      expect(res.body.shortUrl).toContain('abc1234');
    });

    it('should reject invalid URLs', async () => {
      const res = await request(app)
        .post('/api/urls')
        .send({ url: 'not-a-valid-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject private IP and localhost URLs to prevent SSRF', async () => {
      const resLocal = await request(app)
        .post('/api/urls')
        .send({ url: 'http://localhost:8080/admin' });

      expect(resLocal.status).toBe(400);
      expect(resLocal.body.error).toBe('URL Safety Violation');

      const resPrivate = await request(app)
        .post('/api/urls')
        .send({ url: 'http://169.254.169.254/latest/meta-data/' });

      expect(resPrivate.status).toBe(400);
      expect(resPrivate.body.error).toBe('URL Safety Violation');
    });
  });

  describe('GET /api/urls/:code', () => {
    it('should return URL info when code exists', async () => {
      vi.spyOn(urlService, 'getUrlInfo').mockResolvedValue({
        id: 1,
        short_code: 'xyz987',
        original_url: 'https://github.com',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await request(app).get('/api/urls/xyz987');
      expect(res.status).toBe(200);
      expect(res.body.shortCode).toBe('xyz987');
      expect(res.body.originalUrl).toBe('https://github.com');
    });

    it('should return 404 when code does not exist', async () => {
      vi.spyOn(urlService, 'getUrlInfo').mockResolvedValue(null);

      const res = await request(app).get('/api/urls/notfound');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Short URL not found');
    });
  });

  describe('GET /:code', () => {
    it('should redirect with 302 to original URL when found', async () => {
      vi.spyOn(urlService, 'resolveUrl').mockResolvedValue('https://example.com/destination');

      const res = await request(app).get('/target1');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://example.com/destination');
    });

    it('should return 404 when short code is not found', async () => {
      vi.spyOn(urlService, 'resolveUrl').mockResolvedValue(null);

      const res = await request(app).get('/missing123');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });
});
