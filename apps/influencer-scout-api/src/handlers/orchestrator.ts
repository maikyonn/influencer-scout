/**
 * HTTP orchestrator handler for POST /pipeline/start
 * - API-keyed
 * - Creates Postgres job row
 * - Enqueues BullMQ job
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createJob, countActiveJobsForKey } from '../storage/jobs.js';
import { appendEvent } from '../storage/events.js';
import { getPipelineQueue } from '../queue/pipeline.js';
import { getRedis } from '../queue/redis.js';
import { apiKeyFromReq } from '../middleware/api-auth.js';
import { createLogger } from '../utils/logger.js';

const pipelineStartSchema = z.object({
  business_description: z.string().min(1, 'business_description is required and must be non-empty'),
  top_n: z.number().int().min(1).max(1000).optional().default(30),
  // Optional knobs to control cost/latency. Defaults preserve prior behavior.
  weaviate_top_n: z.number().int().min(10).max(5000).optional(),
  llm_top_n: z.number().int().min(1).max(1000).optional(),
  min_followers: z.number().int().min(0).optional(),
  max_followers: z.number().int().min(0).optional(),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  request_id: z.string().min(1).max(128).optional(),
  exclude_profile_urls: z.array(z.string()).optional(),
  strict_location_matching: z.boolean().optional().default(false),
});

export async function handlePipelineStart(req: any, res: any): Promise<void> {
  const requestId = req.body?.request_id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const logger = req.logger?.child({ component: 'orchestrator', request_id: requestId }) ?? createLogger({ component: 'orchestrator', request_id: requestId });

  const validationResult = pipelineStartSchema.safeParse(req.body);
  if (!validationResult.success) {
    const errors = validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: errors, request_id: requestId });
    return;
  }

  const apiKey = apiKeyFromReq(req);
  const data = validationResult.data;

  if (data.min_followers !== undefined && data.max_followers !== undefined && data.min_followers > data.max_followers) {
    res.status(400).json({ error: 'INVALID_FOLLOWER_BOUNDS', message: 'min_followers cannot be greater than max_followers.', request_id: requestId });
    return;
  }

  const activeLimit = Math.max(1, Number(process.env.MAX_ACTIVE_JOBS_PER_KEY || '3'));
  const active = await countActiveJobsForKey(apiKey.id);
  if (active >= activeLimit) {
    res.status(429).json({ error: 'TOO_MANY_ACTIVE_JOBS', message: `Active job limit reached (${activeLimit}).`, request_id: requestId });
    return;
  }

  // Idempotency
  const idempotencyKey = String(req.header('Idempotency-Key') || '').trim();
  if (idempotencyKey) {
    const redis = getRedis();
    const idemKey = `idem:${apiKey.id}:${idempotencyKey}`;
    const existing = await redis.get(idemKey);
    if (existing) {
      res.status(202).json({ job_id: existing, status: 'accepted', message: 'Idempotent replay', request_id: requestId });
      return;
    }
  }

  const topN = data.top_n;
  const weaviateTopN = data.weaviate_top_n ?? Math.max(topN * 4, 500);
  const llmTopN = data.llm_top_n ?? topN;

  if (weaviateTopN < topN) {
    res.status(400).json({ error: 'INVALID_WEAVIATE_TOP_N', message: 'weaviate_top_n cannot be less than top_n.', request_id: requestId });
    return;
  }
  if (llmTopN > weaviateTopN) {
    res.status(400).json({ error: 'INVALID_LLM_TOP_N', message: 'llm_top_n cannot be greater than weaviate_top_n.', request_id: requestId });
    return;
  }

  const jobId = randomUUID();

  const params = {
    business_description: data.business_description,
    top_n: topN,
    weaviate_top_n: weaviateTopN,
    llm_top_n: llmTopN,
    min_followers: data.min_followers ?? null,
    max_followers: data.max_followers ?? null,
    platform: data.platform ?? null,
    exclude_profile_urls: data.exclude_profile_urls ?? null,
    strict_location_matching: data.strict_location_matching ?? false,
    request_id: requestId,
  };

  logger.info('pipeline_job_create', { job_id: jobId, api_key_id: apiKey.id, top_n: topN, weaviate_top_n: weaviateTopN, llm_top_n: llmTopN });

  await createJob({
    jobId,
    apiKeyId: apiKey.id,
    params,
    meta: { completed_stages: [], current_stage: null },
  });
  await appendEvent(jobId, 'info', 'job_created', { request_id: requestId, api_key_id: apiKey.id });

  const queue = getPipelineQueue();
  await queue.add(
    'pipeline:run',
    { job_id: jobId, api_key_id: apiKey.id, ...params },
    { jobId }
  );

  if (idempotencyKey) {
    const redis = getRedis();
    const idemKey = `idem:${apiKey.id}:${idempotencyKey}`;
    // 24h TTL
    await redis.set(idemKey, jobId, 'EX', 24 * 60 * 60);
  }

  res.status(202).json({ job_id: jobId, status: 'accepted', message: 'Pipeline job accepted', request_id: requestId });
}
