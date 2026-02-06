import { Queue } from 'bullmq';
import { getRedis } from './redis.js';

export const PIPELINE_QUEUE_NAME = 'pipeline';

let queue: Queue | null = null;

export function getPipelineQueue(): Queue {
  if (queue) return queue;
  const connection = getRedis();
  queue = new Queue(PIPELINE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  });
  return queue;
}

