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

export interface MarketItem {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  signal: 'Comprar' | 'Vender' | 'Manter';
  decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR';
  decisionLabel: string;
  grahamPrice?: number;
  grahamMargin?: number;
  bazinPrice?: number;
  bazinMargin?: number;
  dividendYield?: number;
  dividends12m?: number;
  priceEarnings?: number; // P/L
  priceToBook?: number;   // P/VP
  lpa?: number;
  vpa?: number;
  logourl?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  shortName?: string;
  longName?: string;
  updatedAt: string;
}

// In-memory cache for market quotes (10 min TTL)
const quotesCache = new Map<string, { item: MarketItem; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

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

function calculateValuation(ticker: string, price: number, rawData: any): Partial<MarketItem> {
  const isFii = ticker.endsWith('11') && !['BOVA11', 'SMAL11', 'IVVB11', 'HASH11'].includes(ticker);
  
  // Dividends in last 12m
  let dividends12m = 0;
  if (Array.isArray(rawData.dividendsData?.cashDividends)) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    dividends12m = rawData.dividendsData.cashDividends
      .filter((d: any) => new Date(d.paymentDate || d.approvedOn || Date.now()) >= oneYearAgo)
      .reduce((acc: number, d: any) => acc + Number(d.rate || 0), 0);
  }
  if (!dividends12m && typeof rawData.dividends12m === 'number') {
    dividends12m = rawData.dividends12m;
  }

  const dividendYield = price > 0 && dividends12m > 0 ? (dividends12m / price) * 100 : 0;
  
  // Bazin Ceiling Price (DY minimum 6% per year: Dividends / 0.06)
  let bazinPrice: number | undefined;
  let bazinMargin: number | undefined;
  if (dividends12m > 0) {
    bazinPrice = Math.round((dividends12m / 0.06) * 100) / 100;
    bazinMargin = price > 0 ? Math.round(((bazinPrice - price) / price) * 1000) / 10 : undefined;
  }

  // Graham Fair Price: V = sqrt(22.5 * LPA * VPA)
  let grahamPrice: number | undefined;
  let grahamMargin: number | undefined;
  const lpa = Number(rawData.earningsPerShare || rawData.lpa || 0);
  const vpa = Number(rawData.bookValuePerShare || rawData.vpa || 0);

  if (lpa > 0 && vpa > 0 && !isFii) {
    const rawGraham = Math.sqrt(22.5 * lpa * vpa);
    if (!isNaN(rawGraham) && isFinite(rawGraham)) {
      grahamPrice = Math.round(rawGraham * 100) / 100;
      grahamMargin = price > 0 ? Math.round(((grahamPrice - price) / price) * 1000) / 10 : undefined;
    }
  }

  // Determine Thermometer Decision
  let decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' = 'MANTER';
  let decisionLabel = 'Neutro / Manter';

  if (isFii) {
    if (bazinMargin !== undefined && bazinMargin >= 15) {
      decision = 'COMPRA_FORTE';
      decisionLabel = 'Compra Forte (Alto Yield)';
    } else if (bazinMargin !== undefined && bazinMargin >= 0) {
      decision = 'COMPRA';
      decisionLabel = 'Preço Atrativo';
    } else if (bazinMargin !== undefined && bazinMargin >= -10) {
      decision = 'MANTER';
      decisionLabel = 'Preço Justo';
    } else {
      decision = 'AGUARDAR';
      decisionLabel = 'Acima do Teto';
    }
  } else {
    // Stocks
    if ((grahamMargin !== undefined && grahamMargin >= 25) || (bazinMargin !== undefined && bazinMargin >= 15 && (grahamMargin ?? 0) >= 0)) {
      decision = 'COMPRA_FORTE';
      decisionLabel = 'Compra Forte (Grande Desconto)';
    } else if ((grahamMargin !== undefined && grahamMargin >= 5) || (bazinMargin !== undefined && bazinMargin >= 5)) {
      decision = 'COMPRA';
      decisionLabel = 'Oportunidade de Compra';
    } else if ((grahamMargin !== undefined && grahamMargin >= -15) || (bazinMargin !== undefined && bazinMargin >= -10)) {
      decision = 'MANTER';
      decisionLabel = 'Preço Equilibrado';
    } else if (grahamMargin !== undefined && grahamMargin < -15) {
      decision = 'AGUARDAR';
      decisionLabel = 'Aguardar Correção';
    }
  }

  const signal: 'Comprar' | 'Vender' | 'Manter' = 
    decision === 'COMPRA_FORTE' || decision === 'COMPRA' ? 'Comprar' :
    decision === 'AGUARDAR' ? 'Vender' : 'Manter';

  return {
    signal,
    decision,
    decisionLabel,
    grahamPrice,
    grahamMargin,
    bazinPrice,
    bazinMargin,
    dividendYield: Math.round(dividendYield * 100) / 100,
    dividends12m: Math.round(dividends12m * 100) / 100,
    lpa: lpa || undefined,
    vpa: vpa || undefined,
    priceEarnings: Number(rawData.priceEarnings || 0) || undefined,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'private, max-age=300');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const auth = await verifySession(req, res, getPool());
  if (!auth) return;

  let tickers: string[] = [];
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    tickers = (url.searchParams.get('tickers') || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  } else {
    const body = req.body || {};
    tickers = Array.isArray(body.tickers) ? body.tickers.map((t: any) => String(t).trim().toUpperCase()).filter(Boolean) : [];
  }

  if (tickers.length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: 'tickers_required' }));
    return;
  }

  const results: Record<string, MarketItem> = {};
  const tickersToFetch: string[] = [];
  const now = Date.now();

  for (const t of tickers) {
    const cached = quotesCache.get(t);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      results[t] = cached.item;
    } else {
      tickersToFetch.push(t);
    }
  }

  // Handle crypto or currencies via AwesomeAPI if needed
  const cryptoTickers = tickersToFetch.filter(t => ['BTC', 'ETH', 'SOL', 'USD', 'EUR'].includes(t));
  const b3Tickers = tickersToFetch.filter(t => !cryptoTickers.includes(t));

  if (cryptoTickers.length > 0) {
    try {
      const cryptoMap: Record<string, string> = { BTC: 'BTC-BRL', ETH: 'ETH-BRL', USD: 'USD-BRL', EUR: 'EUR-BRL' };
      const pairs = cryptoTickers.map(c => cryptoMap[c] || `${c}-BRL`).join(',');
      const rawAwesome = await httpGet(`https://economia.awesomeapi.com.br/last/${pairs}`, 5000);
      const dataAwesome = JSON.parse(rawAwesome);

      for (const c of cryptoTickers) {
        const pairKey = (cryptoMap[c] || `${c}-BRL`).replace('-', '');
        const d = dataAwesome[pairKey];
        if (d) {
          const price = Number(d.bid || d.ask || 0);
          const changePercent = Number(d.pctChange || 0);
          const change = Number(d.varBid || 0);
          const item: MarketItem = {
            ticker: c,
            price,
            change,
            changePercent,
            signal: changePercent < -3 ? 'Comprar' : 'Manter',
            decision: changePercent < -3 ? 'COMPRA' : 'MANTER',
            decisionLabel: changePercent < -3 ? 'Oportunidade (Dip)' : 'Manter',
            updatedAt: new Date().toISOString(),
          };
          quotesCache.set(c, { item, ts: now });
          results[c] = item;
        }
      }
    } catch (e: any) {
      console.warn('[MarketData] AwesomeAPI fetch error:', e.message);
    }
  }

  // Chunk B3 tickers in groups of 10 for Brapi API
  const token = process.env.BRAPI_TOKEN ? `?token=${encodeURIComponent(process.env.BRAPI_TOKEN)}&fundamental=true&dividends=true` : '?fundamental=true&dividends=true';
  const chunkSize = 10;

  for (let i = 0; i < b3Tickers.length; i += chunkSize) {
    const chunk = b3Tickers.slice(i, i + chunkSize);
    try {
      const brapiUrl = `https://brapi.dev/api/quote/${chunk.join(',')}${token}`;
      const raw = await httpGet(brapiUrl, 6000);
      const json = JSON.parse(raw);

      if (Array.isArray(json.results)) {
        for (const item of json.results) {
          const symbol = String(item.symbol || '').toUpperCase();
          const price = Number(item.regularMarketPrice || 0);
          const change = Number(item.regularMarketChange || 0);
          const changePercent = Number(item.regularMarketChangePercent || 0);

          const valuation = calculateValuation(symbol, price, item);

          const marketItem: MarketItem = {
            ticker: symbol,
            price,
            change,
            changePercent: Math.round(changePercent * 100) / 100,
            signal: valuation.signal || 'Manter',
            decision: valuation.decision || 'MANTER',
            decisionLabel: valuation.decisionLabel || 'Manter',
            grahamPrice: valuation.grahamPrice,
            grahamMargin: valuation.grahamMargin,
            bazinPrice: valuation.bazinPrice,
            bazinMargin: valuation.bazinMargin,
            dividendYield: valuation.dividendYield,
            dividends12m: valuation.dividends12m,
            priceEarnings: valuation.priceEarnings,
            lpa: valuation.lpa,
            vpa: valuation.vpa,
            logourl: item.logourl,
            fiftyTwoWeekHigh: item.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: item.fiftyTwoWeekLow,
            shortName: item.shortName,
            longName: item.longName,
            updatedAt: new Date().toISOString(),
          };

          quotesCache.set(symbol, { item: marketItem, ts: now });
          results[symbol] = marketItem;
        }
      }
    } catch (e: any) {
      console.warn(`[MarketData] Brapi fetch error for [${chunk.join(',')}]:`, e.message);
      // Fallback for unreached tickers
      for (const t of chunk) {
        if (!results[t]) {
          const fallbackItem: MarketItem = {
            ticker: t,
            price: 0,
            change: 0,
            changePercent: 0,
            signal: 'Manter',
            decision: 'MANTER',
            decisionLabel: 'Cotação Indisponível',
            updatedAt: new Date().toISOString(),
          };
          results[t] = fallbackItem;
        }
      }
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    data: results,
    timestamp: now,
  }));
}
