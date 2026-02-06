/**
 * Job tracking implementation backed by Postgres (no GCP dependencies).
 * This module mirrors the old Firestore-tracker surface used by worker code.
 */

import type { BrightDataUnifiedProfile } from '../types/brightdata.js';
import { getJob, updateJob } from '../storage/jobs.js';
import { upsertArtifact, listBatchArtifacts } from '../storage/artifacts.js';
import { appendEvent } from '../storage/events.js';

export type PipelineJobStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
export type StageStatus = 'pending' | 'running' | 'completed' | 'error';
export type PipelineStage = 'query_expansion' | 'weaviate_search' | 'brightdata_collection' | 'llm_analysis';

async function patchMeta(jobId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const job = await getJob(jobId);
  const meta = (job?.meta && typeof job.meta === 'object') ? (job.meta as any) : {};
  const merged = { ...meta, ...patch };
  await updateJob(jobId, { meta: merged });
  return merged;
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) return false;
  return job.status === 'cancelled' || job.cancel_requested === true;
}

export async function cancelPipelineJob(jobId: string): Promise<void> {
  await updateJob(jobId, { status: 'cancelled', cancel_requested: true, finished_at: new Date().toISOString(), progress: 100 });
  await appendEvent(jobId, 'info', 'job_cancelled', {});
}

export async function updatePipelineJobStatus(jobId: string, status: PipelineJobStatus, errorMessage?: string | null): Promise<void> {
  const patch: any = { status };
  if (status === 'running') patch.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'error' || status === 'cancelled') patch.finished_at = new Date().toISOString();
  if (status === 'completed' || status === 'cancelled') patch.progress = 100;
  if (status === 'error' && errorMessage) patch.error = { message: errorMessage };
  await updateJob(jobId, patch);
  await appendEvent(jobId, status === 'error' ? 'error' : 'info', 'job_status', { status, error_message: errorMessage ?? null });
}

export async function updatePipelineStage(jobId: string, stage: PipelineStage, overallProgress?: number): Promise<void> {
  await updateJob(jobId, { current_stage: stage, progress: typeof overallProgress === 'number' ? Math.max(0, Math.min(100, Math.floor(overallProgress))) : undefined });
  await appendEvent(jobId, 'info', 'stage_start', { stage, overall_progress: overallProgress ?? null });
  await patchMeta(jobId, { current_stage: stage });
}

export async function completeStage(jobId: string, stage: PipelineStage): Promise<void> {
  const job = await getJob(jobId);
  const meta = (job?.meta && typeof job.meta === 'object') ? (job.meta as any) : {};
  const completed = Array.isArray(meta.completed_stages) ? meta.completed_stages : [];
  const next = completed.includes(stage) ? completed : [...completed, stage];
  await patchMeta(jobId, { completed_stages: next });
  await appendEvent(jobId, 'info', 'stage_complete', { stage });
}

export async function updateQueryExpansionStage(jobId: string, status: StageStatus, queries?: string[] | null, error?: string | null, prompt?: string | null): Promise<void> {
  await patchMeta(jobId, { query_expansion: { status, queries: queries ?? undefined, error: error ?? null, prompt: prompt ?? undefined, updated_at: Date.now() } });
  await appendEvent(jobId, status === 'error' ? 'error' : 'info', 'query_expansion', { status, queries_count: queries?.length ?? 0, error: error ?? null });
}

export async function updateWeaviateSearchStage(
  jobId: string,
  status: StageStatus,
  totalResults?: number,
  deduplicatedResults?: number,
  queriesExecuted?: number,
  candidatesCountOrError?: number | string | null,
  errorMaybe?: string | null
): Promise<void> {
  // Back-compat with legacy call sites:
  // - completed: (jobId, status, total, dedup, queriesExecuted)
  // - error: (jobId, status, total?, dedup?, queriesExecuted, errorMsg)
  const candidatesCount = typeof candidatesCountOrError === 'number' ? candidatesCountOrError : undefined;
  const errMsg =
    status === 'error'
      ? (typeof candidatesCountOrError === 'string' ? candidatesCountOrError : errorMaybe ?? null)
      : (typeof errorMaybe === 'string' ? errorMaybe : null);

  await patchMeta(jobId, {
    weaviate_search: {
      status,
      total_results: totalResults,
      deduplicated_results: deduplicatedResults,
      queries_executed: queriesExecuted,
      candidates_count: candidatesCount,
      error: errMsg ?? null,
      updated_at: Date.now(),
    },
  });
  await appendEvent(jobId, status === 'error' ? 'error' : 'info', 'weaviate_search', {
    status,
    totalResults,
    deduplicatedResults,
    queriesExecuted,
    candidatesCount,
    error: errMsg ?? null,
  });
}

export async function updateBrightDataStage(
  jobId: string,
  status: StageStatus,
  profilesRequested?: number,
  profilesCollected?: number,
  error?: string | null,
  cacheHits?: number,
  apiCalls?: number
): Promise<void> {
  await patchMeta(jobId, {
    brightdata_collection: {
      status,
      profiles_requested: profilesRequested,
      profiles_collected: profilesCollected,
      cache_hits: cacheHits,
      api_calls: apiCalls,
      error: error ?? null,
      updated_at: Date.now(),
    },
  });
  await appendEvent(jobId, status === 'error' ? 'error' : 'info', 'brightdata_collection', { status, profilesRequested, profilesCollected, cacheHits, apiCalls, error: error ?? null });
}

export async function updateLLMAnalysisStage(jobId: string, status: StageStatus, profilesAnalyzed?: number, error?: string | null): Promise<void> {
  await patchMeta(jobId, { llm_analysis: { status, profiles_analyzed: profilesAnalyzed, error: error ?? null, updated_at: Date.now() } });
  await appendEvent(jobId, status === 'error' ? 'error' : 'info', 'llm_analysis', { status, profilesAnalyzed, error: error ?? null });
}

export async function updateProgress(jobId: string, stage: PipelineStage | null, subStage?: string | null): Promise<void> {
  if (stage === null) return;
  let pct: number | null = null;
  if (stage === 'query_expansion') pct = 10;
  if (stage === 'weaviate_search') {
    if (subStage === 'embedding_generation') pct = 20;
    else pct = 50;
  }
  if (stage === 'brightdata_collection') pct = 80;
  if (stage === 'llm_analysis') pct = 90;
  if (pct === null) return;
  await updateJob(jobId, { progress: Math.max(0, Math.min(100, Math.floor(pct))) });
}

export async function finalizePipelineProgress(jobId: string): Promise<void> {
  await updateJob(jobId, { progress: 100 });
}

export async function updateBatchCounters(jobId: string, batchesCompleted: number, batchesProcessing: number, batchesFailed: number, totalBatches: number): Promise<void> {
  await patchMeta(jobId, {
    batch_counters: {
      batches_completed: batchesCompleted,
      batches_processing: batchesProcessing,
      batches_failed: batchesFailed,
      total_batches: totalBatches,
      updated_at: Date.now(),
    },
  });
}

export async function appendBatchResults(
  jobId: string,
  batchIndex: number,
  profiles: Array<BrightDataUnifiedProfile & { fit_score?: number; fit_rationale?: string; fit_summary?: string }>
): Promise<void> {
  await upsertArtifact(jobId, `batch:${batchIndex}`, { profiles });
}

export async function mergeBatchResults(
  jobId: string
): Promise<Array<BrightDataUnifiedProfile & { fit_score?: number; fit_rationale?: string; fit_summary?: string }>> {
  const batches = await listBatchArtifacts(jobId);
  const merged: Array<BrightDataUnifiedProfile & { fit_score?: number; fit_rationale?: string; fit_summary?: string }> = [];
  for (const b of batches) {
    const arr = (b.data as any)?.profiles;
    if (Array.isArray(arr)) merged.push(...arr);
  }
  return merged;
}

export async function updateProgressiveTopN(jobId: string, batchesCompleted: number, topN: number): Promise<void> {
  const merged = await mergeBatchResults(jobId);
  merged.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));
  const top = merged.slice(0, topN);
  await upsertArtifact(jobId, 'progressive', { profiles: top, batches_completed: batchesCompleted, is_complete: false });
  await patchMeta(jobId, {
    progressive_profiles_count: top.length,
    progressive_profiles_revision: batchesCompleted,
  });
}

export async function finalizeProgressiveResults(jobId: string): Promise<void> {
  // Mark progressive complete while keeping last computed topN if present.
  // If missing, compute a best-effort progressive set from all batches.
  try {
    // Lazy import to avoid circular deps.
    const { getArtifact } = await import('../storage/artifacts.js');
    const current = await getArtifact(jobId, 'progressive');
    if (current?.data && typeof current.data === 'object') {
      await upsertArtifact(jobId, 'progressive', { ...(current.data as any), is_complete: true });
      return;
    }
  } catch {
    // ignore and compute fallback
  }
  const fallback = await mergeBatchResults(jobId);
  await upsertArtifact(jobId, 'progressive', { profiles: fallback, is_complete: true });
}

export async function saveWeaviateCandidates(
  jobId: string,
  candidates: Array<{
    id: string;
    score?: number;
    distance?: number;
    profile_url: string;
    platform?: string;
    display_name?: string;
    biography?: string;
    followers?: number;
  }>
): Promise<void> {
  await upsertArtifact(jobId, 'candidates', { candidates });
  // Store in both top-level convenience and stage meta for backwards compatibility with the web app.
  const job = await getJob(jobId);
  const meta = (job?.meta && typeof job.meta === 'object') ? (job.meta as any) : {};
  const weaviateMeta = (meta.weaviate_search && typeof meta.weaviate_search === 'object') ? meta.weaviate_search : {};
  await patchMeta(jobId, {
    candidates_count: candidates.length,
    weaviate_search: { ...weaviateMeta, candidates_count: candidates.length },
  });
}

export async function storeRemainingProfiles(jobId: string, remainingProfiles: any[]): Promise<string> {
  await upsertArtifact(jobId, 'remaining', { profiles: remainingProfiles });
  return 'remaining';
}

export async function storePipelineResults(
  jobId: string,
  profiles: Array<BrightDataUnifiedProfile & { fit_score?: number; fit_rationale?: string; fit_summary?: string }>,
  pipelineStats?: Record<string, unknown>
): Promise<void> {
  await upsertArtifact(jobId, 'final', { profiles, pipeline_stats: pipelineStats ?? {} });
  await patchMeta(jobId, { profiles_count: profiles.length, pipeline_stats: pipelineStats ?? {} });
}

export async function updateProgressiveTopNMeta(jobId: string, count: number): Promise<void> {
  await patchMeta(jobId, { progressive_profiles_count: count });
}
