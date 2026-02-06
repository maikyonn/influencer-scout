import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BaseEnv = z
  .object({
    INFLUENCER_SCOUT_BASE_URL: z.string().url().optional(),
    INFLUENCER_SCOUT_API_KEY: z.string().min(1),
    INFLUENCER_SCOUT_ADMIN_KEY: z.string().min(1).optional(),
  })
  .parse(process.env);

const BASE_URL = (BaseEnv.INFLUENCER_SCOUT_BASE_URL ?? "https://api.penni-ai.com").replace(/\/+$/, "");

async function http(path: string, init: RequestInit & { admin?: boolean } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (init.admin) {
    if (!BaseEnv.INFLUENCER_SCOUT_ADMIN_KEY) throw new Error("Missing INFLUENCER_SCOUT_ADMIN_KEY");
    headers.set("X-Admin-Key", BaseEnv.INFLUENCER_SCOUT_ADMIN_KEY);
  } else {
    headers.set("X-API-Key", BaseEnv.INFLUENCER_SCOUT_API_KEY);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
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

const server = new Server(
  {
    name: "influencer-scout-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "influencer_scout_weaviate_search",
        description: "Run a normalized Weaviate search (top_k <= 10).",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            top_k: { type: "integer", minimum: 1, maximum: 10 },
          },
          required: ["query"],
        },
      },
      {
        name: "influencer_scout_start_job",
        description: "Start an Influencer Scout job (top_n <= 10).",
        inputSchema: {
          type: "object",
          properties: {
            business_description: { type: "string" },
            top_n: { type: "integer", minimum: 1, maximum: 10 },
          },
          required: ["business_description"],
        },
      },
      {
        name: "influencer_scout_get_job",
        description: "Get job status.",
        inputSchema: {
          type: "object",
          properties: { job_id: { type: "string" } },
          required: ["job_id"],
        },
      },
      {
        name: "influencer_scout_get_results",
        description: "Get job results (only when completed).",
        inputSchema: {
          type: "object",
          properties: { job_id: { type: "string" } },
          required: ["job_id"],
        },
      },
      {
        name: "influencer_scout_get_events",
        description: "Poll job events (JSON).",
        inputSchema: {
          type: "object",
          properties: {
            job_id: { type: "string" },
            after: { type: "integer" },
          },
          required: ["job_id"],
        },
      },
      {
        name: "influencer_scout_admin_overview",
        description: "Admin overview stats.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ],
  };
});

server.setRequestHandler("tools/call", async (req: any) => {
  const name = req.params.name as string;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "influencer_scout_weaviate_search") {
    const parsed = z
      .object({ query: z.string().min(1), top_k: z.number().int().min(1).max(10).optional().default(10) })
      .parse(args);
    const out = await http("/weaviate/search", { method: "POST", body: JSON.stringify(parsed) });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "influencer_scout_start_job") {
    const parsed = z
      .object({ business_description: z.string().min(1), top_n: z.number().int().min(1).max(10).optional().default(10) })
      .parse(args);
    const out = await http("/pipeline/start", {
      method: "POST",
      body: JSON.stringify({
        business_description: parsed.business_description,
        top_n: parsed.top_n,
        weaviate_top_n: Math.max(10, parsed.top_n * 10),
        llm_top_n: parsed.top_n,
      }),
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "influencer_scout_get_job") {
    const parsed = z.object({ job_id: z.string().min(1) }).parse(args);
    const out = await http(`/pipeline/jobs/${encodeURIComponent(parsed.job_id)}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "influencer_scout_get_results") {
    const parsed = z.object({ job_id: z.string().min(1) }).parse(args);
    const out = await http(`/pipeline/jobs/${encodeURIComponent(parsed.job_id)}/results`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "influencer_scout_get_events") {
    const parsed = z.object({ job_id: z.string().min(1), after: z.number().int().optional() }).parse(args);
    const qs = new URLSearchParams({ format: "json" });
    if (typeof parsed.after === "number") qs.set("after", String(parsed.after));
    const out = await http(`/pipeline/jobs/${encodeURIComponent(parsed.job_id)}/events?${qs.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "influencer_scout_admin_overview") {
    const out = await http("/admin/api/overview", { admin: true });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
