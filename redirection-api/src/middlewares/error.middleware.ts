import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message || err);

  if (err.message && (err.message.includes('already in use') || err.message.includes('must be'))) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
}
