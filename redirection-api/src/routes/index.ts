import path from 'path';
import { Router } from 'express';
import { urlController } from '../controllers/url.controller.js';
import { config } from '../config.js';

import { createRedisRateLimiter } from '../middlewares/rate.limiter.js';

export const router = Router();

// Health check
router.get('/health', (req, res) => urlController.health(req, res));

// Serve Frontend Dashboard on root and /dashboard
router.get(['/', '/dashboard'], (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Distributed rate limiter for URL creation: 60 requests per minute
const shortenLimiter = createRedisRateLimiter({
  windowSeconds: 60,
  maxRequests: 60,
  prefix: 'rl:shorten',
});

// URL Management APIs
router.post('/api/urls', shortenLimiter, (req, res, next) => urlController.shorten(req, res, next));
router.get('/api/urls/:code', (req, res, next) => urlController.getInfo(req, res, next));

// Analytics API Proxy (forwards requests seamlessly to Analytics service)
router.get('/api/analytics/:code/events', async (req, res) => {
  try {
    const code = req.params.code;
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const targetUrl = `${config.analyticsApiUrl}/api/analytics/${code}/events${query ? `?${query}` : ''}`;
    const proxyRes = await fetch(targetUrl);
    const data = await proxyRes.json();
    res.status(proxyRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Analytics service unreachable' });
  }
});

router.get('/api/analytics/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const targetUrl = `${config.analyticsApiUrl}/api/analytics/${code}`;
    const proxyRes = await fetch(targetUrl);
    const data = await proxyRes.json();
    res.status(proxyRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Analytics service unreachable' });
  }
});

// Exclude favicon or system paths
router.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// Short URL redirection (must remain at the bottom of the routes)
router.get('/:code', (req, res, next) => urlController.redirect(req, res, next));
