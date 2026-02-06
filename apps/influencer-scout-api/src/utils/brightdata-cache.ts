/**
 * BrightData profile cache service (Hetzner-native).
 * Stores raw profile payloads in Postgres to avoid redundant BrightData API calls.
 */

import { createHash } from 'crypto';
import { dbQuery, withDbClient } from '../storage/db.js';
import { createLogger } from './logger.js';
import type {
  BrightDataCacheDoc,
  BrightDataPlatform,
  BrightDataProfile,
  BrightDataInstagramProfile,
  BrightDataTikTokProfile,
} from '../types/brightdata.js';

/** Cache TTL in milliseconds (14 days) */
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const logger = createLogger({ component: 'brightdata-cache' });

/**
 * Normalize a profile URL for consistent cache keys
 * - Lowercase
 * - Remove trailing slash
 * - Standardize domain (www.instagram.com -> instagram.com)
 */
export function normalizeUrlForCache(url: string): string {
  let normalized = url.toLowerCase().trim();
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  normalized = normalized.replace('www.instagram.com', 'instagram.com');
  normalized = normalized.replace('www.tiktok.com', 'tiktok.com');
  return normalized;
}

/**
 * Convert a URL to a stable cache key (sha256 hex).
 */
export function urlToDocId(url: string): string {
  const normalized = normalizeUrlForCache(url);
  return createHash('sha256').update(normalized).digest('hex');
}

export function detectPlatformFromUrl(url: string): BrightDataPlatform {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return 'tiktok';
  return 'instagram';
}

export function extractProfileUrl(profile: BrightDataProfile, platform: BrightDataPlatform): string {
  if (platform === 'instagram') {
    const igProfile = profile as BrightDataInstagramProfile;
    return igProfile.profile_url || igProfile.url || `https://instagram.com/${igProfile.account}/`;
  }
  const tkProfile = profile as BrightDataTikTokProfile;
  return tkProfile.url || `https://tiktok.com/@${tkProfile.account_id}`;
}

export async function getCachedProfile(profileUrl: string): Promise<BrightDataProfile | null> {
  const cacheKey = urlToDocId(profileUrl);
  try {
    const res = await dbQuery<{ raw_data: any }>(
      `SELECT raw_data
         FROM brightdata_cache
        WHERE cache_key = $1 AND expires_at >= now()`,
      [cacheKey]
    );
    return (res.rows[0]?.raw_data as BrightDataProfile) ?? null;
  } catch (error) {
    logger.warn('brightdata_cache_get_failed', { url: profileUrl, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function getCachedProfilesBatch(urls: string[]): Promise<Map<string, BrightDataProfile>> {
  if (urls.length === 0) return new Map();

  const results = new Map<string, BrightDataProfile>();
  const urlToKey = new Map<string, string>();
  const keyToUrl = new Map<string, string>();
  for (const url of urls) {
    const key = urlToDocId(url);
    urlToKey.set(url, key);
    keyToUrl.set(key, url);
  }

  const keys = Array.from(keyToUrl.keys());
  const chunkSize = 500;

  try {
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      const res = await dbQuery<{ cache_key: string; raw_data: any }>(
        `SELECT cache_key, raw_data
           FROM brightdata_cache
          WHERE cache_key = ANY($1) AND expires_at >= now()`,
        [chunk]
      );
      for (const row of res.rows) {
        const originalUrl = keyToUrl.get(row.cache_key);
        if (originalUrl) results.set(originalUrl, row.raw_data as BrightDataProfile);
      }
    }

    logger.debug('brightdata_cache_batch_lookup_complete', {
      requested: urls.length,
      cacheHits: results.size,
      cacheMisses: urls.length - results.size,
    });
  } catch (error) {
    logger.warn('brightdata_cache_batch_lookup_failed', { error: error instanceof Error ? error.message : String(error) });
  }

  return results;
}

export async function setCachedProfile(profileUrl: string, platform: BrightDataPlatform, rawData: BrightDataProfile): Promise<void> {
  const cacheKey = urlToDocId(profileUrl);
  const normalized = normalizeUrlForCache(profileUrl);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  const cacheDoc: BrightDataCacheDoc = {
    profile_url: normalized,
    platform,
    raw_data: rawData,
    cached_at: Date.now(),
    expires_at: Date.now() + CACHE_TTL_MS,
  };

  try {
    await dbQuery(
      `INSERT INTO brightdata_cache (cache_key, normalized_url, platform, raw_data, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (cache_key)
       DO UPDATE SET normalized_url = EXCLUDED.normalized_url,
                     platform = EXCLUDED.platform,
                     raw_data = EXCLUDED.raw_data,
                     cached_at = now(),
                     expires_at = EXCLUDED.expires_at`,
      [cacheKey, normalized, platform, JSON.stringify(cacheDoc.raw_data), expiresAt]
    );
  } catch (error) {
    logger.warn('brightdata_cache_set_failed', { url: profileUrl, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function setCachedProfilesBatch(
  profiles: Array<{ url: string; platform: BrightDataPlatform; data: BrightDataProfile }>
): Promise<void> {
  if (profiles.length === 0) return;

  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  try {
    await withDbClient(async (client) => {
      await client.query('BEGIN');
      try {
        for (const profile of profiles) {
          const cacheKey = urlToDocId(profile.url);
          const normalized = normalizeUrlForCache(profile.url);
          await client.query(
            `INSERT INTO brightdata_cache (cache_key, normalized_url, platform, raw_data, expires_at)
             VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
             ON CONFLICT (cache_key)
             DO UPDATE SET normalized_url = EXCLUDED.normalized_url,
                           platform = EXCLUDED.platform,
                           raw_data = EXCLUDED.raw_data,
                           cached_at = now(),
                           expires_at = EXCLUDED.expires_at`,
            [cacheKey, normalized, profile.platform, JSON.stringify(profile.data), expiresAt]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
    logger.debug('brightdata_cache_batch_write_complete', { profilesCached: profiles.length });
  } catch (error) {
    logger.warn('brightdata_cache_batch_write_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
