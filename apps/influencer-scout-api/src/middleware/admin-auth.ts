import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'admin-auth' });

function hashAdminKey(plain: string): string {
  const pepper = process.env.ADMIN_KEY_PEPPER || process.env.API_KEY_PEPPER || '';
  if (!pepper) logger.warn('admin_key_pepper_missing');
  return createHash('sha256').update(`${pepper}:${plain}`).digest('hex');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function signSession(payload: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.API_KEY_PEPPER || '';
  return createHash('sha256').update(`${secret}:${payload}`).digest('hex');
}

export function makeAdminSessionCookie(ttlSeconds = 12 * 60 * 60): { value: string; maxAge: number } {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = JSON.stringify({ exp });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = signSession(b64);
  return { value: `${b64}.${sig}`, maxAge: ttlSeconds };
}

function isValidSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const [b64, sig] = cookieValue.split('.');
  if (!b64 || !sig) return false;
  if (signSession(b64) !== sig) return false;
  try {
    const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return typeof decoded?.exp === 'number' && Date.now() < decoded.exp;
  } catch {
    return false;
  }
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  // Browser-friendly session cookie
  const cookies = parseCookies(req.header('cookie'));
  if (isValidSession(cookies['openclaw_admin'])) {
    next();
    return;
  }

  const configuredHash = process.env.INFLUENCER_SCOUT_ADMIN_KEY_HASH;
  const configuredRaw = process.env.INFLUENCER_SCOUT_ADMIN_KEY;

  if (!configuredHash && !configuredRaw) {
    res.status(500).json({ error: 'MISCONFIGURED', message: 'Admin key not configured' });
    return;
  }

  const raw = req.header('X-Admin-Key');
  if (!raw) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing X-Admin-Key' });
    return;
  }

  const candidateHash = configuredHash ? hashAdminKey(raw.trim()) : null;
  const ok = configuredHash ? candidateHash === configuredHash : raw.trim() === configuredRaw;

  if (!ok) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid admin key' });
    return;
  }

  next();
}

export function hashAdminKeyForStorage(raw: string): string {
  return hashAdminKey(raw);
}
