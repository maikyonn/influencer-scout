import { dbQuery } from './db.js';

export async function recordExternalCall(options: {
	jobId?: string;
	apiKeyId?: number;
	service: string;
	operation: string;
	durationMs?: number;
	status: 'ok' | 'error';
	costUsd?: number;
	meta?: Record<string, unknown>;
}): Promise<void> {
	const { jobId, apiKeyId, service, operation, durationMs, status, costUsd, meta } = options;
	await dbQuery(
		`INSERT INTO external_calls (job_id, api_key_id, service, operation, duration_ms, status, cost_usd, meta)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
		[jobId ?? null, apiKeyId ?? null, service, operation, durationMs ?? null, status, costUsd ?? null, JSON.stringify(meta ?? {})]
	);
}

