import { env } from '$env/dynamic/private';

export type InfluencerScoutConfig = {
  baseUrl: string;
  apiKey: string;
};

export function getInfluencerScoutConfig(): InfluencerScoutConfig {
  const baseUrl = (env.INFLUENCER_SCOUT_BASE_URL || 'https://api.penni-ai.com').trim().replace(/\/+$/, '');
  const apiKey = (env.INFLUENCER_SCOUT_API_KEY || '').trim();

  if (!apiKey) {
    // Do not leak details about expected env var names in client responses;
    // server routes can catch this and throw a generic 500.
    throw new Error('Missing INFLUENCER_SCOUT_API_KEY');
  }

  return { baseUrl, apiKey };
}

