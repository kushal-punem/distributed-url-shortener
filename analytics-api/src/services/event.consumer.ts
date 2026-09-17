import { createClient } from 'redis';
import { config } from '../config.js';
import { analyticsService, RawClickInput } from './analytics.service.js';

let streamClient: ReturnType<typeof createClient> | null = null;
let isConsuming = false;
const STREAM_KEY = 'stream:click_events';
const CONSUMER_GROUP = 'analytics_group';
const CONSUMER_ID = `worker_${Math.random().toString(36).substring(2, 9)}`;

export async function startEventConsumer(): Promise<void> {
  streamClient = createClient({
    url: config.redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[RedisConsumer] Max retries reached, retrying in 5s...');
          return 5000;
        }
        return Math.min(retries * 200, 3000);
      },
    },
  });

  streamClient.on('error', (err) => {
    console.error('[RedisConsumer] Redis client error:', err.message);
  });

  streamClient.on('connect', () => {
    console.log('[RedisConsumer] Redis client connected successfully');
  });

  await streamClient.connect();

  // Create stream and consumer group if it doesn't already exist
  try {
    await streamClient.xGroupCreate(STREAM_KEY, CONSUMER_GROUP, '$', {
      MKSTREAM: true,
    });
    console.log(`[RedisConsumer] Created Consumer Group "${CONSUMER_GROUP}" on "${STREAM_KEY}"`);
  } catch (err: any) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      console.log(`[RedisConsumer] Consumer Group "${CONSUMER_GROUP}" already exists, continuing.`);
    } else {
      console.warn('[RedisConsumer] Warning creating consumer group:', err.message);
    }
  }

  isConsuming = true;
  runStreamLoop().catch((err) => {
    console.error('[RedisConsumer] Fatal error in stream loop:', err);
  });

  console.log(`[RedisConsumer] Stream worker ${CONSUMER_ID} listening on "${STREAM_KEY}"...`);
}

async function runStreamLoop(): Promise<void> {
  while (isConsuming && streamClient && streamClient.isOpen) {
    try {
      // Read new messages from the stream for our consumer group
      const response = await streamClient.xReadGroup(
        CONSUMER_GROUP,
        CONSUMER_ID,
        [{ key: STREAM_KEY, id: '>' }],
        { COUNT: 20, BLOCK: 2000 }
      );

      if (response && response.length > 0) {
        for (const stream of response) {
          for (const item of stream.messages) {
            try {
              const event: RawClickInput = JSON.parse(item.message.payload);
              await analyticsService.recordClick(event);
              // Acknowledge processed message in the stream
              await streamClient.xAck(STREAM_KEY, CONSUMER_GROUP, item.id);
            } catch (itemErr) {
              console.error('[RedisConsumer] Failed to ingest stream item:', item.id, itemErr);
            }
          }
        }
      }
    } catch (err: any) {
      if (isConsuming) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

export async function checkRedisConsumerHealth(): Promise<boolean> {
  if (!streamClient) {
    return false;
  }
  return streamClient.isOpen && streamClient.isReady;
}

export async function stopEventConsumer(): Promise<void> {
  isConsuming = false;
  if (streamClient && streamClient.isOpen) {
    await streamClient.quit();
    streamClient = null;
    console.log('[RedisConsumer] Closed Redis stream consumer connection.');
  }
}
