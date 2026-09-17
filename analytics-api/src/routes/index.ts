import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';

export const router = Router();

// Health check
router.get('/health', (req, res) => analyticsController.health(req, res));

// Event ingestion endpoint
router.post('/api/events', (req, res, next) => analyticsController.recordEvent(req, res, next));

// Analytics query endpoints
router.get('/api/analytics/:code', (req, res, next) => analyticsController.getSummary(req, res, next));
router.get('/api/analytics/:code/events', (req, res, next) => analyticsController.getRawEvents(req, res, next));
