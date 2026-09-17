import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://mongoadmin:mongopassword@localhost:27017/analytics?authSource=admin',
  mongoDbName: process.env.MONGODB_DB_NAME || 'analytics',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisEventChannel: process.env.REDIS_EVENT_CHANNEL || 'click_events',
};
