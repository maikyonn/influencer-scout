import { readFileSync } from 'node:fs';
import path from 'node:path';

let cachedOpenApiYaml: string | null = null;

function loadOpenApiYaml(): string {
  if (cachedOpenApiYaml) return cachedOpenApiYaml;

  const candidates = [
    process.env.OPENAPI_PATH,
    '/app/openapi.yaml',
    path.resolve(process.cwd(), 'openapi.yaml'),
    path.resolve(process.cwd(), 'apps/influencer-scout-api/openapi.yaml'),
    path.resolve(process.cwd(), 'services/influencer-scout-api/openapi.yaml'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const txt = readFileSync(p, 'utf8');
      cachedOpenApiYaml = txt;
      return txt;
    } catch {
      // keep searching
    }
  }

  // Still serve something instead of 500-ing the whole docs page.
  return '# openapi.yaml not found in runtime image\n';
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

export async function handlePublicDocs(_req: any, res: any) {
  res.status(200).type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Influencer Scout API</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system; margin: 0; background: #0b0f14; color: #e7eef7; }
    header { padding: 18px 20px; border-bottom: 1px solid #1b2634; background: #0b0f14; position: sticky; top: 0; }
    h1 { margin: 0; font-size: 16px; letter-spacing: .4px; }
    main { padding: 18px 20px; max-width: 980px; }
    .card { border: 1px solid #1b2634; border-radius: 12px; padding: 14px; background: #0f1620; margin-top: 12px; }
    a { color: #79b8ff; }
    pre { margin: 10px 0 0; padding: 12px; border-radius: 10px; background: #0b0f14; border: 1px solid #1b2634; overflow: auto; }
    code { color: #c9d1d9; }
    .muted { color: #9bb0c5; font-size: 12px; }
    .row { display:flex; gap: 10px; flex-wrap: wrap; }
    .pill { font-size: 12px; padding: 2px 8px; border: 1px solid #1b2634; border-radius: 999px; background: #0b0f14; color: #9bb0c5; }
  </style>
</head>
<body>
  <header>
    <h1>Influencer Scout API</h1>
    <div class="muted">Public, API-keyed pipeline + Weaviate search. Admin dashboard at <a href="/admin">/admin</a>.</div>
  </header>
  <main>
    <div class="row">
      <span class="pill">Base URL: https://api.penni-ai.com</span>
      <span class="pill">Auth: X-API-Key</span>
      <span class="pill">Events: SSE</span>
    </div>

    <div class="card">
      <div><strong>OpenAPI</strong></div>
      <div class="muted">Raw spec: <a href="/openapi.yaml">/openapi.yaml</a></div>
    </div>

    <div class="card">
      <div><strong>Quick Start</strong></div>
      <div class="muted">Examples below keep <code>top_n &lt;= 10</code> to avoid large runs.</div>
      <pre><code>export INFLUENCER_SCOUT_API_KEY="...your key..."

# Health (no auth)
curl -sS https://api.penni-ai.com/health | jq .

# Start a pipeline job (max 10 requested influencers)
curl -sS https://api.penni-ai.com/pipeline/start \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $INFLUENCER_SCOUT_API_KEY" \\
  -d '{
    "business_description": "Find mens streetwear influencers in NYC",
    "top_n": 10,
    "weaviate_top_n": 200,
    "llm_top_n": 10
  }' | jq .

# Poll status
curl -sS https://api.penni-ai.com/pipeline/jobs/&lt;JOB_ID&gt; \\
  -H "X-API-Key: $INFLUENCER_SCOUT_API_KEY" | jq .

# Stream events (SSE)
curl -sS -N https://api.penni-ai.com/pipeline/jobs/&lt;JOB_ID&gt;/events \\
  -H "Accept: text/event-stream" \\
  -H "X-API-Key: $INFLUENCER_SCOUT_API_KEY"

# Get final results (only when completed)
curl -sS https://api.penni-ai.com/pipeline/jobs/&lt;JOB_ID&gt;/results \\
  -H "X-API-Key: $INFLUENCER_SCOUT_API_KEY" | jq .

# API-owned Weaviate search (normalized candidates)
curl -sS https://api.penni-ai.com/weaviate/search \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $INFLUENCER_SCOUT_API_KEY" \\
  -d '{ "query": "nyc mens streetwear", "top_k": 10 }' | jq .</code></pre>
    </div>

    <div class="card">
      <div><strong>Admin</strong></div>
      <div class="muted">
        Visit <a href="/admin">/admin</a> to see jobs, events, usage, queue depth, and to create/revoke API keys.
      </div>
    </div>

    <div class="card">
      <div><strong>Notes</strong></div>
      <div class="muted">
        This API is designed to be independent from GCP at runtime. Weaviate is not directly exposed; use <code>/weaviate/search</code>.
      </div>
    </div>
  </main>
</body>
</html>`);
}

export async function handleOpenApiYaml(_req: any, res: any) {
  const yaml = loadOpenApiYaml();
  res.status(200).type('text/yaml').send(yaml);
}
