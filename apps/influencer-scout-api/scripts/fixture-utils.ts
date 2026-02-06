import fs from 'node:fs/promises';

export function parseDotEnv(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (!key) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export async function loadEnvFile(envPath: string): Promise<void> {
  const contents = await fs.readFile(envPath, 'utf8');
  const parsed = parseDotEnv(contents);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function isLikelyEmail(value: string): boolean {
  return /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(value);
}

function looksLikeInstagramUrl(value: string): boolean {
  return /instagram\.com/i.test(value);
}

function looksLikeTikTokUrl(value: string): boolean {
  return /tiktok\.com/i.test(value);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function sanitizeForFixture(input: unknown): unknown {
  const igUrlMap = new Map<string, string>();
  const ttUrlMap = new Map<string, string>();
  const handleMap = new Map<string, string>();
  let igCount = 0;
  let ttCount = 0;
  let handleCount = 0;
  let idCount = 0;

  const sanitizeString = (value: string, keyPath: string[]): string => {
    // Never write secrets even if they accidentally appear in payloads.
    if (value.startsWith('sk-')) return '<redacted>';
    if (/bearer\s+/i.test(value)) return '<redacted>';

    if (isLikelyEmail(value)) return 'user@example.com';

    if (looksLikeInstagramUrl(value)) {
      const existing = igUrlMap.get(value);
      if (existing) return existing;
      const mapped = `https://instagram.com/example_user_${++igCount}/`;
      igUrlMap.set(value, mapped);
      return mapped;
    }

    if (looksLikeTikTokUrl(value)) {
      const existing = ttUrlMap.get(value);
      if (existing) return existing;
      const mapped = `https://tiktok.com/@example_user_${++ttCount}`;
      ttUrlMap.set(value, mapped);
      return mapped;
    }

    const key = (keyPath[keyPath.length - 1] || '').toLowerCase();

    // Normalize identity-ish fields so fixtures don't contain real handles/names.
    if (['account', 'account_id', 'nickname', 'profile_name', 'full_name', 'display_name'].includes(key)) {
      const existing = handleMap.get(value);
      if (existing) return existing;
      const mapped = `example_user_${++handleCount}`;
      handleMap.set(value, mapped);
      return mapped;
    }

    if (key.includes('id') && value.length > 8) {
      return `id_${++idCount}`;
    }

    if (looksLikeUrl(value)) return 'https://example.com/redacted';

    // Keep short strings; truncate very long blobs to keep fixtures readable.
    if (value.length > 500) return `${value.slice(0, 200)}…<truncated>`;
    return value;
  };

  const walk = (value: unknown, keyPath: string[]): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeString(value, keyPath);
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      return value.slice(0, 25).map((v, i) => walk(v, [...keyPath, String(i)]));
    }

    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Avoid including any key-like fields if present.
        if (/(api[_-]?key|access[_-]?token|authorization)/i.test(k)) {
          out[k] = '<redacted>';
          continue;
        }
        out[k] = walk(v, [...keyPath, k]);
      }
      return out;
    }

    return value;
  };

  return walk(input, []);
}

