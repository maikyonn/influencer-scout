import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getApiKeyByHash } from '../storage/api-keys.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'api-auth' });

export type AuthedApiKey = {
  id: number;
  name: string;
  rate_rps: number;
  burst: number;
  monthly_quota: number | null;
};

function hashKey(plain: string): string {
  const pepper = process.env.API_KEY_PEPPER || '';
  if (!pepper) {
    // Still works, but weaker than intended.
    logger.warn('api_key_pepper_missing');
  }
  return createHash('sha256').update(`${pepper}:${plain}`).digest('hex');
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const raw = req.header('X-API-Key');
  if (!raw) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing X-API-Key' });
    return;
  }
  const keyHash = hashKey(raw.trim());
  const row = await getApiKeyByHash(keyHash);
  if (!row) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid API key' });
    return;
  }
  (req as any).apiKey = {
    id: row.id,
    name: row.name,
    rate_rps: row.rate_rps,
    burst: row.burst,
    monthly_quota: row.monthly_quota,
  } satisfies AuthedApiKey;
  next();
}

export function apiKeyFromReq(req: Request): AuthedApiKey {
  const k = (req as any).apiKey as AuthedApiKey | undefined;
  if (!k) throw new Error('API key missing from request context');
  return k;
}

export function hashApiKeyForStorage(plain: string): string {
  return hashKey(plain);
}

