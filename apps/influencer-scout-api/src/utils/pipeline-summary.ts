import { getJob } from '../storage/jobs.js';
import { getArtifact } from '../storage/artifacts.js';
import { appendEvent } from '../storage/events.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'pipeline-summary' });

export async function writePipelineSummary(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;

  const timing = await getArtifact(jobId, 'timing');
  const final = await getArtifact(jobId, 'final');

  const summary = {
    job_id: jobId,
    status: job.status,
    progress: job.progress,
    current_stage: job.current_stage,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    timing: timing?.data ?? null,
    results: final?.data
      ? {
          profiles_count: Array.isArray((final.data as any)?.profiles) ? (final.data as any).profiles.length : null,
          pipeline_stats: (final.data as any)?.pipeline_stats ?? null,
        }
      : null,
  };

  logger.info('pipeline_summary', summary);
  await appendEvent(jobId, 'info', 'pipeline_summary', summary);
}

