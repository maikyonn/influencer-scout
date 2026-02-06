import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { callInfluencerScout } from '$lib/server/upstream';

const schema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(10).optional().default(10),
  platform: z.enum(['instagram', 'tiktok']).optional(),
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
  const upstreamBody = { ...parsed.data, top_k: 10 };

  try {
    const upstream = await callInfluencerScout<any>(fetch, '/weaviate/search', {
      method: 'POST',
      json: upstreamBody,
    });
    return json(upstream.data, { status: upstream.status });
  } catch {
    return json({ error: 'UPSTREAM_UNAVAILABLE' }, { status: 502 });
  }
};
