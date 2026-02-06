import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.ts';

describe('influencer-scout-api app', () => {
  beforeEach(() => {
    process.env.API_KEY_PEPPER = 'pepper';
    process.env.INFLUENCER_SCOUT_ADMIN_KEY = 'admin_test';
  });

  it('GET /health returns initializing when startup checks not ready', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.service).toBe('influencer-scout-api');
    expect(res.body.status).toBe('initializing');
  });

  it('GET / returns public docs HTML', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(String(res.header['content-type'] || '')).toMatch(/text\/html/);
    expect(res.text).toMatch(/Influencer Scout API/);
  });

  it('GET /openapi.yaml returns YAML', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).get('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/openapi:/);
  });

  it('POST /pipeline/start requires X-API-Key', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).post('/pipeline/start').send({ business_description: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('GET /admin/api/overview requires admin auth', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).get('/admin/api/overview');
    expect(res.status).toBe(401);
  });

  it('POST /admin/login sets a session cookie when admin key is valid', async () => {
    const app = createApp({ getStartupHealthCheck: () => null });
    const res = await request(app).post('/admin/login').send({ admin_key: 'admin_test' });
    expect(res.status).toBe(200);
    const setCookie = res.header['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(String(setCookie?.[0] || '')).toMatch(/openclaw_admin=/);
  });
});
