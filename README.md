# Influencer Scout

Monorepo for the Influencer Scout backend stack:

- `apps/influencer-scout-api`: Public API + admin UI + BullMQ worker entrypoints
- `apps/influencer-scout-web`: SvelteKit one-page “Influencer Scout” website (calls API server-side; no client key exposure)
- `apps/mcp-server`: MCP server that interacts with the API
- `skills/`: Openclaw skills that use the MCP server/tools
- `infra/hetzner`: Compose/Caddy templates and deploy helpers

The production API is hosted behind Caddy at `https://api.penni-ai.com`.

## Dev

```bash
bun install
bun run dev:api
bun run dev:worker
bun run dev:web
bun run dev:mcp
```

## Render

`render.yaml` deploys the web app via Docker. You must set `INFLUENCER_SCOUT_API_KEY` in Render env vars.
