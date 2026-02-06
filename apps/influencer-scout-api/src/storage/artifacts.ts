import { dbQuery } from './db.js';

export type ArtifactKind =
	| 'candidates'
	| 'progressive'
	| 'final'
	| 'remaining'
	| `batch:${number}`
	| 'timing';

export type ArtifactRow = {
	job_id: string;
	kind: string;
	data: any;
	updated_at: string;
};

export async function upsertArtifact(jobId: string, kind: string, data: any): Promise<void> {
	await dbQuery(
		`INSERT INTO pipeline_job_artifacts (job_id, kind, data, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, now())
     ON CONFLICT (job_id, kind)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
		[jobId, kind, JSON.stringify(data)]
	);
}

export async function getArtifact(jobId: string, kind: string): Promise<ArtifactRow | null> {
	const res = await dbQuery<ArtifactRow>(
		`SELECT job_id, kind, data, updated_at
       FROM pipeline_job_artifacts
      WHERE job_id = $1::uuid AND kind = $2`,
		[jobId, kind]
	);
	return res.rows[0] ?? null;
}

export async function listArtifactsForJob(jobId: string): Promise<ArtifactRow[]> {
	const res = await dbQuery<ArtifactRow>(
		`SELECT job_id, kind, data, updated_at
       FROM pipeline_job_artifacts
      WHERE job_id = $1::uuid
      ORDER BY kind ASC`,
		[jobId]
	);
	return res.rows;
}

export async function listBatchArtifacts(jobId: string): Promise<ArtifactRow[]> {
	const res = await dbQuery<ArtifactRow>(
		`SELECT job_id, kind, data, updated_at
       FROM pipeline_job_artifacts
      WHERE job_id = $1::uuid AND kind LIKE 'batch:%'
      ORDER BY kind ASC`,
		[jobId]
	);
	return res.rows;
}

