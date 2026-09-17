import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

import path from 'path';

export const app = express();

// Security and utility middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API redirects and CDN styles/scripts
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy headers for accurate IP resolution behind load balancers/reverse proxies
app.set('trust proxy', true);

// Serve static assets from public/
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

// Main router
app.use('/', router);

// Central error handler
app.use(errorHandler);
