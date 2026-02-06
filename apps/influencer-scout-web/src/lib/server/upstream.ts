import { getInfluencerScoutConfig } from './config';

export type UpstreamResponse<T> = {
  status: number;
  ok: boolean;
  data: T;
};

export async function callInfluencerScout<T>(
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<UpstreamResponse<T>> {
  const { baseUrl, apiKey } = getInfluencerScoutConfig();
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(init.headers);
  headers.set('X-API-Key', apiKey);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetchImpl(url, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json') || contentType.includes('text/json');

  let data: any = null;
  try {
    data = isJson ? await res.json() : await res.text();
  } catch {
    data = isJson ? null : '';
  }

  return { status: res.status, ok: res.ok, data };
}

