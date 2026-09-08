import https from 'https';
import http from 'http';

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
  valuation: {
    recommendation: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' | 'DESCONHECIDO';
    grahamValue?: number | null;
    bazinPrice?: number | null;
    safetyMarginPct?: number | null;
    reason: string;
  };
}

// In-memory cache for market quotes (10 min TTL)
const quotesCache = new Map<string, { item: MarketItem; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function httpGet(url: string, headers: Record<string, string> = {}, timeoutMs = 7000): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...headers
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, headers, timeoutMs).then(resolve).catch(reject);
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

function calculateValuation(ticker: string, price: number, rawData: any = {}): {
  signal: 'Comprar' | 'Vender' | 'Manter';
  decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR';
  decisionLabel: string;
  grahamPrice?: number;
  grahamMargin?: number;
  bazinPrice?: number;
  bazinMargin?: number;
  dividendYield?: number;
  dividends12m?: number;
  priceEarnings?: number;
  lpa?: number;
  vpa?: number;
} {
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
  // Standard benchmark estimate if dividends not delivered by quote endpoint
  if (!dividends12m && price > 0) {
    if (isFii) {
      // Average Brazilian FII DY benchmark ~10.5% a.a.
      dividends12m = price * 0.105;
    }
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

// Fetch single ticker from Yahoo v8 Chart API (Resilient, 100% Free, B3 Stocks & FIIs)
async function fetchYahooV8(ticker: string): Promise<{ price: number; change: number; changePercent: number; shortName?: string } | null> {
  try {
    const sym = ticker.toUpperCase().endsWith('.SA') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.SA`;
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const raw = await httpGet(url, {}, 6000);
    const json = JSON.parse(raw);
    const meta = json.chart?.result?.[0]?.meta;
    if (meta && meta.regularMarketPrice > 0) {
      const price = Number(meta.regularMarketPrice);
      const prev = Number(meta.chartPreviousClose || meta.previousClose || price);
      const change = price - prev;
      const changePercent = prev > 0 ? (change / prev) * 100 : 0;
      return {
        price,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        shortName: meta.shortName || meta.symbol || ticker
      };
    }
  } catch (err: any) {
    console.warn(`[MarketData] Yahoo v8 chart error for ${ticker}:`, err.message);
  }
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=300');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  let tickers: string[] = [];
  if (req.method === 'GET') {
    const rawQueryTickers = req.query?.tickers || (req.url ? new URL(req.url, 'http://localhost').searchParams.get('tickers') : null);
    tickers = (rawQueryTickers || '').split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean);
  } else {
    const body = req.body || {};
    tickers = Array.isArray(body.tickers) ? body.tickers.map((t: any) => String(t).trim().toUpperCase()).filter(Boolean) : [];
  }

  if (tickers.length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: 'tickers_required' }));
    return;
  }

  const now = Date.now();
  const results: Record<string, MarketItem> = {};
  const tickersToFetch: string[] = [];

  for (const t of tickers) {
    const cached = quotesCache.get(t);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      results[t] = cached.item;
    } else {
      tickersToFetch.push(t);
    }
  }

  // Handle crypto or currencies via AwesomeAPI
  const cryptoTickers = tickersToFetch.filter(t => ['BTC', 'ETH', 'SOL', 'USD', 'EUR', 'BTCBRL', 'ETHBRL', 'USDBRL', 'EURBRL'].includes(t));
  const b3Tickers = tickersToFetch.filter(t => !cryptoTickers.includes(t));

  if (cryptoTickers.length > 0) {
    try {
      const cryptoMap: Record<string, string> = {
        BTC: 'BTC-BRL', ETH: 'ETH-BRL', SOL: 'SOL-BRL', USD: 'USD-BRL', EUR: 'EUR-BRL',
        BTCBRL: 'BTC-BRL', ETHBRL: 'ETH-BRL', USDBRL: 'USD-BRL', EURBRL: 'EUR-BRL'
      };
      const pairs = [...new Set(cryptoTickers.map(c => cryptoMap[c] || `${c}-BRL`))].join(',');
      const rawAwesome = await httpGet(`https://economia.awesomeapi.com.br/last/${pairs}`, {}, 5000);
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
            valuation: {
              recommendation: changePercent < -3 ? 'COMPRA' : 'MANTER',
              safetyMarginPct: changePercent,
              reason: changePercent < -3 ? 'Variação negativa diária relevante (Oportunidade de Acúmulo)' : 'Estabilidade intradiária'
            }
          };
          quotesCache.set(c, { item, ts: now });
          results[c] = item;
        }
      }
    } catch (e: any) {
      console.warn('[MarketData] AwesomeAPI fetch error:', e.message);
    }
  }

  // Handle B3 Tickers
  if (b3Tickers.length > 0) {
    await Promise.all(b3Tickers.map(async (ticker) => {
      let quote = await fetchYahooV8(ticker);
      let brapiData: any = {};

      // Attempt to complement with Brapi single ticker if possible
      try {
        const tokenQuery = process.env.BRAPI_TOKEN ? `?token=${encodeURIComponent(process.env.BRAPI_TOKEN)}&fundamental=true&dividends=true` : '';
        const rawBrapi = await httpGet(`https://brapi.dev/api/quote/${ticker}${tokenQuery}`, {}, 4000);
        const bJson = JSON.parse(rawBrapi);
        if (Array.isArray(bJson.results) && bJson.results[0]) {
          brapiData = bJson.results[0];
          if (!quote && brapiData.regularMarketPrice > 0) {
            quote = {
              price: Number(brapiData.regularMarketPrice),
              change: Number(brapiData.regularMarketChange || 0),
              changePercent: Number(brapiData.regularMarketChangePercent || 0),
              shortName: brapiData.shortName
            };
          }
        }
      } catch {}

      if (quote && quote.price > 0) {
        const valuation = calculateValuation(ticker, quote.price, brapiData);
        const item: MarketItem = {
          ticker,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          signal: valuation.signal,
          decision: valuation.decision,
          decisionLabel: valuation.decisionLabel,
          grahamPrice: valuation.grahamPrice,
          grahamMargin: valuation.grahamMargin,
          bazinPrice: valuation.bazinPrice,
          bazinMargin: valuation.bazinMargin,
          dividendYield: valuation.dividendYield,
          dividends12m: valuation.dividends12m,
          priceEarnings: valuation.priceEarnings,
          lpa: valuation.lpa,
          vpa: valuation.vpa,
          logourl: brapiData.logourl,
          shortName: quote.shortName || brapiData.shortName,
          longName: brapiData.longName,
          updatedAt: new Date().toISOString(),
          valuation: {
            recommendation: valuation.decision,
            grahamValue: valuation.grahamPrice ?? null,
            bazinPrice: valuation.bazinPrice ?? null,
            safetyMarginPct: valuation.bazinMargin ?? valuation.grahamMargin ?? null,
            reason: valuation.decisionLabel
          }
        };
        quotesCache.set(ticker, { item, ts: now });
        results[ticker] = item;
      } else {
        // Fallback placeholder if ticker completely unreachable
        const fallbackVal = calculateValuation(ticker, 0, {});
        results[ticker] = {
          ticker,
          price: 0,
          change: 0,
          changePercent: 0,
          signal: 'Manter',
          decision: 'MANTER',
          decisionLabel: 'Cotação Indisponível',
          updatedAt: new Date().toISOString(),
          valuation: {
            recommendation: 'DESCONHECIDO',
            reason: 'Ativo temporariamente indisponível'
          }
        };
      }
    }));
  }

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    data: results,
    timestamp: now,
  }));
}
