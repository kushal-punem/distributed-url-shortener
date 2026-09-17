import { app } from './app.js';
import { config } from './config.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { startEventConsumer, stopEventConsumer } from './services/event.consumer.js';

async function bootstrap() {
  console.log('[AnalyticsAPI] Starting service...');

  // Connect to MongoDB
  try {
    await connectMongo();
  } catch (err) {
    console.error('[AnalyticsAPI] Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // Start Redis Pub/Sub subscriber
  try {
    await startEventConsumer();
  } catch (err) {
    console.warn('[AnalyticsAPI] Failed to start Redis subscriber on startup, will retry in background:', err);
  }

  // Start HTTP listener
  const server = app.listen(config.port, () => {
    console.log(`[AnalyticsAPI] Server listening on port ${config.port} (${config.nodeEnv})`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[AnalyticsAPI] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await stopEventConsumer();
        await closeMongo();
        console.log('[AnalyticsAPI] Resources cleaned up.');
      } catch (err) {
        console.error('[AnalyticsAPI] Error during shutdown:', err);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[AnalyticsAPI] Fatal error in bootstrap:', err);
  process.exit(1);
});
