import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { callInfluencerScout } from '$lib/server/upstream';

const schema = z.object({
  business_description: z.string().min(1),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  // Hard cap the web demo to 10 results for cost + latency.
  top_n: z.number().int().min(1).max(10).optional().default(10),
});

export const POST: RequestHandler = async ({ request, fetch }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'VALIDATION_ERROR', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 }
    );
  }

  // Force 10 regardless of client input.
  const upstreamBody = { ...parsed.data, top_n: 10 };

  try {
    const upstream = await callInfluencerScout<any>(fetch, '/pipeline/start', {
      method: 'POST',
      json: upstreamBody,
    });
    return json(upstream.data, { status: upstream.status });
  } catch {
    return json({ error: 'UPSTREAM_UNAVAILABLE' }, { status: 502 });
  }
};
