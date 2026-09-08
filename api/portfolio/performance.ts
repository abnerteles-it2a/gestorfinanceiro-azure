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

function httpGet(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const req = mod.get(parsedUrl, {
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

// ─── BRAPI: portfolio tickers only ───────────────────────────────────────────
async function fetchBrapiHistorical(
  tickers: string[],
  token: string | undefined
): Promise<Record<string, { date: string; close: number }[]>> {
  const result: Record<string, { date: string; close: number }[]> = {};
  const CHUNK = 6; // smaller chunk = more stable on free tier

  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    const url = new URL(`https://brapi.dev/api/quote/${chunk.join(',')}`);
    url.searchParams.set('range', '1y');
    url.searchParams.set('interval', '1mo');
    if (token) url.searchParams.set('token', token);

    try {
      const body = await httpGet(url.toString());
      const json = JSON.parse(body);
      const results: any[] = json?.results || [];

      results.forEach((item: any) => {
        const sym = (item.symbol || '').toUpperCase().replace(/\.SA$/i, '');
        const hist: any[] = item.historicalDataPrice || [];
        const series = hist
          .map((h: any) => {
            let dt = '';
            if (typeof h.date === 'number') {
              // +12h offset avoids UTC-midnight → wrong month
              dt = new Date(h.date * 1000 + 43200000).toISOString().slice(0, 7);
            } else if (typeof h.date === 'string') {
              dt = String(h.date).slice(0, 7);
            }
            const close = parseFloat(String(h.adjustedClose ?? h.close ?? 0));
            return { date: dt, close };
          })
          .filter(h => h.date && h.close > 0);

        if (series.length > 0) result[sym] = series;
      });
    } catch (e) {
      console.error('[performance] BRAPI portfolio error for chunk', chunk, String(e));
    }
  }
  return result;
}

// ─── BOVA11 fetched in its own isolated call ──────────────────────────────────
async function fetchIbovHistorical(token: string | undefined): Promise<{ date: string; close: number }[]> {
  const candidates = ['BOVA11', '^BVSP'];

  for (const ticker of candidates) {
    try {
      const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`);
      url.searchParams.set('range', '1y');
      url.searchParams.set('interval', '1mo');
      if (token) url.searchParams.set('token', token);

      const body = await httpGet(url.toString(), 8000);
      const json = JSON.parse(body);
      const item = (json?.results || [])[0];
      const hist: any[] = item?.historicalDataPrice || [];

      const series = hist
        .map((h: any) => {
          let dt = '';
          if (typeof h.date === 'number') dt = new Date(h.date * 1000 + 43200000).toISOString().slice(0, 7);
          else if (typeof h.date === 'string') dt = String(h.date).slice(0, 7);
          const close = parseFloat(String(h.adjustedClose ?? h.close ?? 0));
          return { date: dt, close };
        })
        .filter(h => h.date && h.close > 0);

      if (series.length > 0) {
        console.log(`[performance] IBOV proxy: ${ticker} → ${series.length} pts | ${series[0]?.date} → ${series[series.length - 1]?.date}`);
        return series;
      }
      console.warn(`[performance] ${ticker} returned ${hist.length} hist rows but 0 valid`);
    } catch (e) {
      console.warn(`[performance] IBOV ${ticker} failed:`, String(e));
    }
  }

  console.warn('[performance] IBOV historical data unavailable');
  return [];

}

// ─── BACEN SGS-4391 = CDI acumulado no mês (% ao mês) ────────────────────────
async function fetchCdiMonthly(): Promise<{ date: string; value: number }[]> {
  try {
    const end = new Date();
    const start = new Date(Date.now() - 400 * 24 * 3600 * 1000);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}%2F` +
      `${String(d.getMonth() + 1).padStart(2, '0')}%2F` +
      `${d.getFullYear()}`;

    const url =
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json` +
      `&dataInicial=${fmt(start)}&dataFinal=${fmt(end)}`;

    const body = await httpGet(url, 8000);
    const arr: any[] = JSON.parse(body);

    const result = arr
      .filter((d: any) => d.data && d.valor)
      .map((d: any) => {
        const parts = String(d.data).split('/'); // DD/MM/YYYY
        const monthKey = parts.length === 3 ? `${parts[2]}-${parts[1]}` : '';
        const value = parseFloat(String(d.valor).replace(',', '.'));
        return { date: monthKey, value };
      })
      .filter(d => d.date && !isNaN(d.value) && d.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (result.length > 0) {
      console.log(`[performance] CDI (SGS-4391): ${result.length} pts | ${result[0].date}=${result[0].value}%`);
      return result;
    }
    throw new Error('empty CDI result');
  } catch (e) {
    console.warn('[performance] CDI historical data unavailable:', String(e));
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'private, max-age=300');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const auth = await verifySession(req, res, getPool());
  if (!auth) return;

  const url = new URL(req.url, 'http://localhost');
  const tickers = (url.searchParams.get('tickers') || '')
    .split(',')
    .map((t: string) => t.trim().toUpperCase())
    .filter(Boolean);

  const token = process.env.BRAPI_TOKEN;
  console.log(`[performance] tickers=${tickers.join(',')} | token=${token ? 'YES' : 'NO'}`);

  // Portfolio + IBOV + CDI — IBOV in its own isolated call to avoid batch failures
  try {
    const [portfolioSeries, ibovSeries, cdiSeries] = await Promise.all([
      fetchBrapiHistorical(tickers, token),
      fetchIbovHistorical(token),
      fetchCdiMonthly(),
    ]);

    console.log(
      `[performance] done | portfolio=${Object.keys(portfolioSeries).join(',')}` +
      ` | ibov=${ibovSeries.length}pts | cdi=${cdiSeries.length}pts`
    );

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      portfolioSeries,
      ibovSeries,
      cdiSeries,
      provenance: {
        portfolio: { source: 'brapi', status: Object.keys(portfolioSeries).length ? 'live' : 'unavailable' },
        ibov: { source: 'brapi', status: ibovSeries.length ? 'live' : 'unavailable' },
        cdi: { source: 'bacen:SGS-4391', status: cdiSeries.length ? 'live' : 'unavailable' },
      },
    }));
  } catch (e) {
    console.error('[performance] Unhandled handler error:', String(e));
    // Always return a valid JSON response — frontend handles empty arrays gracefully
    const cdiSeries = await fetchCdiMonthly().catch(() => []);
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      portfolioSeries: {},
      ibovSeries: [],
      cdiSeries,
      provenance: {
        portfolio: { source: 'brapi', status: 'unavailable' },
        ibov: { source: 'brapi', status: 'unavailable' },
        cdi: { source: 'bacen:SGS-4391', status: cdiSeries.length ? 'live' : 'unavailable' },
      },
    }));
  }
}
