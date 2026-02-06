export type InfluencerScoutClientOptions = {
  baseUrl: string;
  apiKey: string;
};

export function createInfluencerScoutClient(options: InfluencerScoutClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const apiKey = options.apiKey;

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      (err as any).status = res.status;
      (err as any).data = data;
      throw err;
    }
    return data;
  }

  return {
    startPipeline: (body: any, idempotencyKey?: string) =>
      request('/pipeline/start', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),
    getJob: (jobId: string) => request(`/pipeline/jobs/${encodeURIComponent(jobId)}`),
    getResults: (jobId: string) => request(`/pipeline/jobs/${encodeURIComponent(jobId)}/results`),
    weaviateSearch: (body: any) => request('/weaviate/search', { method: 'POST', body: JSON.stringify(body) }),
  };
}

