import https from 'https';
import http from 'http';
import { Pool } from 'pg';
import { verifySession } from '../_auth_shared';

let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
};

function httpGet(url: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'GestorFinanceiro/1.0', 'Accept': 'application/json' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'private, max-age=900');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const auth = await verifySession(req, res, getPool());
  if (!auth) return;

  const url = new URL(req.url, `http://localhost`);
  const tickers = (url.searchParams.get('tickers') || '').split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean);

  if (tickers.length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: 'tickers required' }));
    return;
  }

  const token = process.env.BRAPI_TOKEN;
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';

  // BRAPI free tier: max 10 tickers per request
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 10) chunks.push(tickers.slice(i, i + 10));

  const allDividends: any[] = [];

  for (const chunk of chunks) {
    try {
      const apiUrl = `https://brapi.dev/api/quote/${chunk.join(',')}${tokenQuery}${tokenQuery ? '&' : '?'}dividends=true`;
      const body = await httpGet(apiUrl);
      const json = JSON.parse(body);
      const results = json?.results || [];

      results.forEach((item: any) => {
        const symbol = (item.symbol || '').toUpperCase();
        const cashDivs: any[] = item?.dividendsData?.cashDividends || [];
        cashDivs.forEach((d: any) => {
          allDividends.push({
            ticker: symbol,
            label: d.label || 'DIVIDENDO',
            paymentDate: d.paymentDate || d.date || '',
            rate: parseFloat(d.rate ?? d.value ?? '0') || 0,
          });
        });
      });
    } catch { /* skip chunk */ }
  }

  // Sort by paymentDate DESC
  allDividends.sort((a, b) => (b.paymentDate > a.paymentDate ? 1 : -1));

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, dividends: allDividends }));
}
