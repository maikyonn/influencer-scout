import { dbQuery } from './db.js';

export type JobStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export type JobRow = {
	job_id: string;
	api_key_id: number;
	status: JobStatus;
	params: any;
	meta: any;
	progress: number;
	current_stage: string | null;
	error: any | null;
	cancel_requested: boolean;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
};

export async function createJob(options: {
	jobId: string;
	apiKeyId: number;
	params: Record<string, unknown>;
	meta?: Record<string, unknown>;
}): Promise<void> {
	const { jobId, apiKeyId, params, meta } = options;
	await dbQuery(
		`INSERT INTO pipeline_jobs (job_id, api_key_id, status, params, meta)
     VALUES ($1::uuid, $2, 'pending', $3::jsonb, $4::jsonb)`,
		[jobId, apiKeyId, JSON.stringify(params), JSON.stringify(meta ?? {})]
	);
}

export async function getJob(jobId: string): Promise<JobRow | null> {
	const res = await dbQuery<JobRow>(
		`SELECT job_id, api_key_id, status, params, meta, progress, current_stage, error, cancel_requested,
            created_at, started_at, finished_at
       FROM pipeline_jobs
      WHERE job_id = $1::uuid`,
		[jobId]
	);
	return res.rows[0] ?? null;
}

export async function listJobs(options: {
	limit: number;
	offset: number;
	status?: string;
	apiKeyId?: number;
	from?: string;
	to?: string;
}): Promise<JobRow[]> {
	const where: string[] = [];
	const params: any[] = [];
	let idx = 1;
	if (options.status) {
		where.push(`status = $${idx++}`);
		params.push(options.status);
	}
	if (options.apiKeyId) {
		where.push(`api_key_id = $${idx++}`);
		params.push(options.apiKeyId);
	}
	if (options.from) {
		where.push(`created_at >= $${idx++}::timestamptz`);
		params.push(options.from);
	}
	if (options.to) {
		where.push(`created_at <= $${idx++}::timestamptz`);
		params.push(options.to);
	}
	params.push(options.limit);
	params.push(options.offset);
	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const res = await dbQuery<JobRow>(
		`SELECT job_id, api_key_id, status, params, meta, progress, current_stage, error, cancel_requested,
            created_at, started_at, finished_at
       FROM pipeline_jobs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
		params
	);
	return res.rows;
}

export async function updateJob(jobId: string, patch: Partial<Pick<JobRow, 'status' | 'progress' | 'current_stage' | 'error' | 'cancel_requested'>> & {
	started_at?: string | null;
	finished_at?: string | null;
	meta?: any;
}): Promise<void> {
	const sets: string[] = [];
	const params: any[] = [];
	let idx = 1;
	const add = (sql: string, value: any) => {
		sets.push(sql.replace('?', `$${idx++}`));
		params.push(value);
	};
	if (patch.status) add('status = ?', patch.status);
	if (patch.progress !== undefined) add('progress = ?', patch.progress);
	if (patch.current_stage !== undefined) add('current_stage = ?', patch.current_stage);
	if (patch.error !== undefined) add('error = ?::jsonb', patch.error ? JSON.stringify(patch.error) : null);
	if (patch.meta !== undefined) add('meta = ?::jsonb', JSON.stringify(patch.meta ?? {}));
	if (patch.cancel_requested !== undefined) add('cancel_requested = ?', patch.cancel_requested);
	if (patch.started_at !== undefined) add('started_at = ?::timestamptz', patch.started_at);
	if (patch.finished_at !== undefined) add('finished_at = ?::timestamptz', patch.finished_at);
	if (sets.length === 0) return;
	params.push(jobId);
	await dbQuery(`UPDATE pipeline_jobs SET ${sets.join(', ')} WHERE job_id = $${idx}::uuid`, params);
}

export async function countActiveJobsForKey(apiKeyId: number): Promise<number> {
	const res = await dbQuery<{ count: string }>(
		`SELECT count(*)::text as count
       FROM pipeline_jobs
      WHERE api_key_id = $1 AND status IN ('pending','running')`,
		[apiKeyId]
	);
	return Number(res.rows[0]?.count ?? '0');
}
