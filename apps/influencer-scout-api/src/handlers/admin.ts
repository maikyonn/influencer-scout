import type { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { z } from 'zod';
import { dbQuery } from '../storage/db.js';
import { createJob, getJob, listJobs, updateJob } from '../storage/jobs.js';
import { appendEvent, listEvents } from '../storage/events.js';
import { getArtifact, listArtifactsForJob } from '../storage/artifacts.js';
import { listApiKeys, createApiKeyRow, revokeApiKey } from '../storage/api-keys.js';
import { hashApiKeyForStorage } from '../middleware/api-auth.js';
import { makeAdminSessionCookie } from '../middleware/admin-auth.js';
import { getPipelineQueue } from '../queue/pipeline.js';
import { createLogger } from '../utils/logger.js';
import { performParallelHybridSearches } from '../utils/weaviate-search.js';

const logger = createLogger({ component: 'admin' });

function renderShell() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Influencer Scout Admin</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system;
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
    }
    .admin-shell {
      display: flex;
      flex-direction: column;
      gap: 24px;
      padding: 32px 40px 64px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      padding-bottom: 16px;
    }
    .admin-eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      color: rgba(15, 23, 42, 0.5);
      margin: 0 0 4px 0;
    }
    .admin-header h1 {
      margin: 0;
      font-size: 28px;
      color: #0f172a;
    }
    .admin-subtitle {
      margin: 6px 0 0 0;
      color: rgba(15, 23, 42, 0.6);
    }
    .admin-user {
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.05);
      font-size: 13px;
      color: rgba(15, 23, 42, 0.7);
    }
    .admin-nav {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .admin-nav a {
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 14px;
      color: rgba(15, 23, 42, 0.7);
      text-decoration: none;
      background: rgba(15, 23, 42, 0.04);
      transition: all 0.2s ease;
    }
    .admin-nav a.active {
      background: #0f172a;
      color: #fff;
    }
    .admin-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .muted { color: rgba(15, 23, 42, 0.6); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .error-text { color: #b91c1c; font-size: 13px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .section-card {
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
    }
    .section-card h2, .section-card h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stat span { font-size: 12px; color: rgba(15, 23, 42, 0.6); }
    .stat strong { font-size: 22px; }

    .filter-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      align-items: end;
      background: rgba(15, 23, 42, 0.03);
      border-radius: 16px;
      padding: 16px;
    }
    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: rgba(15, 23, 42, 0.6);
    }
    .filter-field input,
    .filter-field select {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      font-size: 14px;
      background: #fff;
      color: #0f172a;
    }
    .cta {
      padding: 10px 16px;
      border-radius: 12px;
      border: none;
      background: #0f172a;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }
    .cta.secondary {
      background: rgba(15, 23, 42, 0.08);
      color: rgba(15, 23, 42, 0.85);
    }

    .table {
      display: grid;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(15, 23, 42, 0.08);
    }
    .table-header,
    .table-row {
      display: grid;
      grid-template-columns: 1.5fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
    }
    .table-header {
      background: rgba(15, 23, 42, 0.06);
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: rgba(15, 23, 42, 0.55);
    }
    .table-row {
      background: #fff;
      text-decoration: none;
      color: inherit;
      border-top: 1px solid rgba(15, 23, 42, 0.06);
      font-size: 13px;
    }
    .table-row:hover { background: rgba(15, 23, 42, 0.02); }
    .status-pill {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      text-transform: capitalize;
      border: 1px solid rgba(15, 23, 42, 0.1);
      background: rgba(15, 23, 42, 0.04);
      color: rgba(15, 23, 42, 0.75);
      width: fit-content;
    }
    .status-pill.status-completed { background: rgba(34, 197, 94, 0.12); border-color: rgba(34, 197, 94, 0.18); color: #166534; }
    .status-pill.status-running { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.18); color: #1d4ed8; }
    .status-pill.status-error { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.18); color: #991b1b; }
    .status-pill.status-cancelled { background: rgba(100, 116, 139, 0.12); border-color: rgba(100, 116, 139, 0.18); color: #334155; }
    .status-pill.status-pending { background: rgba(234, 179, 8, 0.12); border-color: rgba(234, 179, 8, 0.18); color: #92400e; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .summary-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
      padding: 8px 0;
      border-top: 1px solid rgba(15, 23, 42, 0.06);
    }
    .summary-item:first-of-type { border-top: none; padding-top: 0; }
    .summary-item span { color: rgba(15, 23, 42, 0.6); font-size: 12px; }
    .summary-item strong { font-size: 13px; }

    details > summary { cursor: pointer; color: rgba(15, 23, 42, 0.75); }
    pre.code {
      margin: 10px 0 0 0;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(15, 23, 42, 0.03);
      overflow: auto;
      font-size: 12px;
      line-height: 1.4;
    }

    #login { max-width: 480px; }
    @media (max-width: 720px) {
      .admin-shell { padding: 24px 20px 48px; }
      .admin-header { flex-direction: column; align-items: flex-start; }
      .table-header, .table-row { grid-template-columns: 1.5fr 0.7fr 0.9fr; }
      .hide-sm { display: none; }
    }
  </style>
  <script>
    async function api(path, opts) {
      const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status, data });
      return data;
    }

    function el(id){ return document.getElementById(id); }
    function qs(sel){ return document.querySelector(sel); }
    function show(id, on){ const n = el(id); if (n) n.style.display = on ? '' : 'none'; }
    function setActiveNav() {
      const path = location.pathname;
      const links = document.querySelectorAll('.admin-nav a');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const active = (href === '/admin' ? path === '/admin' : path.startsWith(href));
        if (active) a.classList.add('active'); else a.classList.remove('active');
      }
    }

    async function loadOverview() {
      const o = await api('/admin/api/overview');
      el('ov_jobs').textContent = o.jobs_last_24h;
      el('ov_success').textContent = o.success_rate_last_24h;
      el('ov_p95').textContent = o.p95_duration_s == null ? '—' : String(o.p95_duration_s);
      el('ov_cost').textContent = '$' + o.cost_usd_last_24h;
      el('ov_queue').textContent = JSON.stringify(o.queue);
    }

    function fmtDate(s) {
      if (!s) return '—';
      const d = new Date(s);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }

    function fmtPct(v) {
      if (typeof v !== 'number') return '—';
      return Math.round(v) + '%';
    }

    async function loadRecentJobs() {
      const j = await api('/admin/api/jobs?limit=25');
      const host = el('recentJobs');
      host.innerHTML = '';
      host.appendChild(renderJobsTable(j.jobs || []));
    }

    function renderJobsTable(rows) {
      const wrap = document.createElement('div');
      wrap.className = 'table';
      const head = document.createElement('div');
      head.className = 'table-header';
      head.innerHTML = '<span>Job</span><span>Status</span><span>Stage</span><span class="hide-sm">Progress</span><span class="hide-sm">API Key</span><span>Created</span>';
      wrap.appendChild(head);
      for (const row of rows) {
        const a = document.createElement('a');
        a.className = 'table-row';
        a.href = '/admin/jobs/' + row.job_id;
        a.innerHTML =
          '<span class="mono">' + row.job_id + '</span>' +
          '<span class="status-pill status-' + (row.status || 'unknown') + '">' + (row.status || 'unknown') + '</span>' +
          '<span>' + (row.current_stage || '—') + '</span>' +
          '<span class="hide-sm">' + fmtPct(row.progress) + '</span>' +
          '<span class="hide-sm">' + (row.api_key_id == null ? '—' : String(row.api_key_id)) + '</span>' +
          '<span>' + fmtDate(row.created_at) + '</span>';
        wrap.appendChild(a);
      }
      return wrap;
    }

    function parseJobIdFromPath() {
      const m = location.pathname.match(/^\\/admin\\/jobs\\/([0-9a-fA-F-]{36})/);
      return m ? m[1] : null;
    }

    async function loadJobDetail(jobId) {
      const job = await api('/admin/api/jobs/' + jobId);
      const ev = await api('/admin/api/jobs/' + jobId + '/events?limit=500');
      const calls = await api('/admin/api/jobs/' + jobId + '/external-calls?limit=500');
      const arts = await api('/admin/api/jobs/' + jobId + '/artifacts');
      const timing = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/timing');
      const progressive = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/progressive');
      const final = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/final');

      el('job_id').textContent = job.job_id;
      el('job_status').textContent = job.status || '—';
      el('job_status').className = 'status-pill status-' + (job.status || 'unknown');

      el('job_summary').innerHTML = ''
        + summaryRow('Status', job.status)
        + summaryRow('Stage', job.current_stage || '—')
        + summaryRow('Progress', fmtPct(job.progress))
        + summaryRow('API Key', job.api_key_id == null ? '—' : String(job.api_key_id))
        + summaryRow('Created', fmtDate(job.created_at))
        + summaryRow('Started', fmtDate(job.started_at))
        + summaryRow('Finished', fmtDate(job.finished_at))
        + summaryRow('Cancel Requested', job.cancel_requested ? 'yes' : 'no');

      const stats = (job.meta && job.meta.pipeline_stats) ? job.meta.pipeline_stats : null;
      el('job_usage').innerHTML = ''
        + summaryRow('Candidates', (job.meta && job.meta.weaviate_search && job.meta.weaviate_search.candidates_count) || '—')
        + summaryRow('Cache Hits', (job.meta && job.meta.pipeline_stats && job.meta.pipeline_stats.cache_hits) || '—')
        + summaryRow('API Calls', (job.meta && job.meta.pipeline_stats && job.meta.pipeline_stats.api_calls) || '—')
        + summaryRow('Total Cost', (stats && stats.total_cost != null) ? ('$' + Number(stats.total_cost).toFixed(4)) : '—');

      el('job_events').textContent = JSON.stringify(ev.events || [], null, 2);
      el('job_calls').textContent = JSON.stringify(calls.calls || [], null, 2);
      el('job_artifacts').textContent = JSON.stringify((arts.artifacts || []).map(a => ({ kind: a.kind, updated_at: a.updated_at })), null, 2);
      el('job_meta').textContent = JSON.stringify(job.meta || {}, null, 2);
      el('job_params').textContent = JSON.stringify(job.params || {}, null, 2);
      el('job_error').textContent = JSON.stringify(job.error || null, null, 2);

      // Waterfall view (best-effort)
      const wf = el('job_waterfall');
      wf.innerHTML = '';
      if (timing && timing.stages) {
        wf.appendChild(renderWaterfall(timing));
      } else {
        wf.innerHTML = '<p class="muted">No timing artifact available.</p>';
      }

      // Results tables (cap 10)
      renderProfilesTable(el('job_progressive_profiles'), (progressive && progressive.profiles) ? progressive.profiles : null);
      renderProfilesTable(el('job_final_profiles'), (final && final.profiles) ? final.profiles : null);

      // Cancel button state
      const cancelBtn = el('job_cancel_btn');
      if (cancelBtn) {
        cancelBtn.disabled = (job.status !== 'pending' && job.status !== 'running');
      }
    }

    function summaryRow(label, value) {
      return '<div class="summary-item"><span>' + label + '</span><strong>' + (value == null ? '—' : String(value)) + '</strong></div>';
    }

    async function loadJobsPage(options) {
      const limit = options && options.limit ? options.limit : 50;
      const offset = options && options.offset ? options.offset : 0;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const status = el('filter_status').value;
      const apiKeyId = el('filter_key').value;
      const from = el('filter_from').value;
      const to = el('filter_to').value;
      if (status) params.set('status', status);
      if (apiKeyId) params.set('api_key_id', apiKeyId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const j = await api('/admin/api/jobs?' + params.toString());
      el('jobsTableHost').innerHTML = '';
      el('jobsTableHost').appendChild(renderJobsTable(j.jobs || []));
    }

    async function loadKeys() {
      const k = await api('/admin/api/keys');
      const host = el('keysHost');
      host.innerHTML = '';
      const table = document.createElement('div');
      table.className = 'table';
      const head = document.createElement('div');
      head.className = 'table-header';
      head.innerHTML = '<span>Name</span><span class="hide-sm">ID</span><span class="hide-sm">Hash</span><span>Created</span><span>Revoked</span><span>Action</span>';
      table.appendChild(head);
      for (const row of (k.keys || [])) {
        const div = document.createElement('div');
        div.className = 'table-row';
        div.style.gridTemplateColumns = '1.2fr 0.5fr 0.8fr 1fr 1fr 0.7fr';
        div.innerHTML =
          '<span>' + (row.name || '—') + '</span>' +
          '<span class="hide-sm">' + (row.id == null ? '—' : String(row.id)) + '</span>' +
          '<span class="hide-sm mono">' + (row.key_hash || '—') + '</span>' +
          '<span>' + fmtDate(row.created_at) + '</span>' +
          '<span>' + (row.revoked_at ? fmtDate(row.revoked_at) : '—') + '</span>' +
          '<span>' + (row.revoked_at ? '' : ('<button class="cta secondary" onclick="revokeKey(' + row.id + ')">Revoke</button>')) + '</span>';
        table.appendChild(div);
      }
      host.appendChild(table);
    }

    async function revokeKey(id) {
      await api('/admin/api/keys/' + id + '/revoke', { method: 'POST' });
      await loadKeys();
    }

    async function createKey() {
      const name = el('newKeyName').value || 'key';
      const out = await api('/admin/api/keys', { method: 'POST', body: JSON.stringify({ name }) });
      alert('New API key (copy now):\\n' + out.api_key);
      await loadKeys();
    }

    async function login() {
      const key = el('adminKey').value;
      await api('/admin/login', { method: 'POST', body: JSON.stringify({ admin_key: key }) });
      location.reload();
    }

    async function loadUsage() {
      const params = new URLSearchParams();
      const apiKeyId = el('usage_key').value;
      const from = el('usage_from').value;
      const to = el('usage_to').value;
      if (apiKeyId) params.set('api_key_id', apiKeyId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const u = await api('/admin/api/usage?' + params.toString());
      const host = el('usageHost');
      host.innerHTML = '';
      const table = document.createElement('div');
      table.className = 'table';
      const head = document.createElement('div');
      head.className = 'table-header';
      head.innerHTML = '<span>Day</span><span>API Key</span><span>Calls</span><span>Cost</span><span class="hide-sm">Note</span><span class="hide-sm"></span>';
      table.appendChild(head);
      for (const row of (u.rows || [])) {
        const div = document.createElement('div');
        div.className = 'table-row';
        div.innerHTML =
          '<span>' + fmtDate(row.day) + '</span>' +
          '<span>' + row.api_key_id + '</span>' +
          '<span>' + row.calls + '</span>' +
          '<span>$' + Number(row.cost_usd || 0).toFixed(4) + '</span>' +
          '<span class="hide-sm muted">from external_calls ledger</span>' +
          '<span class="hide-sm"></span>';
        table.appendChild(div);
      }
      host.appendChild(table);
    }

    async function tryApi(path) {
      try { return await api(path); } catch { return null; }
    }

    function renderProfilesTable(host, profiles) {
      if (!host) return;
      host.innerHTML = '';
      if (!Array.isArray(profiles) || profiles.length === 0) {
        host.innerHTML = '<p class="muted">No profiles.</p>';
        return;
      }
      const rows = profiles.slice(0, 10);
      const table = document.createElement('div');
      table.className = 'table';
      const head = document.createElement('div');
      head.className = 'table-header';
      head.innerHTML = '<span>Platform</span><span>Profile</span><span class="hide-sm">Followers</span><span>Fit</span><span class="hide-sm">Name</span><span class="hide-sm"></span>';
      table.appendChild(head);
      for (const p of rows) {
        const div = document.createElement('div');
        div.className = 'table-row';
        div.innerHTML =
          '<span>' + (p.platform || '—') + '</span>' +
          '<span class="mono"><a href="' + (p.url || p.profile_url || '#') + '" target="_blank" rel="noreferrer">' + ((p.account_id || p.display_name || (p.url || p.profile_url || '')).toString().slice(0, 40)) + '</a></span>' +
          '<span class="hide-sm">' + (p.followers == null ? '—' : String(p.followers)) + '</span>' +
          '<span>' + (p.fit_score == null ? '—' : String(p.fit_score)) + '</span>' +
          '<span class="hide-sm">' + (p.display_name || '—') + '</span>' +
          '<span class="hide-sm"></span>';
        table.appendChild(div);
      }
      host.appendChild(table);
    }

    function renderWaterfall(timing) {
      const wrap = document.createElement('div');
      wrap.className = 'wf';

      const startAbs = Number(timing.pipeline_start || 0);
      const endAbs = Number(timing.pipeline_end || 0) || (Date.now() / 1000);
      const total = Math.max(0.001, endAbs - startAbs);

      const stages = timing.stages || {};
      const order = ['query_expansion','weaviate_search','brightdata_collection','llm_analysis'];
      const labels = {
        query_expansion: 'Query Expansion',
        weaviate_search: 'Weaviate Search',
        brightdata_collection: 'BrightData',
        llm_analysis: 'LLM Analysis'
      };

      for (const key of order) {
        const st = stages[key];
        if (!st) continue;
        const s = Number(st.start || 0);
        const e = (st.end != null ? Number(st.end) : Math.max(s, (Date.now()/1000) - startAbs));
        const left = Math.max(0, Math.min(100, (s / total) * 100));
        const width = Math.max(0.5, Math.min(100 - left, ((e - s) / total) * 100));

        const row = document.createElement('div');
        row.className = 'wf-row';
        row.innerHTML = '<div class="wf-label">' + (labels[key] || key) + '</div>' +
          '<div class="wf-track"><div class="wf-bar" style="left:' + left.toFixed(3) + '%;width:' + width.toFixed(3) + '%"></div></div>' +
          '<div class="wf-meta mono">' + ((st.duration != null) ? (Number(st.duration).toFixed(2) + 's') : '—') + '</div>';
        wrap.appendChild(row);
      }
      return wrap;
    }

    let liveSource = null;
    async function startLive(jobId) {
      stopLive();
      liveSource = new EventSource('/admin/api/jobs/' + jobId + '/events/stream');
      liveSource.addEventListener('job_event', async (evt) => {
        try {
          const ev = JSON.parse(evt.data);
          // Append to the events box (keep last ~300 lines)
          const box = el('job_events_live');
          if (box) {
            const line = '[' + ev.ts + '] ' + ev.type + ' ' + JSON.stringify(ev.data || {});
            box.textContent = (box.textContent + '\\n' + line).split('\\n').slice(-300).join('\\n');
          }
          // Refresh job summary on status/stage changes
          if (ev.type === 'job_status' || ev.type === 'stage_start' || ev.type === 'stage_complete') {
            const job = await api('/admin/api/jobs/' + jobId);
            el('job_status').textContent = job.status || '—';
            el('job_status').className = 'status-pill status-' + (job.status || 'unknown');
            const cancelBtn = el('job_cancel_btn');
            if (cancelBtn) cancelBtn.disabled = (job.status !== 'pending' && job.status !== 'running');
          }
          // Occasionally refresh progressive/final + timing.
          if (Math.random() < 0.2) {
            const timing = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/timing');
            const progressive = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/progressive');
            const final = await tryApi('/admin/api/jobs/' + jobId + '/artifacts/final');
            const wf = el('job_waterfall');
            if (wf && timing && timing.stages) { wf.innerHTML=''; wf.appendChild(renderWaterfall(timing)); }
            renderProfilesTable(el('job_progressive_profiles'), progressive && progressive.profiles ? progressive.profiles : null);
            renderProfilesTable(el('job_final_profiles'), final && final.profiles ? final.profiles : null);
          }
        } catch (e) {
          // ignore parse errors
        }
      });
      liveSource.addEventListener('error', () => {
        // Keep it simple; browser will retry automatically.
      });
    }

    function stopLive() {
      if (liveSource) {
        try { liveSource.close(); } catch {}
        liveSource = null;
      }
    }

    async function cancelJob(jobId) {
      await api('/admin/api/jobs/' + jobId + '/cancel', { method: 'POST' });
      const job = await api('/admin/api/jobs/' + jobId);
      el('job_status').textContent = job.status || '—';
      el('job_status').className = 'status-pill status-' + (job.status || 'unknown');
    }

    async function adminWeaviateSearch() {
      const q = el('tool_weaviate_query').value || '';
      const topk = Number(el('tool_weaviate_topk').value || '10');
      const payload = { query: q.trim(), top_k: Math.max(1, Math.min(10, Math.floor(topk || 10))) };
      const out = await api('/admin/api/weaviate/search', { method: 'POST', body: JSON.stringify(payload) });
      const host = el('tool_weaviate_out');
      if (!host) return;
      host.innerHTML = '';
      const cand = out.candidates || [];
      const table = document.createElement('div');
      table.className = 'table';
      const head = document.createElement('div');
      head.className = 'table-header';
      head.innerHTML = '<span>Platform</span><span>Profile</span><span class="hide-sm">Followers</span><span class="hide-sm">Score</span><span class="hide-sm"></span><span class="hide-sm"></span>';
      table.appendChild(head);
      for (const c of cand) {
        const div = document.createElement('div');
        div.className = 'table-row';
        div.innerHTML =
          '<span>' + (c.platform || '—') + '</span>' +
          '<span class="mono"><a href="' + c.profile_url + '" target="_blank" rel="noreferrer">' + (c.display_name || c.profile_url) + '</a></span>' +
          '<span class="hide-sm">' + (c.followers == null ? '—' : String(c.followers)) + '</span>' +
          '<span class="hide-sm">' + (c.score == null ? '—' : String(c.score.toFixed ? c.score.toFixed(3) : c.score)) + '</span>' +
          '<span class="hide-sm"></span><span class="hide-sm"></span>';
        table.appendChild(div);
      }
      host.appendChild(table);
    }

    async function adminPipelineStart() {
      const desc = (el('tool_pipe_desc').value || '').trim();
      const topn = Math.max(1, Math.min(10, Math.floor(Number(el('tool_pipe_topn').value || '10'))));
      const payload = { business_description: desc, top_n: topn, weaviate_top_n: Math.max(10, topn * 10), llm_top_n: topn };
      const out = await api('/admin/api/pipeline/start', { method: 'POST', body: JSON.stringify(payload) });
      location.href = '/admin/jobs/' + out.job_id;
    }

    async function boot() {
      try {
        await loadOverview();
        setActiveNav();
        show('shell', true);
        show('login', false);

        // Route to the current page.
        const path = location.pathname;
        if (path === '/admin' || path === '/admin/') {
          show('page_overview', true);
          show('page_jobs', false);
          show('page_usage', false);
          show('page_keys', false);
          show('page_job_detail', false);
          await loadRecentJobs();
        } else if (path.startsWith('/admin/jobs/')) {
          show('page_overview', false);
          show('page_jobs', false);
          show('page_usage', false);
          show('page_keys', false);
          show('page_job_detail', true);
          const jobId = parseJobIdFromPath();
          if (jobId) {
            await loadJobDetail(jobId);
            startLive(jobId);
          }
        } else if (path.startsWith('/admin/jobs')) {
          show('page_overview', false);
          show('page_jobs', true);
          show('page_usage', false);
          show('page_keys', false);
          show('page_job_detail', false);
          await loadJobsPage({ limit: 50, offset: 0 });
        } else if (path.startsWith('/admin/usage')) {
          show('page_overview', false);
          show('page_jobs', false);
          show('page_usage', true);
          show('page_keys', false);
          show('page_job_detail', false);
          await loadUsage();
        } else if (path.startsWith('/admin/keys')) {
          show('page_overview', false);
          show('page_jobs', false);
          show('page_usage', false);
          show('page_keys', true);
          show('page_job_detail', false);
          await loadKeys();
        } else {
          show('page_overview', true);
          show('page_jobs', false);
          show('page_usage', false);
          show('page_keys', false);
          show('page_job_detail', false);
          await loadRecentJobs();
          // Tools are on the overview page
        }
      } catch (e) {
        if (e && e.status === 401) {
          show('shell', false);
          show('login', true);
        } else {
          el('fatal').textContent = (e && e.data) ? JSON.stringify(e.data) : String(e);
        }
      }
    }
    window.addEventListener('load', boot);
  </script>
</head>
<body>
  <div class="admin-shell" id="shell" style="display:none">
    <header class="admin-header">
      <div>
        <p class="admin-eyebrow">Admin Console</p>
        <h1>Operations</h1>
        <p class="admin-subtitle">Monitor Influencer Scout pipeline jobs, usage, and keys.</p>
      </div>
      <div class="admin-user">
        <span>influencer-scout-api</span>
      </div>
    </header>

    <nav class="admin-nav">
      <a href="/admin">Overview</a>
      <a href="/admin/jobs">Jobs</a>
      <a href="/admin/usage">Usage</a>
      <a href="/admin/keys">Keys</a>
    </nav>

    <main class="admin-content">
      <div id="fatal" class="error-text"></div>

      <section id="page_overview" style="display:none">
        <section class="section-card">
          <h2>Overview</h2>
          <div class="grid">
            <div class="stat"><span>Jobs (24h)</span><strong id="ov_jobs">—</strong></div>
            <div class="stat"><span>Success rate (24h)</span><strong id="ov_success">—</strong></div>
            <div class="stat"><span>p95 duration (s)</span><strong id="ov_p95">—</strong></div>
            <div class="stat"><span>Cost estimate (24h)</span><strong id="ov_cost">—</strong></div>
          </div>
          <p class="muted" style="margin: 12px 0 0 0;">Queue: <span class="mono" id="ov_queue">—</span></p>
        </section>

        <section class="section-card">
          <h2>Tools</h2>
          <div class="summary-grid">
            <div class="section-card" style="background: rgba(15,23,42,0.02); border-color: rgba(15,23,42,0.06);">
              <h3>Weaviate Search (top_k <= 10)</h3>
              <div class="filter-bar" style="grid-template-columns: 1fr 160px auto;">
                <div class="filter-field">
                  <label for="tool_weaviate_query">Query</label>
                  <input id="tool_weaviate_query" type="text" placeholder="e.g. nyc mens streetwear"/>
                </div>
                <div class="filter-field">
                  <label for="tool_weaviate_topk">top_k</label>
                  <input id="tool_weaviate_topk" type="number" min="1" max="10" value="10"/>
                </div>
                <button class="cta" onclick="adminWeaviateSearch()">Search</button>
              </div>
              <div id="tool_weaviate_out" style="margin-top: 12px"></div>
            </div>

            <div class="section-card" style="background: rgba(15,23,42,0.02); border-color: rgba(15,23,42,0.06);">
              <h3>Start Pipeline (top_n <= 10)</h3>
              <div class="filter-bar" style="grid-template-columns: 1fr 160px auto;">
                <div class="filter-field">
                  <label for="tool_pipe_desc">Business description</label>
                  <input id="tool_pipe_desc" type="text" placeholder="Describe who to find"/>
                </div>
                <div class="filter-field">
                  <label for="tool_pipe_topn">top_n</label>
                  <input id="tool_pipe_topn" type="number" min="1" max="10" value="10"/>
                </div>
                <button class="cta" onclick="adminPipelineStart()">Start</button>
              </div>
              <p class="muted" style="margin: 12px 0 0 0;">Live updates are available on the job detail page.</p>
            </div>
          </div>
        </section>

        <section class="section-card">
          <h2>Recent jobs</h2>
          <div id="recentJobs"></div>
        </section>
      </section>

      <section id="page_jobs" style="display:none">
        <section class="section-card">
          <h2>Jobs</h2>
          <form class="filter-bar" onsubmit="event.preventDefault(); loadJobsPage({limit:50,offset:0});">
            <div class="filter-field">
              <label for="filter_status">Status</label>
              <select id="filter_status">
                <option value="">All</option>
                <option value="pending">pending</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="error">error</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div class="filter-field">
              <label for="filter_key">API Key ID</label>
              <input id="filter_key" type="number" placeholder="e.g. 5"/>
            </div>
            <div class="filter-field">
              <label for="filter_from">From</label>
              <input id="filter_from" type="date"/>
            </div>
            <div class="filter-field">
              <label for="filter_to">To</label>
              <input id="filter_to" type="date"/>
            </div>
            <button type="submit" class="cta">Apply</button>
          </form>
        </section>
        <section class="section-card">
          <div id="jobsTableHost"></div>
        </section>
      </section>

      <section id="page_job_detail" style="display:none">
        <header style="display:flex; justify-content:space-between; align-items:center; gap:12px">
          <div>
            <a href="/admin/jobs" style="text-decoration:none; color: rgba(15, 23, 42, 0.7)">← Back to jobs</a>
            <h2 style="margin: 8px 0 4px 0;">Job</h2>
            <div class="mono" id="job_id">—</div>
          </div>
          <div style="display:flex; gap: 10px; align-items: center;">
            <button id="job_cancel_btn" class="cta secondary" onclick="cancelJob(parseJobIdFromPath())">Cancel</button>
            <span id="job_status" class="status-pill">—</span>
          </div>
        </header>

        <section class="summary-grid">
          <div class="section-card">
            <h3>Run summary</h3>
            <div id="job_summary"></div>
          </div>
          <div class="section-card">
            <h3>Cost & usage</h3>
            <div id="job_usage"></div>
          </div>
        </section>

        <section class="section-card">
          <h3>Waterfall</h3>
          <div id="job_waterfall"></div>
          <style>
            .wf { display:flex; flex-direction: column; gap: 10px; }
            .wf-row { display:grid; grid-template-columns: 160px 1fr 90px; gap: 12px; align-items: center; }
            .wf-label { font-size: 13px; color: rgba(15,23,42,0.8); }
            .wf-track { position: relative; height: 14px; border-radius: 999px; background: rgba(15,23,42,0.06); overflow: hidden; }
            .wf-bar { position:absolute; top:0; bottom:0; border-radius: 999px; background: #0f172a; opacity: 0.92; }
            .wf-meta { font-size: 12px; color: rgba(15,23,42,0.55); text-align: right; }
          </style>
        </section>

        <section class="section-card">
          <h3>Profiles (Progressive)</h3>
          <div id="job_progressive_profiles"></div>
        </section>

        <section class="section-card">
          <h3>Profiles (Final)</h3>
          <div id="job_final_profiles"></div>
        </section>

        <section class="section-card">
          <h3>Params</h3>
          <pre class="code" id="job_params"></pre>
        </section>

        <section class="section-card">
          <h3>Meta</h3>
          <pre class="code" id="job_meta"></pre>
        </section>

        <section class="section-card">
          <h3>Error</h3>
          <pre class="code" id="job_error"></pre>
        </section>

        <section class="section-card">
          <h3>External calls</h3>
          <pre class="code" id="job_calls"></pre>
        </section>

        <section class="section-card">
          <h3>Artifacts</h3>
          <pre class="code" id="job_artifacts"></pre>
        </section>

        <section class="section-card">
          <h3>Events</h3>
          <pre class="code" id="job_events"></pre>
        </section>

        <section class="section-card">
          <h3>Events (Live tail)</h3>
          <pre class="code" id="job_events_live"></pre>
        </section>
      </section>

      <section id="page_usage" style="display:none">
        <section class="section-card">
          <h2>Usage</h2>
          <form class="filter-bar" onsubmit="event.preventDefault(); loadUsage();">
            <div class="filter-field">
              <label for="usage_key">API Key ID</label>
              <input id="usage_key" type="number" placeholder="optional"/>
            </div>
            <div class="filter-field">
              <label for="usage_from">From</label>
              <input id="usage_from" type="date"/>
            </div>
            <div class="filter-field">
              <label for="usage_to">To</label>
              <input id="usage_to" type="date"/>
            </div>
            <button type="submit" class="cta">Apply</button>
          </form>
        </section>
        <section class="section-card">
          <div id="usageHost"></div>
        </section>
      </section>

      <section id="page_keys" style="display:none">
        <section class="section-card">
          <h2>API keys</h2>
          <div class="filter-bar" style="grid-template-columns: 1fr auto auto;">
            <div class="filter-field" style="grid-column: 1 / span 1;">
              <label for="newKeyName">New key name</label>
              <input id="newKeyName" placeholder="key name"/>
            </div>
            <button class="cta" onclick="createKey()">Create</button>
            <button class="cta secondary" onclick="loadKeys()">Refresh</button>
          </div>
        </section>
        <section class="section-card">
          <div id="keysHost"></div>
        </section>
      </section>
    </main>
  </div>

  <main class="admin-shell" id="login" style="display:none">
    <div class="section-card">
      <p class="admin-eyebrow">Admin Console</p>
      <h1 style="margin:0">Login</h1>
      <p class="admin-subtitle">Enter admin key to start a session cookie.</p>
      <div style="display:flex; gap:10px; margin-top:12px; align-items:center;">
        <input id="adminKey" type="password" placeholder="X-Admin-Key" style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(15,23,42,.1)"/>
        <button class="cta" onclick="login()">Login</button>
      </div>
    </div>
  </main>
</body>
</html>`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ok = 0;
  for (let i = 0; i < a.length; i++) ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ok === 0;
}

function verifyAdminKey(raw: string): boolean {
  const configuredHash = process.env.INFLUENCER_SCOUT_ADMIN_KEY_HASH;
  const configuredRaw = process.env.INFLUENCER_SCOUT_ADMIN_KEY;
  if (configuredRaw) return constantTimeEqual(raw, configuredRaw);
  if (!configuredHash) return false;
  // Hashing logic matches middleware/admin-auth.ts
  const pepper = process.env.ADMIN_KEY_PEPPER || process.env.API_KEY_PEPPER || '';
  const hash = createHash('sha256').update(`${pepper}:${raw}`).digest('hex');
  return constantTimeEqual(hash, configuredHash);
}

export async function handleAdminPage(_req: Request, res: Response) {
  res.status(200).type('html').send(renderShell());
}

async function getOrCreateInternalAdminApiKeyId(): Promise<number> {
  // Deterministic internal key hash so jobs show up with a stable api_key_id.
  const internalRaw = 'internal:admin';
  const keyHash = hashApiKeyForStorage(internalRaw);
  const res = await dbQuery<{ id: string }>(
    `INSERT INTO api_keys (name, key_hash, rate_rps, burst)
     VALUES ('admin', $1, 100, 200)
     ON CONFLICT (key_hash) DO UPDATE SET name = EXCLUDED.name
     RETURNING id::text`,
    [keyHash]
  );
  return Number(res.rows[0]?.id ?? '0');
}

export async function handleAdminLogin(req: Request, res: Response) {
  const key = String(req.body?.admin_key || '').trim();
  if (!key) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'admin_key required' });
    return;
  }
  if (!verifyAdminKey(key)) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid admin key' });
    return;
  }
  const session = makeAdminSessionCookie();
  res.cookie?.('openclaw_admin', session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: session.maxAge * 1000,
    path: '/admin',
  });
  res.json({ status: 'ok' });
}

export async function handleAdminOverview(_req: Request, res: Response) {
  const jobsRes = await dbQuery<{ total: string; completed: string }>(
    `SELECT count(*)::text as total,
            count(*) FILTER (WHERE status = 'completed')::text as completed
       FROM pipeline_jobs
      WHERE created_at >= now() - interval '24 hours'`
  );
  const total = Number(jobsRes.rows[0]?.total ?? '0');
  const completed = Number(jobsRes.rows[0]?.completed ?? '0');
  const successRate = total > 0 ? (completed / total) : 0;

  const p95Res = await dbQuery<{ p95: number | null }>(
    `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at))) AS p95
       FROM pipeline_jobs
      WHERE created_at >= now() - interval '24 hours'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL`
  );
  const p95 = p95Res.rows[0]?.p95 ?? null;

  const costRes = await dbQuery<{ cost: string | null }>(
    `SELECT COALESCE(sum(cost_usd), 0)::text as cost
       FROM external_calls
      WHERE ts >= now() - interval '24 hours'`
  );
  const cost = Number(costRes.rows[0]?.cost ?? '0');

  const queue = getPipelineQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

  res.json({
    jobs_last_24h: total,
    success_rate_last_24h: `${Math.round(successRate * 100)}%`,
    p95_duration_s: p95 ? Math.round(p95) : null,
    cost_usd_last_24h: cost ? cost.toFixed(4) : '0.0000',
    queue: counts,
  });
}

export async function handleAdminJobs(req: Request, res: Response) {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || '50')));
  const offset = Math.max(0, Number(req.query.offset || '0'));
  const status = req.query.status ? String(req.query.status) : undefined;
  const apiKeyId = req.query.api_key_id ? Number(req.query.api_key_id) : undefined;
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const jobs = await listJobs({ limit, offset, status, apiKeyId, from, to });
  res.json({ jobs });
}

export async function handleAdminJob(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const job = await getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'JOB_NOT_FOUND' });
    return;
  }
  res.json(job);
}

export async function handleAdminJobArtifact(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const kind = String(req.params.kind || '').trim();
  const allowed = new Set(['final', 'progressive', 'candidates', 'remaining', 'timing']);
  if (!allowed.has(kind)) {
    res.status(400).json({ error: 'INVALID_KIND' });
    return;
  }
  const art = await getArtifact(jobId, kind);
  if (!art) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(art.data);
}

export async function handleAdminJobEvents(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const after = req.query.after ? Number(req.query.after) : 0;
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit || '500')));
  const events = await listEvents(jobId, { afterId: after, limit });
  res.json({ job_id: jobId, events });
}

export async function handleAdminJobEventsStream(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const afterParam = String(req.query.after || '').trim();
  const afterId = afterParam ? Number(afterParam) : 0;
  const lastEventIdHeader = String(req.header('last-event-id') || '').trim();
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : NaN;
  let cursor = Number.isFinite(lastEventId) ? lastEventId : (Number.isFinite(afterId) ? afterId : 0);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let closed = false;
  const close = () => {
    closed = true;
    try { res.end(); } catch {}
  };
  req.on('close', close);

  res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  while (!closed) {
    const events = await listEvents(jobId, { afterId: cursor, limit: 200 });
    for (const ev of events) {
      cursor = ev.id;
      res.write(`id: ${ev.id}\n`);
      res.write(`event: job_event\n`);
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    if (events.length === 0) {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function handleAdminJobArtifacts(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const artifacts = await listArtifactsForJob(jobId);
  res.json({ job_id: jobId, artifacts });
}

export async function handleAdminJobExternalCalls(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit || '500')));
  const calls = await dbQuery<any>(
    `SELECT id, job_id, api_key_id, service, operation, ts, duration_ms, status, cost_usd, meta
       FROM external_calls
      WHERE job_id = $1::uuid
      ORDER BY ts DESC
      LIMIT $2`,
    [jobId, limit]
  );
  res.json({ job_id: jobId, calls: calls.rows });
}

export async function handleAdminCancelJob(req: Request, res: Response) {
  const jobId = req.params.jobId;
  const job = await getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'JOB_NOT_FOUND' });
    return;
  }
  if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
    res.status(409).json({ error: 'NOT_CANCELLABLE', status: job.status });
    return;
  }
  await updateJob(jobId, { cancel_requested: true });
  await appendEvent(jobId, 'info', 'cancel_requested', { source: 'admin' });
  res.json({ status: 'ok', job_id: jobId });
}

const adminWeaviateSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(10).optional().default(10),
  min_followers: z.number().int().min(0).optional(),
  max_followers: z.number().int().min(0).optional(),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  exclude_profile_urls: z.array(z.string()).optional(),
  alphas: z.array(z.number().min(0).max(1)).optional(),
});

function extractCandidates(results: any[], topN: number, platform?: string | null) {
  const candidates: any[] = [];
  for (const result of results) {
    if (candidates.length >= topN) break;
    const profileUrl = result.data?.profile_url || result.profile_url || result.url;
    const profilePlatform = result.data?.platform || result.platform;
    if (platform && profilePlatform && String(profilePlatform).toLowerCase() !== String(platform).toLowerCase()) {
      continue;
    }
    if (profileUrl && (String(profileUrl).includes('instagram.com') || String(profileUrl).includes('tiktok.com'))) {
      candidates.push({
        id: result.id || result.uuid || '',
        score: result.score || result.metadata?.score,
        distance: result.distance || result.metadata?.distance,
        profile_url: profileUrl,
        platform: profilePlatform,
        display_name: result.data?.display_name,
        biography: result.data?.biography,
        followers: typeof result.data?.followers === 'number' ? result.data.followers : undefined,
      });
    }
  }
  return candidates;
}

export async function handleAdminWeaviateSearch(req: Request, res: Response) {
  const parsed = adminWeaviateSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({ error: 'VALIDATION_ERROR', details: errors });
    return;
  }
  const input = parsed.data;
  if (input.min_followers !== undefined && input.max_followers !== undefined && input.min_followers > input.max_followers) {
    res.status(400).json({ error: 'INVALID_FOLLOWER_BOUNDS' });
    return;
  }
  const alphas = (input.alphas && input.alphas.length ? input.alphas : [0.2, 0.5, 0.8]).slice(0, 5);
  const result = await performParallelHybridSearches(
    [input.query],
    alphas,
    input.top_k,
    input.min_followers ?? null,
    input.max_followers ?? null,
    input.platform ?? null,
    undefined,
    undefined,
    input.exclude_profile_urls ?? null
  );
  const candidates = extractCandidates(result.deduplicatedResults, input.top_k, input.platform ?? null);
  res.json({
    query: input.query,
    candidates,
    meta: {
      total_runtime_ms: result.totalRuntimeMs,
      queries_executed: result.queriesExecuted,
      deduplicated_count: result.deduplicatedResults.length,
    },
  });
}

const adminPipelineStartSchema = z.object({
  business_description: z.string().min(1),
  top_n: z.number().int().min(1).max(10).optional().default(10),
  weaviate_top_n: z.number().int().min(10).max(500).optional(),
  llm_top_n: z.number().int().min(1).max(10).optional(),
  min_followers: z.number().int().min(0).optional(),
  max_followers: z.number().int().min(0).optional(),
  platform: z.enum(['instagram', 'tiktok']).optional(),
  exclude_profile_urls: z.array(z.string()).optional(),
  strict_location_matching: z.boolean().optional().default(false),
});

export async function handleAdminPipelineStart(req: Request, res: Response) {
  const parsed = adminPipelineStartSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
    res.status(400).json({ error: 'VALIDATION_ERROR', details: errors });
    return;
  }
  const data = parsed.data;
  if (data.min_followers !== undefined && data.max_followers !== undefined && data.min_followers > data.max_followers) {
    res.status(400).json({ error: 'INVALID_FOLLOWER_BOUNDS' });
    return;
  }

  const topN = data.top_n;
  const weaviateTopN = data.weaviate_top_n ?? Math.max(topN * 10, 50);
  const llmTopN = data.llm_top_n ?? topN;
  if (weaviateTopN < topN) {
    res.status(400).json({ error: 'INVALID_WEAVIATE_TOP_N' });
    return;
  }
  if (llmTopN > weaviateTopN) {
    res.status(400).json({ error: 'INVALID_LLM_TOP_N' });
    return;
  }

  const apiKeyId = await getOrCreateInternalAdminApiKeyId();
  const jobId = randomUUID();
  const requestId = `admin_req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const params = {
    business_description: data.business_description,
    top_n: topN,
    weaviate_top_n: weaviateTopN,
    llm_top_n: llmTopN,
    min_followers: data.min_followers ?? null,
    max_followers: data.max_followers ?? null,
    platform: data.platform ?? null,
    exclude_profile_urls: data.exclude_profile_urls ?? null,
    strict_location_matching: data.strict_location_matching ?? false,
    request_id: requestId,
  };

  await createJob({
    jobId,
    apiKeyId,
    params,
    meta: { completed_stages: [], current_stage: null },
  });
  await appendEvent(jobId, 'info', 'job_created', { request_id: requestId, api_key_id: apiKeyId, source: 'admin' });

  const queue = getPipelineQueue();
  await queue.add('pipeline:run', { job_id: jobId, api_key_id: apiKeyId, ...params }, { jobId });

  res.status(202).json({ job_id: jobId, status: 'accepted' });
}

export async function handleAdminUsage(req: Request, res: Response) {
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const apiKeyId = req.query.api_key_id ? Number(req.query.api_key_id) : null;

  const params: any[] = [];
  const where: string[] = [];
  let idx = 1;
  if (from) { where.push(`ts >= $${idx++}::timestamptz`); params.push(from); }
  if (to) { where.push(`ts <= $${idx++}::timestamptz`); params.push(to); }
  if (apiKeyId) { where.push(`api_key_id = $${idx++}`); params.push(apiKeyId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await dbQuery<any>(
    `SELECT date_trunc('day', ts) AS day,
            api_key_id,
            count(*)::int AS calls,
            COALESCE(sum(cost_usd), 0) AS cost_usd
       FROM external_calls
      ${whereSql}
      GROUP BY day, api_key_id
      ORDER BY day DESC, api_key_id ASC`,
    params
  );
  res.json({ rows: rows.rows });
}

export async function handleAdminQueue(_req: Request, res: Response) {
  const queue = getPipelineQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  res.json({ queue: counts });
}

export async function handleAdminKeys(_req: Request, res: Response) {
  const keys = await listApiKeys();
  res.json({ keys: keys.map((k) => ({ ...k, key_hash: k.key_hash.slice(0, 10) + '...' })) });
}

export async function handleAdminCreateKey(req: Request, res: Response) {
  const name = String(req.body?.name || 'key').trim() || 'key';
  const apiKey = `isc_${randomBytes(24).toString('hex')}`;
  const keyHash = hashApiKeyForStorage(apiKey);
  const row = await createApiKeyRow({ name, keyHash });
  logger.info('api_key_created', { id: row.id, name: row.name });
  res.json({ id: row.id, name: row.name, api_key: apiKey });
}

export async function handleAdminRevokeKey(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  await revokeApiKey(id);
  res.json({ status: 'ok' });
}
