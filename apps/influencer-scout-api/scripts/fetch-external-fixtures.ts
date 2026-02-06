/**
 * Fetch a small sample of external API payloads (Weaviate + BrightData) and write
 * sanitized fixtures under test/fixtures/external.
 *
 * IMPORTANT:
 * - Requires a valid services/pipeline-service/.env with WEAVIATE_* and BRIGHTDATA_* keys.
 * - Writes only SANITIZED data (no API keys, no real usernames/emails).
 * - Intended for understanding payload structure + creating realistic test fixtures.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import weaviate from 'weaviate-client';

import {
  getBrightDataApiKey,
  getBrightDataBaseUrl,
  triggerCollection,
  checkProgress,
  downloadResults,
} from '../dist/utils/brightdata-internal.js';
import { performSingleHybridSearch } from '../dist/utils/weaviate-search.js';

import { loadEnvFile, sanitizeForFixture } from './fixture-utils.ts';

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json + '\n', 'utf8');
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serviceRoot = path.resolve(here, '..');

  await loadEnvFile(path.join(serviceRoot, '.env'));

  const fixturesDir = path.join(serviceRoot, 'test', 'fixtures', 'external');
  await fs.mkdir(fixturesDir, { recursive: true });

  // --- Weaviate: schema + raw object samples ---
  const weaviateUrl = process.env.WEAVIATE_URL;
  const weaviateApiKey = process.env.WEAVIATE_API_KEY;
  const collectionName = process.env.WEAVIATE_COLLECTION_NAME || 'influencer_profiles';

  if (!weaviateUrl || !weaviateApiKey) {
    throw new Error('Missing WEAVIATE_URL / WEAVIATE_API_KEY in environment (.env)');
  }

  const weaviateClient = await weaviate.connectToWeaviateCloud(weaviateUrl, {
    authCredentials: new weaviate.ApiKey(weaviateApiKey),
    timeout: {
      init: 120_000,
      insert: 120_000,
      query: 120_000,
    },
  });

  const collection = weaviateClient.collections.get(collectionName);
  const exists = await collection.exists();
  if (!exists) {
    throw new Error(`Weaviate collection "${collectionName}" does not exist`);
  }

  const config = await collection.config.get();
  await writeJson(path.join(fixturesDir, 'weaviate.collection.config.json'), sanitizeForFixture(config));

  const objects = await collection.query.fetchObjects({ limit: 3, returnMetadata: 'all' });
  await writeJson(path.join(fixturesDir, 'weaviate.objects.fetchObjects.json'), sanitizeForFixture(objects));

  // --- Weaviate: one realistic hybrid search payload (as used by pipeline) ---
  // This uses DeepInfra embeddings (requires DEEPINFRA_API_KEY).
  try {
    const hybrid = await performSingleHybridSearch('coffee', 0.2, 5, null, null, null, undefined, null);
    await writeJson(path.join(fixturesDir, 'weaviate.hybrid.sample.json'), sanitizeForFixture(hybrid));
  } catch (err) {
    // Hybrid fixture is optional; schema + fetchObjects are enough for structure.
    await writeJson(path.join(fixturesDir, 'weaviate.hybrid.sample.error.json'), {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // --- BrightData: trigger + progress + snapshot download ---
  const apiKey = getBrightDataApiKey();
  const baseUrl = getBrightDataBaseUrl();

  // Try to pick 1 IG + 1 TikTok URL from Weaviate samples; otherwise fallback to user-provided env vars.
  const fetchedObjects = (objects as any).objects || [];
  let instagramUrl: string | null = null;
  let tiktokUrl: string | null = null;
  for (const obj of fetchedObjects) {
    const profileUrl = obj?.properties?.profile_url;
    if (typeof profileUrl !== 'string') continue;
    if (!instagramUrl && profileUrl.includes('instagram.com')) instagramUrl = profileUrl;
    if (!tiktokUrl && profileUrl.includes('tiktok.com')) tiktokUrl = profileUrl;
    if (instagramUrl && tiktokUrl) break;
  }

  // Fallback: fetch one object per platform if not present in the initial sample.
  if (!instagramUrl) {
    try {
      const ig = await collection.query.fetchObjects({
        limit: 1,
        returnProperties: ['profile_url', 'platform'] as any,
        filters: collection.filter.byProperty('platform' as any).equal('instagram') as any,
      });
      const url = ig.objects?.[0]?.properties?.profile_url;
      if (typeof url === 'string' && url.includes('instagram.com')) instagramUrl = url;
    } catch {
      // Ignore and proceed with whatever we have.
    }
  }

  if (!tiktokUrl) {
    try {
      const tk = await collection.query.fetchObjects({
        limit: 1,
        returnProperties: ['profile_url', 'platform'] as any,
        filters: collection.filter.byProperty('platform' as any).equal('tiktok') as any,
      });
      const url = tk.objects?.[0]?.properties?.profile_url;
      if (typeof url === 'string' && url.includes('tiktok.com')) tiktokUrl = url;
    } catch {
      // Ignore and proceed with whatever we have.
    }
  }

  // Optional overrides for deterministic fixture generation.
  if (process.env.FIXTURE_INSTAGRAM_URL && process.env.FIXTURE_INSTAGRAM_URL.trim()) {
    instagramUrl = process.env.FIXTURE_INSTAGRAM_URL.trim();
  }
  if (process.env.FIXTURE_TIKTOK_URL && process.env.FIXTURE_TIKTOK_URL.trim()) {
    tiktokUrl = process.env.FIXTURE_TIKTOK_URL.trim();
  }

  const urls: string[] = [instagramUrl, tiktokUrl].filter((u): u is string => typeof u === 'string' && u.length > 0);

  if (urls.length === 0) {
    throw new Error('Could not find any profile_url values in Weaviate sample objects to use for BrightData');
  }

  const triggerResponse = await triggerCollection(urls, apiKey, baseUrl);
  await writeJson(path.join(fixturesDir, 'brightdata.trigger.response.json'), sanitizeForFixture(triggerResponse));

  const snapshots = triggerResponse;
  const downloaded: Record<string, unknown> = {};

  for (const snap of snapshots) {
    const snapshotId = snap.snapshot_id;
    const platform = snap.platform;

    const start = Date.now();
    const maxWaitMs = 10 * 60 * 1000;

    // Poll until ready
    let lastProgress: any = null;
    while (Date.now() - start < maxWaitMs) {
      const progress = await checkProgress(snapshotId, apiKey, baseUrl);
      lastProgress = progress;
      if (progress.status === 'ready' || progress.status === 'completed') break;
      if (progress.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    await writeJson(
      path.join(fixturesDir, `brightdata.progress.${platform}.${snapshotId}.json`),
      sanitizeForFixture(lastProgress)
    );

    if (!lastProgress || (lastProgress.status !== 'ready' && lastProgress.status !== 'completed')) {
      continue;
    }

    const rows = await downloadResults(snapshotId, apiKey, baseUrl);
    // Keep just a couple rows to limit fixture size.
    downloaded[platform] = (rows as any[]).slice(0, 2);

    await writeJson(
      path.join(fixturesDir, `brightdata.snapshot.${platform}.json`),
      sanitizeForFixture((rows as any[]).slice(0, 2))
    );
  }

  // A combined file is handy for quickly browsing shapes.
  await writeJson(path.join(fixturesDir, 'brightdata.snapshot.combined.json'), sanitizeForFixture(downloaded));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
