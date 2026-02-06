import { dbQuery } from './db.js';

export type ApiKeyRow = {
  id: number;
  name: string;
  key_hash: string;
  rate_rps: number;
  burst: number;
  monthly_quota: number | null;
  created_at: string;
  revoked_at: string | null;
};

export async function getApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
  const res = await dbQuery<ApiKeyRow>(
    `SELECT id, name, key_hash, rate_rps, burst, monthly_quota, created_at, revoked_at
       FROM api_keys
      WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash]
  );
  return res.rows[0] ?? null;
}

export async function createApiKeyRow(options: {
  name: string;
  keyHash: string;
  rateRps?: number;
  burst?: number;
  monthlyQuota?: number | null;
}): Promise<ApiKeyRow> {
  const { name, keyHash, rateRps, burst, monthlyQuota } = options;
  const res = await dbQuery<ApiKeyRow>(
    `INSERT INTO api_keys (name, key_hash, rate_rps, burst, monthly_quota)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, key_hash, rate_rps, burst, monthly_quota, created_at, revoked_at`,
    [name, keyHash, rateRps ?? 2, burst ?? 10, monthlyQuota ?? null]
  );
  return res.rows[0]!;
}

export async function revokeApiKey(id: number): Promise<void> {
  await dbQuery(`UPDATE api_keys SET revoked_at = now() WHERE id = $1`, [id]);
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const res = await dbQuery<ApiKeyRow>(
    `SELECT id, name, key_hash, rate_rps, burst, monthly_quota, created_at, revoked_at
       FROM api_keys
      ORDER BY created_at DESC`
  );
  return res.rows;
}

