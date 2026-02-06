import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { callInfluencerScout } from '$lib/server/upstream';

export const GET: RequestHandler = async ({ params, fetch }) => {
  const jobId = String(params.jobId || '').trim();
  if (!jobId) return json({ error: 'MISSING_JOB_ID' }, { status: 400 });

  try {
    const upstream = await callInfluencerScout<any>(fetch, `/pipeline/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    });
    return json(upstream.data, { status: upstream.status });
  } catch {
    return json({ error: 'UPSTREAM_UNAVAILABLE' }, { status: 502 });
  }
};

