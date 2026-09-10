import { Pool } from 'pg';
import { verifySession } from './_auth_shared';

const UPSTREAMS: Record<string, string> = {
  brapi: 'https://brapi.dev',
  stooq: 'https://stooq.com',
  awesome: 'https://economia.awesomeapi.com.br',
  coingecko: 'https://api.coingecko.com',
  yahoo: 'https://query1.finance.yahoo.com',
};

const CACHE_TTL_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const cache = new Map<string, { body: string; contentType: string; expiresAt: number }>();
const requests = new Map<string, number[]>();
let pool: Pool | null = null;

const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
};

const isAllowedPath = (source: string, path: string) => {
  if (!path.startsWith('/') || path.includes('..') || /%2e/i.test(path)) return false;
  if (source === 'brapi') return /^\/api\/(quote\/[^/?]+|v2\/crypto)$/.test(path);
  if (source === 'stooq') return path === '/q/l/';
  if (source === 'awesome') return /^\/json\/last\/(USD-BRL|USD-BRL,EUR-BRL,BTC-BRL)$/.test(path);
  if (source === 'coingecko') return path === '/api/v3/simple/price';
  if (source === 'yahoo') return path === '/v7/finance/quote';
  return false;
};

const isRateLimited = (userId: string, source: string) => {
  const key = `${userId}:${source}`;
  const now = Date.now();
  const recent = (requests.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    requests.set(key, recent);
    return true;
  }
  recent.push(now);
  requests.set(key, recent);
  return false;
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  // Identifica o usuário por token ou por IP para rate-limiting
  let clientIdentifier = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'public_client';
  try {
    const authHeader = req.headers?.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const auth = await verifySession(req, { statusCode: 200, setHeader: () => {}, end: () => {} }, getPool());
      if (auth?.userId) clientIdentifier = auth.userId;
    }
  } catch {}

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const source = String(url.searchParams.get('src') || '').toLowerCase();
    const requestPath = String(url.searchParams.get('path') || '');
    const upstream = UPSTREAMS[source];
    if (!upstream || !isAllowedPath(source, requestPath)) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_market_request' }));
      return;
    }
    if (isRateLimited(clientIdentifier, source)) {
      res.statusCode = 429;
      res.setHeader('Retry-After', '60');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'rate_limited' }));
      return;
    }

    const target = new URL(upstream + requestPath);
    url.searchParams.forEach((value, key) => {
      if (key !== 'src' && key !== 'path' && key !== 'token' && key.length <= 32 && value.length <= 512) {
        target.searchParams.set(key, value);
      }
    });
    if (source === 'brapi') {
      const brapiToken = process.env.BRAPI_TOKEN || 'nywRh48qY7qMZ2aPjBARn1';
      target.searchParams.set('token', brapiToken);
    }

    const cacheKey = target.toString().replace(/([?&])token=[^&]*/u, '$1token=redacted');
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.statusCode = 200;
      res.setHeader('content-type', cached.contentType);
      res.setHeader('cache-control', 'private, max-age=60');
      res.setHeader('x-cache', 'HIT');
      res.end(cached.body);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const upstreamResponse = await fetch(target, { headers: { accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timeout);
    const body = await upstreamResponse.text();
    if (body.length > 1_000_000) throw new Error('upstream_response_too_large');
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
    if (upstreamResponse.ok) cache.set(cacheKey, { body, contentType, expiresAt: Date.now() + CACHE_TTL_MS });

    res.statusCode = upstreamResponse.status;
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'private, max-age=60');
    res.setHeader('x-cache', 'MISS');
    res.end(body);
  } catch (error: any) {
    console.error('Market proxy failed:', error?.message);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'market_provider_unavailable' }));
  }
}
