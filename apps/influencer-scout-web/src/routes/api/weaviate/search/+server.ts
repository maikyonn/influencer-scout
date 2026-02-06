import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { callInfluencerScout } from '$lib/server/upstream';

const schema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(10).optional().default(10),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  min_followers: z.number().int().min(0).optional().nullable(),
  max_followers: z.number().int().min(0).optional().nullable(),
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

  if (
    parsed.data.min_followers != null &&
    parsed.data.max_followers != null &&
    parsed.data.min_followers > parsed.data.max_followers
  ) {
    return json({ error: 'INVALID_FOLLOWER_BOUNDS' }, { status: 400 });
  }

  try {
    const upstream = await callInfluencerScout<any>(fetch, '/weaviate/search', {
      method: 'POST',
      json: parsed.data,
    });
    return json(upstream.data, { status: upstream.status });
  } catch {
    return json({ error: 'UPSTREAM_UNAVAILABLE' }, { status: 502 });
  }
};

