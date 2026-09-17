import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://urluser:urlpassword@localhost:5432/urlshortener',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  analyticsApiUrl: process.env.ANALYTICS_API_URL || 'http://localhost:3001',
  redisEventChannel: process.env.REDIS_EVENT_CHANNEL || 'click_events',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400', 10),
  negativeCacheTtlSeconds: parseInt(process.env.NEGATIVE_CACHE_TTL_SECONDS || '60', 10),
};
