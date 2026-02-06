import { Worker } from 'bullmq';
import { getRedis } from './queue/redis.js';
import { handlePipelineExecution } from './handlers/worker.js';
import { createLogger } from './utils/logger.js';
import { updatePipelineJobStatus } from './utils/job-tracker.js';
import { runCleanup } from './storage/cleanup.js';

const logger = createLogger({ component: 'worker-main' });

const connection = getRedis();
const concurrency = Math.max(1, Math.min(20, Number(process.env.WORKER_CONCURRENCY || '2')));

logger.info('worker_start', { concurrency });

const worker = new Worker(
  'pipeline',
  async (job) => {
    const payload = job.data as any;
    const jobId = payload?.job_id;
    if (!jobId) throw new Error('job_id missing from queue payload');
    try {
      await handlePipelineExecution(payload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('pipeline_job_failed', { job_id: jobId, error: msg });
      try {
        await updatePipelineJobStatus(jobId, 'error', msg);
      } catch (e) {
        logger.error('pipeline_job_error_update_failed', { job_id: jobId, error: e instanceof Error ? e.message : String(e) });
      }
      throw error;
    }
  },
  { connection, concurrency }
);

// Periodic cleanup (retention + cache TTL).
const cleanupIntervalMs = Math.max(10 * 60 * 1000, Number(process.env.CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
setInterval(() => {
  void runCleanup()
    .then((r) => logger.info('cleanup_complete', r))
    .catch((e) => logger.warn('cleanup_failed', { error: e instanceof Error ? e.message : String(e) }));
}, cleanupIntervalMs).unref?.();

worker.on('failed', (job, err) => {
  logger.error('bull_job_failed', { job_id: job?.id, error: err?.message });
});

worker.on('completed', (job) => {
  logger.info('bull_job_completed', { job_id: job?.id });
});

process.on('SIGTERM', async () => {
  logger.info('worker_sigterm');
  await worker.close();
  process.exit(0);
});
