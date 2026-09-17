import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', true);

app.use('/', router);
app.use(errorHandler);
