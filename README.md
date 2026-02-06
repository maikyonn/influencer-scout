# Influencer Scout

Monorepo for the Influencer Scout backend stack:

- `apps/influencer-scout-api`: Public API + admin UI + BullMQ worker entrypoints
- (planned) `apps/mcp-server`: MCP server that interacts with the API
- (planned) `skills/`: Openclaw skills that use the MCP server/tools
- `infra/hetzner`: Compose/Caddy templates and deploy helpers

The production API is hosted behind Caddy at `https://api.penni-ai.com`.

## Dev

```bash
bun install
bun run dev:api
bun run dev:worker
```
