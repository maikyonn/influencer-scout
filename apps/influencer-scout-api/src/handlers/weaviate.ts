import type { Request, Response } from 'express';
import { z } from 'zod';
import { performParallelHybridSearches } from '../utils/weaviate-search.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'weaviate-endpoint' });

const schema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(2000).optional().default(200),
  min_followers: z.number().int().min(0).optional(),
  max_followers: z.number().int().min(0).optional(),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  exclude_profile_urls: z.array(z.string()).optional(),
  alphas: z.array(z.number().min(0).max(1)).optional(),
});

function extractCandidates(results: any[], topN: number, platform?: string | null) {
  const candidates: any[] = [];
  for (const result of results) {
    if (candidates.length >= topN) break;
    const profileUrl = result.data?.profile_url || result.profile_url || result.url;
    const profilePlatform = result.data?.platform || result.platform;
    if (platform && profilePlatform && String(profilePlatform).toLowerCase() !== String(platform).toLowerCase()) {
      continue;
    }
    if (profileUrl && (String(profileUrl).includes('instagram.com') || String(profileUrl).includes('tiktok.com'))) {
      candidates.push({
        id: result.id || result.uuid || '',
        score: result.score || result.metadata?.score,
        distance: result.distance || result.metadata?.distance,
        profile_url: profileUrl,
        platform: profilePlatform,
        display_name: result.data?.display_name,
        biography: result.data?.biography,
        followers: typeof result.data?.followers === 'number' ? result.data.followers : undefined,
      });
    }
  }
  return candidates;
}

export async function handleWeaviateSearch(req: Request, res: Response) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({ error: 'VALIDATION_ERROR', details: errors });
    return;
  }
  const input = parsed.data;

  if (input.min_followers !== undefined && input.max_followers !== undefined && input.min_followers > input.max_followers) {
    res.status(400).json({ error: 'INVALID_FOLLOWER_BOUNDS', message: 'min_followers cannot be greater than max_followers.' });
    return;
  }

  const alphas = (input.alphas && input.alphas.length ? input.alphas : [0.2, 0.5, 0.8]).slice(0, 5);
  logger.info('weaviate_search_request', { top_k: input.top_k, platform: input.platform ?? null, alphas_count: alphas.length });

  const result = await performParallelHybridSearches(
    [input.query],
    alphas,
    input.top_k,
    input.min_followers ?? null,
    input.max_followers ?? null,
    input.platform ?? null,
    undefined,
    undefined,
    input.exclude_profile_urls ?? null
  );

  const candidates = extractCandidates(result.deduplicatedResults, input.top_k, input.platform ?? null);
  res.json({
    query: input.query,
    candidates,
    meta: {
      total_runtime_ms: result.totalRuntimeMs,
      queries_executed: result.queriesExecuted,
      deduplicated_count: result.deduplicatedResults.length,
    },
  });
}

