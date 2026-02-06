/**
 * Scalable batch processor for BrightData collections
 * Handles large-scale profile collection (1000+ profiles) by:
 * - Splitting into batches of configurable size (default 20)
 * - Processing batches concurrently with configurable concurrency
 * - Efficient parallel polling of all snapshots
 * - Progress tracking and resumability
 */

import axios, { AxiosInstance } from 'axios';
import type {
  BrightDataProfile,
  BrightDataTriggerRequest,
  BrightDataProgressResponse,
  BrightDataPlatform,
} from '../types/brightdata.js';
import {
  getBrightDataApiKey,
  getBrightDataBaseUrl,
} from './brightdata-internal.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'batch-processor' });

/**
 * Get BrightData Instagram dataset ID
 */
function getBrightDataInstagramDatasetId(): string {
  return process.env.BRIGHTDATA_INSTAGRAM_DATASET_ID || 'gd_l1vikfch901nx3by4';
}

/**
 * Get BrightData TikTok dataset ID
 */
function getBrightDataTikTokDatasetId(): string {
  return process.env.BRIGHTDATA_TIKTOK_DATASET_ID || 'gd_l1villgoiiidt09ci';
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): 'instagram' | 'tiktok' | null {
  if (url.includes('instagram.com')) {
    return 'instagram';
  }
  if (url.includes('tiktok.com')) {
    return 'tiktok';
  }
  return null;
}

/**
 * Batch processing configuration
 */
export interface BatchProcessingConfig {
  /** Maximum profiles per batch (BrightData limit, default: 20) */
  batchSize?: number;
  /** Maximum concurrent batches to trigger (default: 10) */
  maxConcurrentBatches?: number;
  /** Polling interval in seconds (default: 10) */
  pollingInterval?: number;
  /** Maximum wait time in seconds (default: 3600 = 1 hour) */
  maxWaitTime?: number;
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  /** All collected profiles */
  profiles: BrightDataProfile[];
  /** Snapshots that were processed */
  snapshots: Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number }>;
  /** Processing statistics */
  stats: {
    total_profiles: number;
    total_batches: number;
    successful_batches: number;
    failed_batches: number;
    total_time_seconds: number;
  };
}

/**
 * Create axios client for BrightData API
 */
function createBrightDataClient(baseUrl: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 600000, // 10 minutes default timeout
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
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
 * Trigger a single batch collection
 */
async function triggerBatch(
  batch: string[],
  platform: BrightDataPlatform,
  apiKey: string,
  baseUrl: string,
  client: AxiosInstance
): Promise<string> {
  const datasetId = platform === 'instagram' 
    ? getBrightDataInstagramDatasetId()
    : getBrightDataTikTokDatasetId();
  
  const payload: BrightDataTriggerRequest[] = platform === 'tiktok'
    ? batch.map((url) => ({ url, country: '' }))
    : batch.map((url) => ({ url }));
  
  try {
    const response = await client.post(
      `/trigger?dataset_id=${datasetId}&include_errors=true`,
      payload,
      { timeout: 120000 } // 2 minutes
    );
    
    // Extract snapshot ID
    const snapshotId = typeof response.data === 'string' 
      ? response.data 
      : response.data.snapshot_id || response.data.snapshot;
    
    if (!snapshotId) {
      throw new Error(`Could not extract snapshot_id from response: ${JSON.stringify(response.data)}`);
    }
    
    return snapshotId;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data 
        ? JSON.stringify(error.response.data)
        : error.message;
      throw new Error(`BrightData ${platform} trigger error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Trigger all batches with controlled concurrency
 */
async function triggerAllBatches(
  batches: Array<{ urls: string[]; platform: BrightDataPlatform; batchIndex: number }>,
  apiKey: string,
  baseUrl: string,
  maxConcurrent: number
): Promise<Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number }>> {
  const client = createBrightDataClient(baseUrl, apiKey);
  const snapshots: Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number }> = [];
  
  // Process batches in chunks with concurrency limit
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const batchChunk = batches.slice(i, i + maxConcurrent);
    
    logger.debug('batch_triggering', {
      start_batch: i + 1,
      end_batch: Math.min(i + maxConcurrent, batches.length),
      total_batches: batches.length,
      concurrency: batchChunk.length,
    });
    
    const chunkResults = await Promise.allSettled(
      batchChunk.map(async (batch) => {
        const snapshotId = await triggerBatch(batch.urls, batch.platform, apiKey, baseUrl, client);
        logger.debug('batch_triggered', {
          batch_index: batch.batchIndex + 1,
          platform: batch.platform,
          snapshot_id: snapshotId.substring(0, 8),
        });
        return { snapshot_id: snapshotId, platform: batch.platform, batch_index: batch.batchIndex };
      })
    );
    
    // Collect successful snapshots
    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
      } else {
        logger.error('batch_trigger_failed', { reason: result.reason });
      }
    }
    
    // Small delay between chunks to avoid rate limiting
    if (i + maxConcurrent < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }
  
  return snapshots;
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
    
    const progressData = response.data;
    return {
      snapshot_id: progressData.snapshot_id || snapshotId,
      dataset_id: progressData.dataset_id,
      status: progressData.status || 'unknown',
      progress: progressData.progress,
      total: progressData.total,
      completed: progressData.completed,
      failed: progressData.failed,
      message: progressData.message,
    };
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
 * Poll all snapshots efficiently with parallel checks
 */
async function pollAllSnapshots(
  snapshots: Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number }>,
  apiKey: string,
  baseUrl: string,
  pollingInterval: number,
  maxWaitTime: number
): Promise<BrightDataProgressResponse[]> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitTime * 1000;
  const progressMap = new Map<string, BrightDataProgressResponse>();
  let pollCount = 0;
  
  logger.info('batch_polling_start', {
    snapshots: snapshots.length,
    polling_interval: pollingInterval,
    max_wait_seconds: maxWaitTime,
  });
  
  while (true) {
    pollCount++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Check all snapshots in parallel (with reasonable concurrency)
    const progressPromises = snapshots.map(async (snapshot) => {
      if (progressMap.has(snapshot.snapshot_id)) {
        const existing = progressMap.get(snapshot.snapshot_id)!;
        if (existing.status === 'ready' || existing.status === 'completed' || existing.status === 'failed') {
          return existing;
        }
      }
      
      return await checkSnapshotProgress(snapshot.snapshot_id, apiKey, baseUrl);
    });
    
    const allProgress = await Promise.all(progressPromises);
    
    // Update progress map
    for (const progress of allProgress) {
      progressMap.set(progress.snapshot_id!, progress);
    }
    
    // Log status summary
    const ready = allProgress.filter(p => p.status === 'ready' || p.status === 'completed');
    const running = allProgress.filter(p => p.status === 'running');
    const failed = allProgress.filter(p => p.status === 'failed');
    
    logger.debug('batch_poll_status', {
      poll_count: pollCount,
      elapsed_seconds: elapsedSeconds,
      ready: ready.length,
      total: snapshots.length,
      running: running.length,
      failed: failed.length,
    });
    
    // Check for failures
    if (failed.length > 0) {
      const failedSnapshots = failed.map(f => f.snapshot_id).join(', ');
      logger.error('batch_poll_failed_snapshots', { failed: failed.length, snapshots: failedSnapshots });
      // Continue processing successful ones, but log failures
    }
    
    // Check if all ready/completed
    if (ready.length === snapshots.length) {
      logger.info('batch_poll_complete', { snapshots: snapshots.length, elapsed_seconds: elapsedSeconds });
      return allProgress;
    }
    
    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      const statuses = allProgress.map(p => `${p.snapshot_id?.substring(0, 8)}...=${p.status}`).join(', ');
      throw new Error(`Timeout waiting for all snapshots after ${maxWaitTime}s. Statuses: ${statuses}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollingInterval * 1000));
  }
}

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
    
    if (Array.isArray(data)) {
      return data as BrightDataProfile[];
    }
    if (data.data && Array.isArray(data.data)) {
      return data.data as BrightDataProfile[];
    }
    if (data.results && Array.isArray(data.results)) {
      return data.results as BrightDataProfile[];
    }
    
    return data as BrightDataProfile[];
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
 * Download all snapshots with controlled concurrency
 */
async function downloadAllSnapshots(
  snapshots: Array<{ snapshot_id: string; platform: BrightDataPlatform; batch_index: number }>,
  apiKey: string,
  baseUrl: string,
  maxConcurrent: number = 5
): Promise<BrightDataProfile[]> {
  const allProfiles: BrightDataProfile[] = [];
  
  // Download in chunks with concurrency limit
  for (let i = 0; i < snapshots.length; i += maxConcurrent) {
    const chunk = snapshots.slice(i, i + maxConcurrent);
    
    logger.debug('batch_download_start', {
      start_batch: i + 1,
      end_batch: Math.min(i + maxConcurrent, snapshots.length),
      total: snapshots.length,
    });
    
    const chunkResults = await Promise.allSettled(
      chunk.map(async (snapshot) => {
        const profiles = await downloadSnapshot(snapshot.snapshot_id, apiKey, baseUrl);
        logger.debug('batch_download_complete', {
          batch_index: snapshot.batch_index + 1,
          platform: snapshot.platform,
          profiles: profiles.length,
        });
        return profiles;
      })
    );
    
    // Collect successful downloads
    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        allProfiles.push(...result.value);
      } else {
        logger.error('batch_download_failed', { reason: result.reason });
      }
    }
    
    // Small delay between chunks
    if (i + maxConcurrent < snapshots.length) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
    }
  }
  
  return allProfiles;
}

/**
 * Process large-scale profile collection with batching
 * 
 * @param urls Array of profile URLs (Instagram and/or TikTok)
 * @param config Batch processing configuration
 * @returns All collected profiles and processing statistics
 */
export async function processBatchedCollection(
  urls: string[],
  config: BatchProcessingConfig = {}
): Promise<BatchProcessingResult> {
  const startTime = Date.now();
  const batchSize = config.batchSize || 20;
  const maxConcurrentBatches = config.maxConcurrentBatches || 10;
  const pollingInterval = config.pollingInterval || 10;
  const maxWaitTime = config.maxWaitTime || 3600;
  
  const apiKey = getBrightDataApiKey();
  const baseUrl = getBrightDataBaseUrl();
  
  logger.info('batch_processing_start', {
    profiles: urls.length,
    batch_size: batchSize,
    max_concurrent_batches: maxConcurrentBatches,
  });
  
  // Step 1: Group URLs by platform and create batches
  const instagramUrls: string[] = [];
  const tiktokUrls: string[] = [];
  
  for (const url of urls) {
    const platform = detectPlatform(url);
    if (platform === 'instagram') {
      instagramUrls.push(url);
    } else if (platform === 'tiktok') {
      tiktokUrls.push(url);
    }
  }
  
  const instagramBatches = createBatches(instagramUrls, batchSize);
  const tiktokBatches = createBatches(tiktokUrls, batchSize);
  
  const allBatches: Array<{ urls: string[]; platform: BrightDataPlatform; batchIndex: number }> = [];
  
  instagramBatches.forEach((batch, index) => {
    allBatches.push({ urls: batch, platform: 'instagram', batchIndex: allBatches.length });
  });
  
  tiktokBatches.forEach((batch, index) => {
    allBatches.push({ urls: batch, platform: 'tiktok', batchIndex: allBatches.length });
  });
  
  logger.info('batch_created', {
    total_batches: allBatches.length,
    instagram_batches: instagramBatches.length,
    tiktok_batches: tiktokBatches.length,
  });
  
  // Step 2: Trigger all batches with controlled concurrency
  const snapshots = await triggerAllBatches(allBatches, apiKey, baseUrl, maxConcurrentBatches);
  
  if (snapshots.length === 0) {
    throw new Error('Failed to trigger any batches');
  }
  
  logger.info('batch_triggered_all', { triggered: snapshots.length, total: allBatches.length });
  
  // Step 3: Poll all snapshots until ready
  const finalProgresses = await pollAllSnapshots(snapshots, apiKey, baseUrl, pollingInterval, maxWaitTime);
  
  // Step 4: Download all snapshots with controlled concurrency
  logger.info('batch_download_results_start', { snapshots: snapshots.length });
  const allProfiles = await downloadAllSnapshots(snapshots, apiKey, baseUrl, maxConcurrentBatches);
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  
  const successfulBatches = finalProgresses.filter(p => p.status === 'ready' || p.status === 'completed').length;
  const failedBatches = finalProgresses.filter(p => p.status === 'failed').length;
  
  logger.info('batch_processing_complete', {
    profiles: allProfiles.length,
    duration_seconds: totalTime,
    successful_batches: successfulBatches,
    failed_batches: failedBatches,
  });
  
  return {
    profiles: allProfiles,
    snapshots: snapshots.map(s => ({
      snapshot_id: s.snapshot_id,
      platform: s.platform,
      batch_index: s.batch_index,
    })),
    stats: {
      total_profiles: allProfiles.length,
      total_batches: allBatches.length,
      successful_batches: successfulBatches,
      failed_batches: failedBatches,
      total_time_seconds: totalTime,
    },
  };
}
