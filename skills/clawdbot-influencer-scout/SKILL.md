---
name: "clawdbot-influencer-scout"
description: "Use the Influencer Scout MCP server to run influencer scouting jobs and retrieve results (always <=10)."
---

# Clawdbot: Influencer Scout

This skill uses the Influencer Scout MCP server tools:

- `influencer_scout_start_job` (enforces `top_n <= 10`)
- `influencer_scout_get_job`
- `influencer_scout_get_events`
- `influencer_scout_get_results`
- `influencer_scout_weaviate_search` (enforces `top_k <= 10`)

## Environment

The MCP server expects:

- `INFLUENCER_SCOUT_BASE_URL` (default `https://api.penni-ai.com`)
- `INFLUENCER_SCOUT_API_KEY`
- Optional `INFLUENCER_SCOUT_ADMIN_KEY`

## Guardrails

- Never request more than 10 influencers.
- Always persist/return `job_id`.
- Poll events until complete or timeout, then fetch results.
