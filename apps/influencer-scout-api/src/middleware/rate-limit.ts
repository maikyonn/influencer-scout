import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../queue/redis.js';
import { apiKeyFromReq } from './api-auth.js';

const LUA_TOKEN_BUCKET = `
-- KEYS[1] bucket key
-- ARGV[1] now_ms
-- ARGV[2] rate_per_sec
-- ARGV[3] burst
-- Returns: {allowed, tokens_after}
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then tokens = burst end
if ts == nil then ts = now end

local delta = math.max(0, now - ts) / 1000.0
local refill = delta * rate
tokens = math.min(burst, tokens + refill)

local allowed = 0
if tokens >= 1.0 then
  allowed = 1
  tokens = tokens - 1.0
end

redis.call("HMSET", key, "tokens", tokens, "ts", now)
redis.call("PEXPIRE", key, 600000) -- 10 minutes

return { allowed, tokens }
`;

export function rateLimit(options?: { scope?: string }) {
  const scope = options?.scope ?? 'global';
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = apiKeyFromReq(req);
    const redis = getRedis();
    const key = `rl:${apiKey.id}:${scope}`;
    const now = Date.now();
    const rate = Math.max(0.1, Number(apiKey.rate_rps || 2));
    const burst = Math.max(1, Number(apiKey.burst || 10));

    const out = (await redis.eval(
      LUA_TOKEN_BUCKET,
      1,
      key,
      String(now),
      String(rate),
      String(burst)
    )) as unknown as [number, number];

    const allowed = Number(out?.[0] ?? 0) === 1;
    const tokensAfter = Number(out?.[1] ?? 0);
    res.setHeader('X-RateLimit-Scope', scope);
    res.setHeader('X-RateLimit-Remaining', Math.floor(tokensAfter).toString());

    if (!allowed) {
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests' });
      return;
    }

    next();
  };
}

