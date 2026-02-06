# Influencer Scout API Architecture (Hetzner-Only)

## Overview

`influencer-scout-api` is a Hetzner-native backend made of:

- A public HTTP API (Express) for starting and observing pipeline jobs
- A BullMQ worker (separate process) for long-running pipeline execution
- Postgres for durable state (jobs, artifacts, events, usage, cache)
- Redis for the queue + rate limiting + idempotency
- Weaviate as an internal-only vector/search backend

The service is designed to be **independent from GCP** at runtime (no Firestore, Cloud Tasks, GCS, service accounts, or Cloud Run tokens).

Public hostname is `api.penni-ai.com` behind Caddy.

## Components

### 1. Edge Proxy (Caddy)

- Terminates TLS for `api.penni-ai.com`
- Routes path prefixes to the API service (and optionally keeps legacy routes for rollback)
- Only Caddy listens publicly on `:80` and `:443`

### 2. API Service (`influencer-scout-api`)

Primary responsibilities:

- Validates + authenticates requests (`X-API-Key`)
- Creates jobs in Postgres
- Enqueues BullMQ jobs in Redis
- Serves job status, results, artifacts, and events (SSE or JSON polling)
- Provides admin UI + JSON endpoints under `/admin/*` (admin-keyed)
- Provides an API-owned Weaviate search endpoint under `/weaviate/search` (not a passthrough)

### 3. Worker Service (`influencer-scout-worker`)

Primary responsibilities:

- Pulls jobs from BullMQ
- Executes pipeline stages:
  - Query expansion (LLM)
  - Weaviate hybrid search
  - BrightData fetch (cache-first)
  - LLM fit scoring
- Persists everything into Postgres:
  - `pipeline_jobs` summary state
  - `pipeline_job_events` append-only event log (supports SSE)
  - `pipeline_job_artifacts` (candidates/progressive/final/timing/etc)
  - `external_calls` (duration/cost estimates per service)
  - `brightdata_cache` (TTL-based cache)

### 4. Postgres (durable state)

Schema lives in `sql/init.sql`.

Key tables:

- `api_keys` (hashed keys + limits)
- `pipeline_jobs` (status, progress, params, meta)
- `pipeline_job_events` (append-only; used for SSE and admin timelines)
- `pipeline_job_artifacts` (JSON blobs for `final`, `progressive`, `candidates`, etc)
- `external_calls` (ledger for observability and cost attribution)
- `brightdata_cache` (profile cache with TTL)

Retention is enforced by a periodic cleanup routine (worker timer) that deletes expired cache rows and old job data.

### 5. Redis (queue + ephemeral controls)

Used for:

- BullMQ queue (jobs, retries, backoff)
- Rate limiting (token bucket via Lua)
- Idempotency keys for `POST /pipeline/start`

### 6. Weaviate (internal-only)

- Exposed only to the internal Docker network / localhost binding
- Clients never access Weaviate directly
- The API provides `/weaviate/search` that returns normalized candidates with hard caps

## Public HTTP Surfaces

### Health

- `GET /health` (no auth)
  - returns `200` when startup checks report healthy
  - returns `503` while initializing or degraded

### Pipeline API (API-keyed)

All require `X-API-Key`.

- `POST /pipeline/start`
  - creates a job and enqueues it; returns `202 { job_id }`
  - optional `Idempotency-Key` header supported
- `GET /pipeline/jobs/:jobId`
  - status + progress + stage + meta counters
- `GET /pipeline/jobs/:jobId/results`
  - returns final ranked influencers (only when `completed`)
- `GET /pipeline/jobs/:jobId/artifacts/:kind`
  - `kind` in: `candidates`, `progressive`, `remaining`, `timing`
- `GET /pipeline/jobs/:jobId/events`
  - SSE when `Accept: text/event-stream`
  - JSON batch when `?format=json` or no SSE accept header
- `POST /pipeline/jobs/:jobId/cancel`
  - sets `cancel_requested`; worker stops at safe points

### Weaviate Search Endpoint (API-keyed)

- `POST /weaviate/search`
  - normalized candidates only (no raw passthrough)
  - hard caps enforced in request validation

### Admin (admin-keyed)

Admin UI + JSON APIs:

- `GET /admin` HTML dashboard (cookie session after `/admin/login`)
- `POST /admin/login` sets cookie session
- `GET /admin/api/*` JSON endpoints (requires `X-Admin-Key` or valid admin cookie)

Admin provides:

- Overview stats (jobs, success rate, p95, cost estimate)
- Recent jobs + per-job inspector (events, external calls, artifacts)
- Usage aggregates
- Queue stats
- API key management (create/revoke)

## Pipeline Execution Flow (Happy Path)

1. Client calls `POST /pipeline/start` with `X-API-Key`
2. API:
   - validates body
   - writes `pipeline_jobs` row (status `pending`)
   - enqueues BullMQ job in Redis
   - returns `202 { job_id }`
3. Worker dequeues and runs:
   - writes `pipeline_job_events` stage markers and progress updates
   - writes `pipeline_job_artifacts` progressively
   - records `external_calls` and cost estimates
4. Client observes via:
   - SSE events endpoint
   - job status endpoint
   - progressive artifacts
5. When complete:
   - status becomes `completed`
   - `GET /pipeline/jobs/:jobId/results` returns final output

## Security Model

- Public endpoints are API-keyed via `X-API-Key` (keys are stored hashed in Postgres)
- Rate limiting enforced per API key (Redis token bucket)
- Admin endpoints require admin auth (`X-Admin-Key` or a secure cookie session)
- Only `22/80/443` are exposed publicly; everything else binds to localhost

## Ops Notes

- Docker Compose runs API, worker, Postgres, Redis, Weaviate
- Caddy is the only public listener and routes by path prefix
- The system is designed so legacy GCP-shaped services can remain running for rollback while traffic is gradually cut over

