/**
 * Streaming batch processor for BrightData collections
 * Processes batches independently as they complete, enabling incremental results
 */

import axios, { AxiosInstance } from 'axios';
import type {
  BrightDataProfile,
  BrightDataProgressResponse,
  BrightDataPlatform,
} from '../types/brightdata.js';
import {
  getBrightDataApiKey,
  getBrightDataBaseUrl,
  triggerCollection,
} from './brightdata-internal.js';
import {
  getCachedProfilesBatch,
  setCachedProfilesBatch,
  detectPlatformFromUrl,
  extractProfileUrl,
} from './brightdata-cache.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'streaming-batch-processor' });

/**
 * Download results from a single snapshot
 */
async function downloadSnapshot(
  snapshotId: string,
  apiKey: string,
  baseUrl: string
): Promise<BrightDataProfile[]> {
  const client = createBrightDataClient(baseUrl, apiKey);
  
  try {
    const response = await client.get(`/snapshot/${snapshotId}`, {
      params: { format: 'json' },
      timeout: 600000, // 10 minutes
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    const data = response.data;
    
    // Handle different response structures
    let profiles: BrightDataProfile[] = [];
    
    if (Array.isArray(data)) {
      profiles = data as BrightDataProfile[];
    } else if (data && typeof data === 'object') {
      if (data.data && Array.isArray(data.data)) {
        profiles = data.data as BrightDataProfile[];
      } else if (data.results && Array.isArray(data.results)) {
        profiles = data.results as BrightDataProfile[];
      } else if (data.profiles && Array.isArray(data.profiles)) {
        profiles = data.profiles as BrightDataProfile[];
      } else {
        // If data is an object but not an array, log warning and return empty array
        logger.warn('streaming_snapshot_unexpected_structure', {
          hasData: !!data,
          dataType: typeof data,
          dataKeys: data ? Object.keys(data) : [],
        });
        return [];
      }
    } else {
      logger.warn('streaming_snapshot_unexpected_type', { snapshot_id: snapshotId, data_type: typeof data });
      return [];
    }
    
    // Validate that we got an array
    if (!Array.isArray(profiles)) {
      logger.error('streaming_snapshot_profiles_not_array', { snapshot_id: snapshotId, profiles_type: typeof profiles });
      return [];
    }
    
    return profiles;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data 
        ? JSON.stringify(error.response.data)
        : error.message;
      throw new Error(`BrightData download error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Batch processing configuration
 */
export interface StreamingBatchConfig {
  batchSize?: number;
  maxConcurrentBatches?: number;
  pollingInterval?: number;
  maxWaitTime?: number;
}

export type BatchCallback = (result: {
  batchIndex: number;
  platform: BrightDataPlatform;
  profiles: BrightDataProfile[];
}) => Promise<void>;

/**
 * Batch processing callback
 * Called when a batch is completed and processed
 */
export type BatchCompleteCallback = (result: {
  batchIndex: number;
  platform: BrightDataPlatform;
  snapshotId: string;
  profiles: BrightDataProfile[];
  normalizedProfiles: any[];
  analyzedProfiles: any[];
}) => Promise<void>;

/**
 * Create axios client for BrightData API
 */
function createBrightDataClient(baseUrl: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 600000,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): 'instagram' | 'tiktok' | null {
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('tiktok.com')) return 'tiktok';
  return null;
}

/**
 * Split URLs into batches
 */
function createBatches(urls: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Check progress for a single snapshot
 */
async function checkSnapshotProgress(
  snapshotId: string,
  apiKey: string,
  baseUrl: string
): Promise<BrightDataProgressResponse> {
  const client = createBrightDataClient(baseUrl, apiKey);
  
  try {
    const response = await client.get(`/progress/${snapshotId}`, {
      timeout: 300000, // 5 minutes
    });
    
    return response.data as BrightDataProgressResponse;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data 
        ? JSON.stringify(error.response.data)
        : error.message;
      throw new Error(`BrightData progress check error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Process a single batch end-to-end when it becomes ready
 */
async function processBatchAsReady(
  snapshot: { snapshot_id: string; platform: BrightDataPlatform; batch_index: number },
  apiKey: string,
  baseUrl: string,
  onBatchComplete?: BatchCompleteCallback
): Promise<void> {
  const { snapshot_id, platform, batch_index } = snapshot;
  
  try {
    logger.debug('streaming_batch_download_start', {
      batch_index: batch_index + 1,
      platform,
    });
    
    // Download batch
    const profiles = await downloadSnapshot(snapshot_id, apiKey, baseUrl);
    
    // Validate profiles is an array
    if (!Array.isArray(profiles)) {
      throw new Error(`Downloaded profiles is not an array for batch ${batch_index + 1}: ${typeof profiles}`);
    }
    
    logger.debug('streaming_batch_download_complete', {
      batch_index: batch_index + 1,
      platform,
      profiles: profiles.length,
    });

    // Cache the newly downloaded profiles
    if (profiles.length > 0) {
      const profilesToCache = profiles.map(profile => ({
        url: extractProfileUrl(profile, platform),
        platform,
        data: profile,
      }));
      // Cache async without blocking
      setCachedProfilesBatch(profilesToCache).catch(err => {
        logger.warn('streaming_batch_cache_failed', {
          batch_index: batch_index + 1,
          error: err,
        });
      });
    }

    // Call callback with raw profiles (normalization and LLM will happen in callback)
    if (onBatchComplete) {
      await onBatchComplete({
        batchIndex: batch_index,
        platform,
        snapshotId: snapshot_id,
        profiles,
        normalizedProfiles: [], // Will be populated by callback
        analyzedProfiles: [], // Will be populated by callback
      });
    }
    
    logger.debug('streaming_batch_processing_complete', { batch_index: batch_index + 1, platform });
  } catch (error) {
    logger.error('streaming_batch_processing_failed', { batch_index: batch_index + 1, error });
    throw error;
  }
}

/**
 * Stream batch processing - processes batches as they become ready
 * 
 * @param urls Array of profile URLs
 * @param config Batch processing configuration
 * @param onBatchComplete Callback called when each batch is ready and processed
 * @returns Processing statistics
 */
export async function processBatchedCollectionStreaming(
  urls: string[],
  config: StreamingBatchConfig,
  timingTracker?: import('./timing-tracker.js').PipelineTimingTracker,
  onBatchComplete?: BatchCompleteCallback
): Promise<{
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalProfiles: number;
  cacheHits: number;
  skippedBrightData?: boolean;
}> {
  const batchSize = config.batchSize || 20;
  const maxConcurrentBatches = config.maxConcurrentBatches || 20;
  const pollingInterval = config.pollingInterval || 10;
  const maxWaitTime = config.maxWaitTime || 3600;

  const apiKey = getBrightDataApiKey();
  const baseUrl = getBrightDataBaseUrl();

  logger.info('streaming_processing_start', { profiles: urls.length, batch_size: batchSize });

  // Step 0: Check cache for all URLs
  logger.debug('streaming_cache_check_start', { profiles: urls.length });
  const cachedProfiles = await getCachedProfilesBatch(urls);
  const cachedUrls = new Set(cachedProfiles.keys());
  const uncachedUrls = urls.filter(url => !cachedUrls.has(url));

  logger.info('streaming_cache_check_result', {
    cache_hits: cachedProfiles.size,
    cache_misses: uncachedUrls.length,
  });

  let totalProfiles = 0;
  let completedBatches = 0;
  let failedBatches = 0;

  // Process cached profiles immediately via callback
  if (cachedProfiles.size > 0 && onBatchComplete) {
    // Group cached profiles by platform
    const cachedByPlatform = new Map<BrightDataPlatform, BrightDataProfile[]>();

    for (const [url, profile] of cachedProfiles) {
      const platform = detectPlatformFromUrl(url);
      if (!cachedByPlatform.has(platform)) {
        cachedByPlatform.set(platform, []);
      }
      cachedByPlatform.get(platform)!.push(profile);
    }

    // Create synthetic batch results for cached profiles - process in PARALLEL
    const cachedBatchPromises: Promise<void>[] = [];
    let cachedBatchIndex = 0;

    for (const [platform, profiles] of cachedByPlatform) {
      const batchIndex = cachedBatchIndex++;
      cachedBatchPromises.push(
        onBatchComplete({
          batchIndex,
          platform,
          snapshotId: 'cached',
          profiles,
          normalizedProfiles: [],
          analyzedProfiles: [],
        }).then(() => {
          totalProfiles += profiles.length;
          completedBatches++;
        })
      );
    }

    // Wait for all cached batches to complete in parallel
    await Promise.all(cachedBatchPromises);

    logger.info('streaming_cache_processed', { profiles: cachedProfiles.size });
  }

  // If all profiles were cached, return early
  if (uncachedUrls.length === 0) {
    logger.info('streaming_cache_all_served');
    return {
      totalBatches: completedBatches,
      completedBatches,
      failedBatches: 0,
      totalProfiles,
      cacheHits: cachedProfiles.size,
    };
  }

  // Skip BrightData if cache hit rate is >= 50% (we have enough data)
  const cacheHitRate = cachedProfiles.size / urls.length;
  if (cacheHitRate >= 0.5) {
    logger.info('streaming_cache_skip_brightdata', {
      cache_hit_rate: cacheHitRate,
      uncached_profiles: uncachedUrls.length,
    });
    return {
      totalBatches: completedBatches,
      completedBatches,
      failedBatches: 0,
      totalProfiles,
      cacheHits: cachedProfiles.size,
      skippedBrightData: true,
    };
  }

  // Step 1: Group uncached URLs by platform and create batches
  const instagramUrls: string[] = [];
  const tiktokUrls: string[] = [];

  for (const url of uncachedUrls) {
    const platform = detectPlatform(url);
    if (platform === 'instagram') {
      instagramUrls.push(url);
    } else if (platform === 'tiktok') {
      tiktokUrls.push(url);
    }
  }
  
  const instagramBatches = createBatches(instagramUrls, batchSize);
  const tiktokBatches = createBatches(tiktokUrls, batchSize);

  // Track the number of cached batches to offset BrightData batch indices
  const cachedBatchCount = completedBatches;

  const allBatches: Array<{ urls: string[]; platform: BrightDataPlatform; batchIndex: number }> = [];

  // BrightData batch indices start AFTER cached batches to avoid overwriting batch files
  instagramBatches.forEach((batch) => {
    allBatches.push({ urls: batch, platform: 'instagram', batchIndex: cachedBatchCount + allBatches.length });
  });

  tiktokBatches.forEach((batch) => {
    allBatches.push({ urls: batch, platform: 'tiktok', batchIndex: cachedBatchCount + allBatches.length });
  });
  
  logger.info('streaming_batches_created', {
    total_batches: allBatches.length,
    instagram_batches: instagramBatches.length,
    tiktok_batches: tiktokBatches.length,
  });

  // Step 2: Trigger all batches with concurrency control (max 20 at once)
  const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per batch
  const snapshots: Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number; triggered_at: number }> = [];
  const maxTriggerConcurrency = Math.min(maxConcurrentBatches, 20); // Cap at 20 concurrent batches

  if (timingTracker) {
    timingTracker.startSubStage('brightdata_collection', 'batch_triggering');
  }

  // Trigger batches with concurrency control
  for (let i = 0; i < allBatches.length; i += maxTriggerConcurrency) {
    const batchChunk = allBatches.slice(i, i + maxTriggerConcurrency);
    
    logger.debug('streaming_batches_triggering', {
      start_batch: i + 1,
      end_batch: Math.min(i + maxTriggerConcurrency, allBatches.length),
      total_batches: allBatches.length,
      max_concurrent: maxTriggerConcurrency,
    });
    
    const chunkResults = await Promise.allSettled(
      batchChunk.map(async (batch) => {
        const snapshotResults = await triggerCollection(batch.urls, apiKey, baseUrl);
        // Find the snapshot for this batch's platform
        const snapshot = snapshotResults.find(s => s.platform === batch.platform);
        if (!snapshot) {
          throw new Error(`No snapshot returned for ${batch.platform} batch`);
        }
        return { snapshot_id: snapshot.snapshot_id, platform: batch.platform, batch_index: batch.batchIndex, triggered_at: Date.now() };
      })
    );

    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
      } else {
        logger.error('streaming_batch_trigger_failed', { reason: result.reason });
      }
    }
    
    // Wait a bit before triggering next chunk if there are more batches
    if (i + maxTriggerConcurrency < allBatches.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  
  if (snapshots.length === 0) {
    throw new Error('Failed to trigger any batches');
  }
  
  if (timingTracker) {
    timingTracker.endSubStage('brightdata_collection', 'batch_triggering');
  }
  
  logger.info('streaming_batches_triggered', {
    triggered: snapshots.length,
    total: allBatches.length,
  });
  
  // Step 3: Poll and process batches as they become ready
  const startTime = Date.now();
  const maxWaitMs = maxWaitTime * 1000;
  const processedSnapshots = new Set<string>();
  const processingPromises: Promise<void>[] = [];
  
  while (processedSnapshots.size < snapshots.length) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      const remaining = snapshots.filter(s => !processedSnapshots.has(s.snapshot_id));
      logger.error('streaming_batches_timeout', { remaining: remaining.length });
      failedBatches += remaining.length;
      break;
    }
    
    // Check all unprocessed snapshots in parallel
    const checkPromises = snapshots
      .filter(s => !processedSnapshots.has(s.snapshot_id))
      .map(async (snapshot) => {
        try {
          const progress = await checkSnapshotProgress(snapshot.snapshot_id, apiKey, baseUrl);

          if (progress.status === 'ready' || progress.status === 'completed') {
            processedSnapshots.add(snapshot.snapshot_id);

            // Process this batch immediately
            const batchCallback: BatchCompleteCallback | undefined = onBatchComplete ? async (result) => {
              totalProfiles += result.profiles.length;
              completedBatches++;
              await onBatchComplete(result);
            } : undefined;
            const processPromise = processBatchAsReady(snapshot, apiKey, baseUrl, batchCallback).catch((error) => {
              logger.error('streaming_batch_process_failed', { batch_index: snapshot.batch_index + 1, error });
              failedBatches++;
            });

            processingPromises.push(processPromise);
          } else if (progress.status === 'failed') {
            processedSnapshots.add(snapshot.snapshot_id);
            failedBatches++;
            logger.error('streaming_batch_failed', { batch_index: snapshot.batch_index + 1 });
          } else {
            // Check if batch has timed out (5 minutes)
            const batchAge = Date.now() - snapshot.triggered_at;
            if (batchAge >= BATCH_TIMEOUT_MS) {
              processedSnapshots.add(snapshot.snapshot_id);
              failedBatches++;
              logger.error('streaming_batch_timed_out', {
                batch_index: snapshot.batch_index + 1,
                elapsed_seconds: Math.round(batchAge / 1000),
                status: progress.status,
              });
            } else {
              // Log status for debugging stuck batches
              logger.debug('streaming_batch_status', {
                batch_index: snapshot.batch_index + 1,
                status: progress.status,
                elapsed_seconds: Math.round(batchAge / 1000),
              });
            }
          }
        } catch (error) {
          logger.error('streaming_snapshot_check_failed', { snapshot_id: snapshot.snapshot_id, error });
        }
      });
    
    await Promise.all(checkPromises);
    
    // Wait for any in-flight processing to complete
    await Promise.allSettled(processingPromises);
    
    // If not all processed, wait before next poll
    if (processedSnapshots.size < snapshots.length) {
      const ready = snapshots.filter(s => processedSnapshots.has(s.snapshot_id)).length;
      logger.debug('streaming_progress', {
        ready,
        total: snapshots.length,
        polling_interval: pollingInterval,
      });
      await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
    }
  }
  
  // Wait for all processing to complete
  await Promise.allSettled(processingPromises);
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  logger.info('streaming_completed', {
    completed_batches: completedBatches,
    failed_batches: failedBatches,
    total_profiles: totalProfiles,
    duration_seconds: totalTime,
    cache_hits: cachedProfiles.size,
  });

  return {
    totalBatches: snapshots.length + (cachedProfiles.size > 0 ? 1 : 0),
    completedBatches,
    failedBatches,
    totalProfiles,
    cacheHits: cachedProfiles.size,
  };
}
