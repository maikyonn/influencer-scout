import { dbQuery } from './db.js';

export async function runCleanup(): Promise<{ jobsDeleted: number; cacheDeleted: number }> {
  const jobRetentionDays = Math.max(1, Number(process.env.JOB_RETENTION_DAYS || '7'));

  const jobsRes = await dbQuery<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM pipeline_jobs
        WHERE created_at < (now() - ($1::text || ' days')::interval)
          AND status IN ('completed','error','cancelled')
        RETURNING 1
     )
     SELECT count(*)::text as count FROM deleted`,
    [String(jobRetentionDays)]
  );

  const cacheRes = await dbQuery<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM brightdata_cache
        WHERE expires_at < now()
        RETURNING 1
     )
     SELECT count(*)::text as count FROM deleted`
  );

  return {
    jobsDeleted: Number(jobsRes.rows[0]?.count ?? '0'),
    cacheDeleted: Number(cacheRes.rows[0]?.count ?? '0'),
  };
}

