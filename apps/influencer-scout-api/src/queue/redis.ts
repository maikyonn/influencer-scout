import Redis from 'ioredis';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'redis' });

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required');
  redis = new Redis(url, {
    maxRetriesPerRequest: null, // BullMQ recommendation
    enableReadyCheck: true,
    lazyConnect: false,
  });
  redis.on('error', (err) => {
    logger.error('redis_error', { error: err instanceof Error ? err.message : String(err) });
  });
  return redis;
}

export async function redisPing(): Promise<void> {
  const r = getRedis();
  await r.ping();
}

