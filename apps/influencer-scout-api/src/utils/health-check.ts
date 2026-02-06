import { dbPing } from '../storage/db.js';
import { redisPing } from '../queue/redis.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'health-check' });

export type HealthCheckResult = {
  service: string;
  status: 'ok' | 'error' | 'warn';
  message: string;
  details?: Record<string, unknown>;
};

export type HealthSummary = {
  allHealthy: boolean;
  checks: HealthCheckResult[];
  errors: { service: string; message: string }[];
};

async function checkEnv(): Promise<HealthCheckResult> {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (!process.env.WEAVIATE_URL) missing.push('WEAVIATE_URL');
  // LLM + embeddings: we support OpenAI directly, or DeepInfra via its OpenAI-compatible endpoint.
  const hasLlmKey = !!(process.env.OPENAI_API_KEY || process.env.DEEPINFRA_API_KEY);
  if (!hasLlmKey) missing.push('OPENAI_API_KEY|DEEPINFRA_API_KEY');
  const embeddingsProvider = (process.env.EMBEDDINGS_PROVIDER || 'deepinfra').toLowerCase();
  if (embeddingsProvider === 'openai') {
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY (for EMBEDDINGS_PROVIDER=openai)');
  } else {
    if (!process.env.DEEPINFRA_API_KEY) missing.push('DEEPINFRA_API_KEY (for embeddings)');
  }
  if (!process.env.BRIGHTDATA_API_KEY) missing.push('BRIGHTDATA_API_KEY');
  if (!process.env.API_KEY_PEPPER) missing.push('API_KEY_PEPPER');
  if (!process.env.INFLUENCER_SCOUT_ADMIN_KEY_HASH && !process.env.INFLUENCER_SCOUT_ADMIN_KEY) missing.push('INFLUENCER_SCOUT_ADMIN_KEY_HASH');

  if (missing.length) {
    return { service: 'Env', status: 'warn', message: `Missing env: ${missing.join(', ')}` };
  }
  return { service: 'Env', status: 'ok', message: 'Env configured' };
}

async function checkPostgres(): Promise<HealthCheckResult> {
  try {
    await dbPing();
    return { service: 'Postgres', status: 'ok', message: 'Connected' };
  } catch (error) {
    return { service: 'Postgres', status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  try {
    await redisPing();
    return { service: 'Redis', status: 'ok', message: 'Connected' };
  } catch (error) {
    return { service: 'Redis', status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

async function checkWeaviate(): Promise<HealthCheckResult> {
  const url = process.env.WEAVIATE_URL;
  if (!url) return { service: 'Weaviate', status: 'error', message: 'WEAVIATE_URL is not set' };
  try {
    const base = url.replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/meta`, { method: 'GET' });
    if (!res.ok) {
      return { service: 'Weaviate', status: 'error', message: `HTTP ${res.status}` };
    }
    return { service: 'Weaviate', status: 'ok', message: 'Reachable' };
  } catch (error) {
    return { service: 'Weaviate', status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export async function runHealthChecks(): Promise<HealthSummary> {
  logger.info('health_check_run');
  const checks = await Promise.all([checkEnv(), checkPostgres(), checkRedis(), checkWeaviate()]);
  const errors = checks.filter((c) => c.status === 'error').map((c) => ({ service: c.service, message: c.message }));
  const allHealthy = errors.length === 0;
  return { allHealthy, checks, errors };
}
