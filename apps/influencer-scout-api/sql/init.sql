-- Influencer Scout API schema (Hetzner-native).
-- This file is intended to be mounted into Postgres as an init script.

CREATE TABLE IF NOT EXISTS api_keys (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  rate_rps      INTEGER NOT NULL DEFAULT 2,
  burst         INTEGER NOT NULL DEFAULT 10,
  monthly_quota INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_revoked_at_idx ON api_keys (revoked_at);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  job_id         UUID PRIMARY KEY,
  api_key_id     BIGINT NOT NULL REFERENCES api_keys(id),
  status         TEXT NOT NULL,
  params         JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress       INTEGER NOT NULL DEFAULT 0,
  current_stage  TEXT,
  error          JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_jobs_api_key_status_idx ON pipeline_jobs (api_key_id, status);
CREATE INDEX IF NOT EXISTS pipeline_jobs_created_at_idx ON pipeline_jobs (created_at);

CREATE TABLE IF NOT EXISTS pipeline_job_artifacts (
  job_id     UUID NOT NULL REFERENCES pipeline_jobs(job_id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, kind)
);

CREATE TABLE IF NOT EXISTS pipeline_job_events (
  id      BIGSERIAL PRIMARY KEY,
  job_id  UUID NOT NULL REFERENCES pipeline_jobs(job_id) ON DELETE CASCADE,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  level   TEXT NOT NULL,
  type    TEXT NOT NULL,
  data    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pipeline_job_events_job_id_id_idx ON pipeline_job_events (job_id, id);

CREATE TABLE IF NOT EXISTS external_calls (
  id         BIGSERIAL PRIMARY KEY,
  job_id     UUID REFERENCES pipeline_jobs(job_id) ON DELETE CASCADE,
  api_key_id BIGINT REFERENCES api_keys(id),
  service    TEXT NOT NULL,
  operation  TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  status     TEXT NOT NULL,
  cost_usd   NUMERIC,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS external_calls_ts_idx ON external_calls (ts);
CREATE INDEX IF NOT EXISTS external_calls_api_key_ts_idx ON external_calls (api_key_id, ts);
CREATE INDEX IF NOT EXISTS external_calls_job_id_ts_idx ON external_calls (job_id, ts);

CREATE TABLE IF NOT EXISTS brightdata_cache (
  cache_key      TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL,
  platform       TEXT NOT NULL,
  raw_data       JSONB NOT NULL,
  cached_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS brightdata_cache_expires_at_idx ON brightdata_cache (expires_at);
