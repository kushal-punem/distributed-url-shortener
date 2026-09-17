import { app } from './app.js';
import { config } from './config.js';
import { initDb, pool } from './db/postgres.js';
import { initRedis, redisClient } from './cache/redis.js';

async function bootstrap() {
  console.log('[RedirectionAPI] Starting service...');

  // Initialize PostgreSQL schema
  try {
    await initDb();
  } catch (err) {
    console.error('[RedirectionAPI] Failed to initialize PostgreSQL:', err);
    process.exit(1);
  }

  // Initialize Redis connection
  try {
    await initRedis();
  } catch (err) {
    console.warn('[RedirectionAPI] Redis connection failed on startup, will retry in background:', err);
  }

  // Start HTTP listener
  const server = app.listen(config.port, () => {
    console.log(`[RedirectionAPI] Server listening on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[RedirectionAPI] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await pool.end();
        console.log('[RedirectionAPI] PostgreSQL pool closed');
        if (redisClient.isOpen) {
          await redisClient.quit();
          console.log('[RedirectionAPI] Redis client disconnected');
        }
      } catch (err) {
        console.error('[RedirectionAPI] Error during shutdown:', err);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[RedirectionAPI] Fatal error in bootstrap:', err);
  process.exit(1);
});
