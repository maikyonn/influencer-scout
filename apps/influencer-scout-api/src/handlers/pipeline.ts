import type { Request, Response } from 'express';
import { apiKeyFromReq } from '../middleware/api-auth.js';
import { getJob, updateJob } from '../storage/jobs.js';
import { getArtifact } from '../storage/artifacts.js';
import { listEvents, appendEvent } from '../storage/events.js';

async function requireOwnedJob(req: Request, res: Response) {
  const apiKey = apiKeyFromReq(req);
  const jobId = req.params.jobId;
  const job = await getJob(jobId);
  if (!job || job.api_key_id !== apiKey.id) {
    res.status(404).json({ error: 'JOB_NOT_FOUND', message: 'Job not found' });
    return null;
  }
  return job;
}

export async function handleGetJob(req: Request, res: Response) {
  const job = await requireOwnedJob(req, res);
  if (!job) return;
  res.json({
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    current_stage: job.current_stage,
    cancel_requested: job.cancel_requested,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    meta: job.meta ?? {},
    error: job.error ?? null,
  });
}

export async function handleGetResults(req: Request, res: Response) {
  const job = await requireOwnedJob(req, res);
  if (!job) return;

  if (job.status !== 'completed') {
    res.status(409).json({ error: 'NOT_COMPLETED', status: job.status, message: 'Job not completed yet' });
    return;
  }

  const final = await getArtifact(job.job_id, 'final');
  if (!final) {
    res.status(404).json({ error: 'RESULTS_MISSING', message: 'Results not found' });
    return;
  }

  res.json(final.data);
}

export async function handleGetArtifact(req: Request, res: Response) {
  const job = await requireOwnedJob(req, res);
  if (!job) return;

  const kind = String(req.params.kind || '').trim();
  const allowed = new Set(['candidates', 'progressive', 'remaining', 'timing']);
  if (!allowed.has(kind)) {
    res.status(400).json({ error: 'INVALID_KIND', message: 'Unsupported artifact kind' });
    return;
  }
  const art = await getArtifact(job.job_id, kind);
  if (!art) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(art.data);
}

export async function handleCancel(req: Request, res: Response) {
  const job = await requireOwnedJob(req, res);
  if (!job) return;

  if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
    res.status(409).json({ error: 'NOT_CANCELLABLE', status: job.status });
    return;
  }

  await updateJob(job.job_id, { cancel_requested: true });
  await appendEvent(job.job_id, 'info', 'cancel_requested', {});
  res.json({ status: 'ok', job_id: job.job_id });
}

export async function handleEvents(req: Request, res: Response) {
  const job = await requireOwnedJob(req, res);
  if (!job) return;

  const wantsSse = (req.header('accept') || '').includes('text/event-stream') && req.query.format !== 'json';
  const afterParam = String(req.query.after || '').trim();
  const afterId = afterParam ? Number(afterParam) : undefined;
  const lastEventIdHeader = String(req.header('last-event-id') || '').trim();
  // Only honor Last-Event-ID if it is actually present.
  // Note: Number('') === 0, so we must guard against empty header values.
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : NaN;
  const after = Number.isFinite(lastEventId) ? lastEventId : afterId;

  if (!wantsSse) {
    const events = await listEvents(job.job_id, { afterId: after ?? 0, limit: 500 });
    res.json({ job_id: job.job_id, events });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let cursor = after ?? 0;
  let closed = false;

  const close = () => {
    closed = true;
    try { res.end(); } catch {}
  };

  req.on('close', close);

  // Initial ping
  res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  while (!closed) {
    const events = await listEvents(job.job_id, { afterId: cursor, limit: 200 });
    for (const ev of events) {
      cursor = ev.id;
      res.write(`id: ${ev.id}\n`);
      res.write(`event: job_event\n`);
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    // heartbeat
    if (events.length === 0) {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
