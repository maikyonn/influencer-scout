/**
 * Internal functions for BrightData collection
 * These can be imported and called directly without HTTP overhead
 * Uses axios for better timeout handling and batch processing
 */

import axios, { AxiosInstance } from 'axios';
import type {
  BrightDataProfile,
  BrightDataTriggerRequest,
  BrightDataProgressResponse,
  BrightDataPlatform,
  BrightDataInstagramProfile,
  BrightDataTikTokProfile,
} from '../types/brightdata.js';
import { isFixtureMode, loadFixture } from './test-mode.js';
import { createLogger } from './logger.js';

const fixtureSnapshots = new Map<string, { urls: string[]; platform: BrightDataPlatform }>();
let fixtureSnapshotCounter = 0;
const logger = createLogger({ component: 'brightdata' });

/**
 * Create a configured axios instance for BrightData API
 * with extended timeouts for long-running operations
 */
function createBrightDataClient(baseUrl: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 600000, // 10 minutes default timeout
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    // Increase max content length for large responses
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

/**
 * Get BrightData API key from environment variables
 */
export function getBrightDataApiKey(): string {
  if (isFixtureMode()) {
    return 'fixture-key';
  }
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error('BRIGHTDATA_API_KEY environment variable is required');
  }
  return apiKey.trim();
}

/**
 * Get BrightData Instagram dataset ID from environment variables
 */
export function getBrightDataInstagramDatasetId(): string {
  const datasetId = process.env.BRIGHTDATA_INSTAGRAM_DATASET_ID || 'gd_l1vikfch901nx3by4';
  return datasetId;
}

/**
 * Get BrightData TikTok dataset ID from environment variables
 */
export function getBrightDataTikTokDatasetId(): string {
  const datasetId = process.env.BRIGHTDATA_TIKTOK_DATASET_ID || 'gd_l1villgoiiidt09ci';
  return datasetId;
}

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): 'instagram' | 'tiktok' | null {
  if (url.includes('instagram.com')) {
    return 'instagram';
  }
  if (url.includes('tiktok.com')) {
    return 'tiktok';
  }
  return null;
}

/**
 * Get BrightData base URL from environment variables
 */
export function getBrightDataBaseUrl(): string {
  return process.env.BRIGHTDATA_BASE_URL || 'https://api.brightdata.com/datasets/v3';
}

/**
 * Get polling interval from environment variables (in seconds)
 */
export function getPollingInterval(): number {
  const interval = process.env.BRIGHTDATA_POLL_INTERVAL;
  return interval ? parseInt(interval, 10) : 10; // Default 10 seconds
}

/**
 * Get maximum wait time from environment variables (in seconds)
 */
export function getMaxWaitTime(): number {
  return 3600; // Default 1 hour max wait
}

/**
 * Trigger BrightData collection
 * Supports both Instagram and TikTok URLs, grouping by platform
 * Uses axios for better timeout handling
 */
export async function triggerCollection(
  urls: string[],
  apiKey: string,
  baseUrl: string
): Promise<{ snapshot_id: string; platform: BrightDataPlatform }[]> {
  if (isFixtureMode()) {
    const snapshots: { snapshot_id: string; platform: BrightDataPlatform }[] = [];
    const instagramUrls: string[] = [];
    const tiktokUrls: string[] = [];

    for (const url of urls) {
      const platform = detectPlatform(url);
      if (platform === 'instagram') instagramUrls.push(url);
      if (platform === 'tiktok') tiktokUrls.push(url);
    }

    if (instagramUrls.length > 0) {
      const snapshotId = `fixture_instagram_${fixtureSnapshotCounter++}`;
      fixtureSnapshots.set(snapshotId, { urls: instagramUrls, platform: 'instagram' });
      snapshots.push({ snapshot_id: snapshotId, platform: 'instagram' });
    }

    if (tiktokUrls.length > 0) {
      const snapshotId = `fixture_tiktok_${fixtureSnapshotCounter++}`;
      fixtureSnapshots.set(snapshotId, { urls: tiktokUrls, platform: 'tiktok' });
      snapshots.push({ snapshot_id: snapshotId, platform: 'tiktok' });
    }

    return snapshots;
  }

  // Group URLs by platform
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

  const snapshots: { snapshot_id: string; platform: BrightDataPlatform }[] = [];
  const client = createBrightDataClient(baseUrl, apiKey);

  // Trigger Instagram collection if there are Instagram URLs
  if (instagramUrls.length > 0) {
    const instagramDatasetId = getBrightDataInstagramDatasetId();
    const instagramPayload: BrightDataTriggerRequest[] = instagramUrls.map((url) => ({ url }));

    try {
      const triggerResponse = await client.post(
        `/trigger?dataset_id=${instagramDatasetId}&include_errors=true`,
        instagramPayload,
        {
          timeout: 120000, // 2 minutes for trigger
        }
      );

      const snapshotId = extractSnapshotId(triggerResponse.data);
      snapshots.push({ snapshot_id: snapshotId, platform: 'instagram' });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data 
          ? JSON.stringify(error.response.data)
          : error.message;
        throw new Error(`BrightData Instagram trigger error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
      }
      throw error;
    }
  }

  // Trigger TikTok collection if there are TikTok URLs
  if (tiktokUrls.length > 0) {
    const tiktokDatasetId = getBrightDataTikTokDatasetId();
    // TikTok requires country field (empty string if not specified)
    const tiktokPayload: BrightDataTriggerRequest[] = tiktokUrls.map((url) => ({
      url,
      country: '',
    }));

    try {
      const triggerResponse = await client.post(
        `/trigger?dataset_id=${tiktokDatasetId}&include_errors=true`,
        tiktokPayload,
        {
          timeout: 120000, // 2 minutes for trigger
        }
      );

      const snapshotId = extractSnapshotId(triggerResponse.data);
      snapshots.push({ snapshot_id: snapshotId, platform: 'tiktok' });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data 
          ? JSON.stringify(error.response.data)
          : error.message;
        throw new Error(`BrightData TikTok trigger error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
      }
      throw error;
    }
  }

  return snapshots;
}

/**
 * Extract snapshot ID from BrightData response
 */
function extractSnapshotId(triggerData: any): string {
  if (typeof triggerData === 'string') {
    return triggerData;
  }
  if (triggerData.snapshot_id) {
    return triggerData.snapshot_id;
  }
  if (triggerData.snapshot) {
    return triggerData.snapshot;
  }
  // Try to find snapshot_id in the response
  const responseStr = JSON.stringify(triggerData);
  throw new Error(`Could not extract snapshot_id from response: ${responseStr}`);
}

/**
 * Check BrightData collection progress
 * Uses axios for better timeout handling
 * API returns: { snapshot_id, dataset_id, status: "running" | "ready" | "failed" }
 */
export async function checkProgress(snapshotId: string, apiKey: string, baseUrl: string): Promise<BrightDataProgressResponse> {
  if (isFixtureMode()) {
    return {
      snapshot_id: snapshotId,
      dataset_id: 'fixture',
      status: 'ready',
      progress: 100,
      total: 100,
      completed: 100,
      failed: 0,
    };
  }

  const client = createBrightDataClient(baseUrl, apiKey);
  
  try {
    const progressResponse = await client.get(`/progress/${snapshotId}`, {
      timeout: 300000, // 5 minutes for progress checks
    });

    const progressData = progressResponse.data;
    
    // Return progress response with proper structure
    // API returns: { snapshot_id, dataset_id, status: "running" | "ready" | "failed" }
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
 * Download BrightData collection results
 * Uses axios for better timeout handling and large response support
 * API endpoint: GET /datasets/v3/snapshot/{snapshot_id}?format=json
 */
export async function downloadResults(snapshotId: string, apiKey: string, baseUrl: string): Promise<BrightDataProfile[]> {
  if (isFixtureMode()) {
    const entry = fixtureSnapshots.get(snapshotId);
    if (!entry) {
      return [];
    }

    if (entry.platform === 'instagram') {
      return buildFixtureInstagramProfiles(entry.urls);
    }
    return buildFixtureTikTokProfiles(entry.urls);
  }

  const client = createBrightDataClient(baseUrl, apiKey);
  
  try {
    // Correct API format: snapshot_id is a path parameter, not query parameter
    // GET /datasets/v3/snapshot/{snapshot_id}?format=json
    logger.debug('brightdata_download_start', { snapshot_id: snapshotId });
    
    const downloadResponse = await client.get(`/snapshot/${snapshotId}`, {
      params: {
        format: 'json', // Query parameter: json, ndjson, jsonl, or csv
      },
      timeout: 600000, // 10 minutes for downloads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const data = downloadResponse.data;
    
    logger.debug('brightdata_download_response', {
      snapshot_id: snapshotId,
      data_type: Array.isArray(data) ? 'array' : typeof data,
    });
    
    // Log sample of raw response structure for debugging
    if (Array.isArray(data) && data.length > 0) {
      const firstProfile = data[0];
      const profileKeys = Object.keys(firstProfile);
      const hasPlatform = 'platform' in firstProfile || 'account' in firstProfile || 'account_id' in firstProfile;
      logger.debug('brightdata_download_sample_keys', {
        snapshot_id: snapshotId,
        key_count: profileKeys.length,
        keys: profileKeys.slice(0, 10),
      });
      logger.debug('brightdata_download_platform_detection', {
        snapshot_id: snapshotId,
        has_platform: 'platform' in firstProfile,
        has_account: 'account' in firstProfile,
        has_account_id: 'account_id' in firstProfile,
      });
      
      // Detect platform from raw response
      if ('account' in firstProfile && 'fbid' in firstProfile) {
        logger.debug('brightdata_download_platform_detected', { snapshot_id: snapshotId, platform: 'instagram' });
      } else if ('account_id' in firstProfile && 'nickname' in firstProfile) {
        logger.debug('brightdata_download_platform_detected', { snapshot_id: snapshotId, platform: 'tiktok' });
      } else if ('platform' in firstProfile) {
        logger.debug('brightdata_download_platform_field_present', {
          snapshot_id: snapshotId,
          platform: (firstProfile as any).platform,
        });
      }
    }
    
    // Handle different response formats
    // API returns the data directly (could be array or single object)
    if (Array.isArray(data)) {
      logger.debug('brightdata_download_array', { snapshot_id: snapshotId, count: data.length });
      return data as BrightDataProfile[];
    }
    
    // If it's a single object (shouldn't happen for Instagram/TikTok, but handle it)
    if (data && typeof data === 'object') {
      // Check if it's wrapped in a data property
      if (data.data && Array.isArray(data.data)) {
        logger.debug('brightdata_download_data_array', { snapshot_id: snapshotId, count: data.data.length });
        return data.data as BrightDataProfile[];
      }
      // Check if it's wrapped in results property
      if (data.results && Array.isArray(data.results)) {
        logger.debug('brightdata_download_results_array', { snapshot_id: snapshotId, count: data.results.length });
        return data.results as BrightDataProfile[];
      }
      // Single object - wrap in array
      logger.debug('brightdata_download_single_object', { snapshot_id: snapshotId });
      return [data] as BrightDataProfile[];
    }
    
    // Fallback: return as-is (should be array)
    logger.debug('brightdata_download_passthrough', { snapshot_id: snapshotId });
    return data as BrightDataProfile[];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data 
        ? JSON.stringify(error.response.data)
        : error.message;
      logger.error('brightdata_download_failed', {
        snapshot_id: snapshotId,
        status: error.response?.status || 'Unknown',
        error: errorMessage,
      });
      throw new Error(`BrightData download error: ${error.response?.status || 'Unknown'} - ${errorMessage}`);
    }
    throw error;
  }
}

function buildFixtureInstagramProfiles(urls: string[]): BrightDataInstagramProfile[] {
  const fallbackProfile: BrightDataInstagramProfile = {
    account: 'fixture_account',
    fbid: 'fixture_fbid',
    id: 'fixture_id',
    followers: 12500,
    posts_count: 12,
    is_business_account: false,
    is_professional_account: true,
    is_verified: false,
    avg_engagement: 0.02,
    external_url: null,
    biography: 'Fixture Instagram profile',
    business_category_name: null,
    category_name: null,
    post_hashtags: null,
    following: 200,
    posts: [],
    profile_image_link: null,
    profile_url: 'https://instagram.com/fixture_account',
    profile_name: 'fixture_account',
    highlights_count: 0,
    highlights: [],
    full_name: 'Fixture Account',
    is_private: false,
    bio_hashtags: null,
    url: 'https://instagram.com/fixture_account',
    is_joined_recently: false,
    has_channel: false,
    partner_id: '',
    business_address: null,
    related_accounts: [],
    email_address: null,
  };

  const base = loadFixture<BrightDataInstagramProfile[]>(
    'brightdata.snapshot.instagram.json',
    [fallbackProfile]
  )[0] ?? fallbackProfile;

  return urls.map((url, index) => {
    const handle = extractHandle(url);
    const profile = structuredClone(base);
    profile.account = handle;
    profile.profile_url = url;
    profile.url = url;
    profile.profile_name = handle;
    profile.full_name = `Example ${handle}`;
    profile.followers = base.followers + index * 1000;
    profile.posts = buildInstagramPosts(handle, index);
    profile.email_address = `${handle}@example.com`;
    return profile;
  });
}

function buildFixtureTikTokProfiles(urls: string[]): BrightDataTikTokProfile[] {
  const fallbackProfile: BrightDataTikTokProfile = {
    account_id: 'fixture_account',
    nickname: 'Fixture Account',
    biography: 'Fixture TikTok profile',
    awg_engagement_rate: 0.01,
    comment_engagement_rate: 0.002,
    like_engagement_rate: 0.008,
    bio_link: null,
    predicted_lang: 'en',
    is_verified: false,
    followers: 15000,
    following: 300,
    likes: 1000,
    videos_count: 5,
    create_time: new Date().toISOString(),
    id: 'fixture_id',
    url: 'https://tiktok.com/@fixture_account',
    profile_pic_url: null,
    like_count: 1000,
    digg_count: 1000,
    is_private: false,
    profile_pic_url_hd: null,
    secu_id: null,
    short_id: null,
    ftc: null,
    relation: null,
    open_favorite: false,
    comment_setting: null,
    duet_setting: null,
    stitch_setting: null,
    is_ad_virtual: false,
    room_id: null,
    is_under_age_18: null,
    top_videos: [],
    signature: null,
    discovery_input: {},
    is_commerce_user: false,
    top_posts_data: [],
  };

  const base = loadFixture<BrightDataTikTokProfile[]>(
    'brightdata.snapshot.tiktok.json',
    [fallbackProfile]
  )[0] ?? fallbackProfile;

  return urls.map((url, index) => {
    const handle = extractHandle(url);
    const profile = structuredClone(base);
    profile.account_id = handle;
    profile.nickname = `Example ${handle}`;
    profile.url = url;
    profile.followers = base.followers + index * 800;
    profile.top_videos = buildTikTokVideos(handle, index);
    profile.top_posts_data = buildTikTokPosts(handle, index);
    profile.biography = `Creator focused on ${handle} content.`;
    return profile;
  });
}

function buildInstagramPosts(handle: string, index: number) {
  const now = Date.now();
  return [
    {
      id: `ig_${handle}_${index}_1`,
      caption: `${handle} post one`,
      datetime: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
      likes: 120 + index,
      comments: 10 + index,
      content_type: 'Photo',
      url: `https://instagram.com/p/${handle}_${index}_1/`,
      image_url: `https://example.com/${handle}/photo1.jpg`,
      is_pinned: false,
    },
    {
      id: `ig_${handle}_${index}_2`,
      caption: `${handle} post two`,
      datetime: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      likes: 90 + index,
      comments: 7 + index,
      content_type: 'Video',
      url: `https://instagram.com/p/${handle}_${index}_2/`,
      video_url: `https://example.com/${handle}/video1.mp4`,
      is_video: true,
      is_pinned: false,
    },
  ];
}

function buildTikTokVideos(handle: string, index: number) {
  const now = Date.now();
  return [
    {
      commentcount: 12 + index,
      cover_image: `https://example.com/${handle}/cover1.jpg`,
      create_date: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
      diggcount: 140 + index,
      favorites_count: 5 + index,
      playcount: 1000 + index * 100,
      share_count: 3 + index,
      video_id: `tt_${handle}_${index}_1`,
      video_url: `https://tiktok.com/@${handle}/video/1`,
    },
  ];
}

function buildTikTokPosts(handle: string, index: number) {
  const now = Date.now();
  return [
    {
      create_time: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
      description: `${handle} tiktok post`,
      hashtags: ['#creator', '#fixture'],
      likes: 200 + index,
      post_id: `tt_post_${handle}_${index}_1`,
      post_type: 'video',
      post_url: `https://tiktok.com/@${handle}/video/1`,
    },
  ];
}

function extractHandle(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? 'fixture_account';
    return last.replace('@', '') || 'fixture_account';
  } catch {
    return url.replace(/^@/, '').trim() || 'fixture_account';
  }
}

/**
 * Wait for collection to complete with polling (supports multiple snapshots)
 * API status values: "running" | "ready" | "failed"
 */
export async function waitForCompletion(
  snapshots: { snapshot_id: string; platform: BrightDataPlatform }[],
  apiKey: string,
  baseUrl: string,
  pollingInterval: number,
  maxWaitTime: number
): Promise<BrightDataProgressResponse[]> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitTime * 1000;
  const progressMap = new Map<string, BrightDataProgressResponse>();
  let pollCount = 0;

  while (true) {
    pollCount++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Check progress for all snapshots
    const allProgress = await Promise.all(
      snapshots.map(async (snapshot) => {
        if (progressMap.has(snapshot.snapshot_id)) {
          const existing = progressMap.get(snapshot.snapshot_id)!;
          // API returns "ready" when done, not "completed"
          if (existing.status === 'ready' || existing.status === 'completed' || existing.status === 'failed') {
            return existing;
          }
        }

        const progress = await checkProgress(snapshot.snapshot_id, apiKey, baseUrl);
        progressMap.set(snapshot.snapshot_id, progress);
        return progress;
      })
    );

    // Log status summary only every 5 polls or on status change
    if (pollCount % 5 === 0 || allProgress.some(p => p.status === 'ready' || p.status === 'failed')) {
      const statusSummary = allProgress.map((p) => `${p.snapshot_id?.substring(0, 8)}...=${p.status}`).join(', ');
      logger.debug('brightdata_poll_status', { elapsed_seconds: elapsedSeconds, status_summary: statusSummary });
    }

    // Check if all ready/completed or any failed
    // API returns "ready" when collection is complete and ready for download
    const ready = allProgress.filter((p) => p.status === 'ready' || p.status === 'completed');
    const failed = allProgress.filter((p) => p.status === 'failed');

    if (failed.length > 0) {
      logger.error('brightdata_collection_failed', { failed_count: failed.length });
      throw new Error(
        `BrightData collection failed for ${failed.length} snapshot(s): ${failed.map((f) => f.message || f.snapshot_id || 'Unknown error').join(', ')}`
      );
    }

    if (ready.length === snapshots.length) {
      logger.info('brightdata_collection_complete', { snapshot_count: snapshots.length, elapsed_seconds: elapsedSeconds });
      return allProgress;
    }

    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      const statuses = allProgress.map((p) => `${p.snapshot_id?.substring(0, 8)}...=${p.status}`).join(', ');
      throw new Error(`Timeout waiting for collection to complete after ${maxWaitTime}s. Statuses: ${statuses}`);
    }

    // Wait before next poll
    logger.debug('brightdata_poll_wait', { polling_interval: pollingInterval });
    await new Promise((resolve) => setTimeout(resolve, pollingInterval * 1000));
  }
}
