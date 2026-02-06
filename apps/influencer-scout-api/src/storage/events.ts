import { dbQuery } from './db.js';

export type EventRow = {
	id: number;
	job_id: string;
	ts: string;
	level: string;
	type: string;
	data: any;
};

export async function appendEvent(jobId: string, level: 'debug' | 'info' | 'warn' | 'error', type: string, data: any = {}): Promise<number> {
	const res = await dbQuery<{ id: number }>(
		`INSERT INTO pipeline_job_events (job_id, level, type, data)
     VALUES ($1::uuid, $2, $3, $4::jsonb)
     RETURNING id`,
		[jobId, level, type, JSON.stringify(data ?? {})]
	);
	return res.rows[0]?.id ?? 0;
}

export async function listEvents(jobId: string, options: { afterId?: number; limit: number }): Promise<EventRow[]> {
	const after = options.afterId ?? 0;
	const res = await dbQuery<EventRow>(
		`SELECT id, job_id, ts, level, type, data
       FROM pipeline_job_events
      WHERE job_id = $1::uuid AND id > $2
      ORDER BY id ASC
      LIMIT $3`,
		[jobId, after, options.limit]
	);
	return res.rows;
}

