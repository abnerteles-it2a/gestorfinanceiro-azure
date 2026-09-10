import https from 'https';
import http from 'http';

export type AssetClass = 'STOCK' | 'FII' | 'CRYPTO' | 'CURRENCY' | 'OTHER';

export interface MarketItem {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  assetClass: AssetClass;
  signal: 'Comprar' | 'Vender' | 'Manter';
  decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR';
  decisionLabel: string;
  
  // Equity specific (Ações)
  grahamPrice?: number | null;
  grahamMargin?: number | null;
  bazinPrice?: number | null;
  bazinMargin?: number | null;

  // Real Estate specific (FIIs)
  fiiCeilingPrice?: number | null;
  fiiMargin?: number | null;
  pvp?: number | null;

  // Crypto specific
  drawdownFromAthPct?: number | null;
  maxRecommendedWeightPct?: number;

  // Shared fundamental metrics
  dividendYield?: number | null;
  dividends12m?: number | null;
  priceEarnings?: number | null; // P/L
  lpa?: number | null;
  vpa?: number | null;
  logourl?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  shortName?: string;
  longName?: string;
  currency?: string;
  updatedAt: string;
  valuation: {
    recommendation: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' | 'DESCONHECIDO';
    grahamValue?: number | null;
    bazinPrice?: number | null;
    fiiCeilingPrice?: number | null;
    pvp?: number | null;
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

export function detectAssetClass(ticker: string): AssetClass {
  const t = ticker.toUpperCase().trim();
  if (['BTC', 'ETH', 'SOL', 'BTCBRL', 'ETHBRL', 'SOLBRL', 'XRP', 'ADA', 'BNB'].includes(t) || /(BTC|ETH|SOL|USDT|USDC)/i.test(t)) {
    return 'CRYPTO';
  }
  if (['USD', 'EUR', 'USDBRL', 'EURBRL'].includes(t)) {
    return 'CURRENCY';
  }
  // US REITs list (Valuation via P/FFO & Spread, not Graham)
  const usReits = ['O', 'VNQ', 'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'SPG', 'DLR', 'WELL', 'AVB', 'EQR', 'STAG', 'MPW', 'AGNC', 'NLY', 'VICI'];
  if (usReits.includes(t)) {
    return 'FII';
  }
  const broadEtfs = ['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11', 'GOLD11', 'DIVO11', 'BBSD11', 'SPXI11', 'BRAX11'];
  if (t.endsWith('11') && !broadEtfs.includes(t)) {
    return 'FII';
  }
  return 'STOCK';
}

function calculateSpecializedValuation(
  ticker: string,
  price: number,
  assetClass: AssetClass,
  rawData: any = {},
  high52w?: number
): Partial<MarketItem> {
  // ─── 1. CRIPTOMOEDAS ────────────────────────────────────────────────────────
  if (assetClass === 'CRYPTO') {
    const changePercent = Number(rawData.changePercent || 0);
    const drawdown = high52w && high52w > 0 && price > 0 ? Math.round(((price - high52w) / high52w) * 1000) / 10 : null;

    let decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' = 'MANTER';
    let decisionLabel = 'Fase de Acúmulo Gradual (DCA)';

    if (changePercent <= -7 || (drawdown !== null && drawdown <= -40)) {
      decision = 'COMPRA_FORTE';
      decisionLabel = 'Oportunidade de Acúmulo Relevante (Correção Forte)';
    } else if (changePercent <= -3 || (drawdown !== null && drawdown <= -20)) {
      decision = 'COMPRA';
      decisionLabel = 'Aporte Pontual em Correção (Dip)';
    } else if (changePercent >= 8 || (drawdown !== null && drawdown >= -3)) {
      decision = 'AGUARDAR';
      decisionLabel = 'Aguardar Arrefecimento / Zona de Euforia';
    }

    const signal: 'Comprar' | 'Vender' | 'Manter' = decision === 'COMPRA_FORTE' || decision === 'COMPRA' ? 'Comprar' : decision === 'AGUARDAR' ? 'Vender' : 'Manter';

    return {
      assetClass: 'CRYPTO',
      signal,
      decision,
      decisionLabel,
      drawdownFromAthPct: drawdown,
      maxRecommendedWeightPct: 5,
      grahamPrice: null,
      grahamMargin: null,
      bazinPrice: null,
      bazinMargin: null,
      fiiCeilingPrice: null,
      fiiMargin: null,
      pvp: null,
      dividendYield: null,
      dividends12m: null,
    };
  }

  // ─── 2. FUNDOS IMOBILIÁRIOS (FIIs) ──────────────────────────────────────────
  if (assetClass === 'FII') {
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
    // FII benchmark estimate if dividends not delivered (~10% a.a.)
    if (!dividends12m && price > 0) {
      dividends12m = price * 0.10;
    }

    const dividendYield = price > 0 && dividends12m > 0 ? (dividends12m / price) * 100 : 0;

    // FII Ceiling Price (Spread sobre NTN-B: Taxa de retorno requerida = 8.75% a.a.)
    // Fórmula de Teto de FII: Dividendo_12m / 0.0875
    let fiiCeilingPrice: number | null = null;
    let fiiMargin: number | null = null;
    if (dividends12m > 0) {
      fiiCeilingPrice = Math.round((dividends12m / 0.0875) * 100) / 100;
      fiiMargin = price > 0 ? Math.round(((fiiCeilingPrice - price) / price) * 1000) / 10 : null;
    }

    // P/VP (Preço / Valor Patrimonial)
    const vpa = Number(rawData.bookValuePerShare || rawData.vpa || 0);
    let pvp: number | null = null;
    if (vpa > 0 && price > 0) {
      pvp = Math.round((price / vpa) * 100) / 100;
    } else if (typeof rawData.priceToBook === 'number' && rawData.priceToBook > 0) {
      pvp = Math.round(rawData.priceToBook * 100) / 100;
    } else if (price > 0) {
      // Benchmark padrão se não constar laudo patrimonial
      pvp = 0.98;
    }

    let decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' = 'MANTER';
    let decisionLabel = 'Preço Justo Patrimonial';

    if (pvp !== null && pvp <= 0.95 && dividendYield >= 9.0) {
      decision = 'COMPRA_FORTE';
      decisionLabel = 'Desconto Patrimonial (P/VP < 0.95) & Alto Yield';
    } else if (pvp !== null && pvp <= 1.02 && fiiMargin !== null && fiiMargin >= 0) {
      decision = 'COMPRA';
      decisionLabel = 'Preço Atrativo (Abaixo do Teto FII)';
    } else if (pvp !== null && pvp <= 1.06) {
      decision = 'MANTER';
      decisionLabel = 'Preço Justo / Faixa de Equilíbrio';
    } else {
      decision = 'AGUARDAR';
      decisionLabel = 'Ágio Patrimonial Excessivo (P/VP > 1.06)';
    }

    const signal: 'Comprar' | 'Vender' | 'Manter' = decision === 'COMPRA_FORTE' || decision === 'COMPRA' ? 'Comprar' : decision === 'AGUARDAR' ? 'Vender' : 'Manter';

    return {
      assetClass: 'FII',
      signal,
      decision,
      decisionLabel,
      fiiCeilingPrice,
      fiiMargin,
      pvp,
      dividendYield: Math.round(dividendYield * 100) / 100,
      dividends12m: Math.round(dividends12m * 100) / 100,
      vpa: vpa || null,
      // Strictly disable Graham and Stock Bazin for FIIs
      grahamPrice: null,
      grahamMargin: null,
      bazinPrice: null,
      bazinMargin: null,
      drawdownFromAthPct: null,
    };
  }

  // ─── 3. AÇÕES (EQUITIES) ────────────────────────────────────────────────────
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

  // Bazin clássico para ações (6% ao ano)
  let bazinPrice: number | null = null;
  let bazinMargin: number | null = null;
  if (dividends12m > 0) {
    bazinPrice = Math.round((dividends12m / 0.06) * 100) / 100;
    bazinMargin = price > 0 ? Math.round(((bazinPrice - price) / price) * 1000) / 10 : null;
  }

  // Graham para ações: V = sqrt(22.5 * LPA * VPA)
  let grahamPrice: number | null = null;
  let grahamMargin: number | null = null;
  const lpa = Number(rawData.earningsPerShare || rawData.lpa || 0);
  const vpa = Number(rawData.bookValuePerShare || rawData.vpa || 0);

  if (lpa > 0 && vpa > 0) {
    const rawGraham = Math.sqrt(22.5 * lpa * vpa);
    if (!isNaN(rawGraham) && isFinite(rawGraham)) {
      grahamPrice = Math.round(rawGraham * 100) / 100;
      grahamMargin = price > 0 ? Math.round(((grahamPrice - price) / price) * 1000) / 10 : null;
    }
  }

  let decision: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' = 'MANTER';
  let decisionLabel = 'Preço Equilibrado';

  if ((grahamMargin !== null && grahamMargin >= 25) || (bazinMargin !== null && bazinMargin >= 15 && (grahamMargin ?? 0) >= 0)) {
    decision = 'COMPRA_FORTE';
    decisionLabel = 'Compra Forte (Desconto Graham / Bazin)';
  } else if ((grahamMargin !== null && grahamMargin >= 5) || (bazinMargin !== null && bazinMargin >= 5)) {
    decision = 'COMPRA';
    decisionLabel = 'Oportunidade de Compra (Margem de Segurança)';
  } else if ((grahamMargin !== null && grahamMargin >= -15) || (bazinMargin !== null && bazinMargin >= -10)) {
    decision = 'MANTER';
    decisionLabel = 'Preço Equilibrado / Manter Posição';
  } else if (grahamMargin !== null && grahamMargin < -15) {
    decision = 'AGUARDAR';
    decisionLabel = 'Aguardar Correção (Acima do Justo)';
  }

  const signal: 'Comprar' | 'Vender' | 'Manter' = decision === 'COMPRA_FORTE' || decision === 'COMPRA' ? 'Comprar' : decision === 'AGUARDAR' ? 'Vender' : 'Manter';

  return {
    assetClass: 'STOCK',
    signal,
    decision,
    decisionLabel,
    grahamPrice,
    grahamMargin,
    bazinPrice,
    bazinMargin,
    fiiCeilingPrice: null,
    fiiMargin: null,
    pvp: vpa > 0 ? Math.round((price / vpa) * 100) / 100 : null,
    dividendYield: Math.round(dividendYield * 100) / 100,
    dividends12m: Math.round(dividends12m * 100) / 100,
    lpa: lpa || null,
    vpa: vpa || null,
    priceEarnings: Number(rawData.priceEarnings || 0) || null,
    drawdownFromAthPct: null,
  };
}

// Fetch single ticker from Yahoo v8 Chart API (supports B3 and US Stocks/REITs)
async function fetchYahooV8(ticker: string): Promise<{ price: number; change: number; changePercent: number; shortName?: string; high52w?: number; currency?: string } | null> {
  try {
    const t = ticker.toUpperCase().trim();
    const isB3 = /\d{1,2}$/.test(t) || t.endsWith('.SA');
    const sym = isB3 ? (t.endsWith('.SA') ? t : `${t}.SA`) : t;
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
        shortName: meta.shortName || meta.symbol || ticker,
        high52w: meta.fiftyTwoWeekHigh || undefined,
        currency: meta.currency || (isB3 ? 'BRL' : 'USD'),
      };
    }
  } catch (err: any) {
    console.warn(`[MarketData] Yahoo v8 chart error for ${ticker}:`, err.message);
  }
  return null;
}

// Fetch crypto quote via CoinGecko, Binance, or AwesomeAPI with high reliability
const geckoIdMap: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  LINK: 'chainlink'
};

async function fetchCryptoQuote(ticker: string): Promise<{ price: number; change: number; changePercent: number; high52w?: number } | null> {
  const norm = ticker.toUpperCase().replace(/BRL$/, '');

  // 1. Try CoinGecko
  const geckoId = geckoIdMap[norm];
  if (geckoId) {
    try {
      const raw = await httpGet(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=brl&include_24hr_change=true`, {}, 3500);
      const json = JSON.parse(raw);
      if (json[geckoId] && Number(json[geckoId].brl) > 0) {
        const price = Number(json[geckoId].brl);
        const changePercent = Number(json[geckoId].brl_24h_change || 0);
        return {
          price,
          change: Math.round(((price * changePercent) / 100) * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          high52w: price * 1.05
        };
      }
    } catch {}
  }

  // 2. Try Binance
  try {
    const raw = await httpGet(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(norm)}BRL`, {}, 3500);
    const json = JSON.parse(raw);
    if (json && Number(json.lastPrice) > 0) {
      return {
        price: Number(json.lastPrice),
        change: Number(json.priceChange || 0),
        changePercent: Number(json.priceChangePercent || 0),
        high52w: Number(json.highPrice || json.lastPrice)
      };
    }
  } catch {}

  // 3. Try AwesomeAPI fallback
  try {
    const pair = `${norm}-BRL`;
    const raw = await httpGet(`https://economia.awesomeapi.com.br/last/${encodeURIComponent(pair)}`, {}, 3500);
    const json = JSON.parse(raw);
    const key = `${norm}BRL`;
    const d = json[key];
    if (d && Number(d.bid || d.ask) > 0) {
      const price = Number(d.bid || d.ask);
      return {
        price,
        change: Number(d.varBid || 0),
        changePercent: Number(d.pctChange || 0),
        high52w: Number(d.high || price)
      };
    }
  } catch {}

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

  // Handle crypto or currencies
  const cryptoTickers = tickersToFetch.filter(t => detectAssetClass(t) === 'CRYPTO' || detectAssetClass(t) === 'CURRENCY');
  const b3Tickers = tickersToFetch.filter(t => !cryptoTickers.includes(t));

  if (cryptoTickers.length > 0) {
    await Promise.all(cryptoTickers.map(async (c) => {
      try {
        const q = await fetchCryptoQuote(c);
        const aClass = detectAssetClass(c);
        const price = q && q.price > 0 ? q.price : (c === 'BTC' ? 400000 : c === 'ETH' ? 12500 : c === 'SOL' ? 520 : 100);
        const change = q ? q.change : 0;
        const changePercent = q ? q.changePercent : 0;
        const high = q ? q.high52w : price * 1.05;

        const val = calculateSpecializedValuation(c, price, aClass, { changePercent }, high);

        const item: MarketItem = {
          ticker: c,
          price,
          change,
          changePercent,
          assetClass: aClass,
          signal: val.signal || 'Manter',
          decision: val.decision || 'MANTER',
          decisionLabel: val.decisionLabel || 'Fase de Acúmulo',
          drawdownFromAthPct: val.drawdownFromAthPct,
          maxRecommendedWeightPct: val.maxRecommendedWeightPct || 5,
          grahamPrice: null,
          grahamMargin: null,
          bazinPrice: null,
          bazinMargin: null,
          fiiCeilingPrice: null,
          fiiMargin: null,
          pvp: null,
          dividendYield: null,
          dividends12m: null,
          updatedAt: new Date().toISOString(),
          valuation: {
            recommendation: val.decision || 'MANTER',
            safetyMarginPct: val.drawdownFromAthPct,
            reason: val.decisionLabel || 'Ativo de alta volatilidade. Exposição máxima sugerida: 2% a 5% da carteira.'
          }
        };
        quotesCache.set(c, { item, ts: now });
        results[c] = item;
      } catch (e: any) {
        console.warn(`[MarketData] Crypto fetch error for ${c}:`, e.message);
      }
    }));
  }

  // Handle B3 Tickers
  if (b3Tickers.length > 0) {
    await Promise.all(b3Tickers.map(async (ticker) => {
      const aClass = detectAssetClass(ticker);
      let quote = await fetchYahooV8(ticker);
      let brapiData: any = {};

      try {
        const token = process.env.BRAPI_TOKEN || 'nywRh48qY7qMZ2aPjBARn1';
        let rawBrapi = await httpGet(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}&fundamental=true`, {}, 4000);
        let bJson: any = null;
        try { bJson = JSON.parse(rawBrapi); } catch {}
        if (!bJson?.results?.[0]) {
          rawBrapi = await httpGet(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`, {}, 4000);
          try { bJson = JSON.parse(rawBrapi); } catch {}
        }
        if (Array.isArray(bJson?.results) && bJson.results[0]) {
          brapiData = bJson.results[0];
          if (!quote && brapiData.regularMarketPrice > 0) {
            quote = {
              price: Number(brapiData.regularMarketPrice),
              change: Number(brapiData.regularMarketChange || 0),
              changePercent: Number(brapiData.regularMarketChangePercent || 0),
              shortName: brapiData.shortName,
              high52w: brapiData.fiftyTwoWeekHigh,
              currency: brapiData.currency || 'BRL'
            };
          }
        }
      } catch {}

      if (quote && quote.price > 0) {
        const val = calculateSpecializedValuation(ticker, quote.price, aClass, brapiData, quote.high52w);
        const item: MarketItem = {
          ticker,
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          currency: quote.currency || brapiData.currency || 'BRL',
          assetClass: aClass,
          signal: val.signal || 'Manter',
          decision: val.decision || 'MANTER',
          decisionLabel: val.decisionLabel || 'Preço Equilibrado',
          grahamPrice: val.grahamPrice,
          grahamMargin: val.grahamMargin,
          bazinPrice: val.bazinPrice,
          bazinMargin: val.bazinMargin,
          fiiCeilingPrice: val.fiiCeilingPrice,
          fiiMargin: val.fiiMargin,
          pvp: val.pvp,
          dividendYield: val.dividendYield,
          dividends12m: val.dividends12m,
          priceEarnings: val.priceEarnings,
          lpa: val.lpa,
          vpa: val.vpa,
          drawdownFromAthPct: val.drawdownFromAthPct,
          logourl: brapiData.logourl,
          shortName: quote.shortName || brapiData.shortName,
          longName: brapiData.longName,
          updatedAt: new Date().toISOString(),
          valuation: {
            recommendation: val.decision || 'MANTER',
            grahamValue: val.grahamPrice ?? null,
            bazinPrice: val.bazinPrice ?? null,
            fiiCeilingPrice: val.fiiCeilingPrice ?? null,
            pvp: val.pvp ?? null,
            safetyMarginPct: aClass === 'FII' ? (val.fiiMargin ?? null) : (val.bazinMargin ?? val.grahamMargin ?? null),
            reason: val.decisionLabel || 'Preço Equilibrado'
          }
        };
        quotesCache.set(ticker, { item, ts: now });
        results[ticker] = item;
      } else {
        results[ticker] = {
          ticker,
          price: 0,
          change: 0,
          changePercent: 0,
          assetClass: aClass,
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
