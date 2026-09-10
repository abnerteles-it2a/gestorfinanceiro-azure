
import { formatCurrency } from '../utils/formatters';
import { B3_FUNDAMENTAL_BENCHMARKS } from '../api/portfolio/market-data';

// Market data fetchers using public APIs


export interface MarketInfo {
    price: number;
    change: number;
    changePercent?: number;
    signal: 'Comprar' | 'Vender' | 'Manter';
    decision?: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR';
    decisionLabel?: string;
    grahamPrice?: number;
    grahamMargin?: number;
    bazinPrice?: number;
    bazinMargin?: number;
    dividendYield?: number;
    dividends12m?: number;
    priceEarnings?: number;
    priceToBook?: number;
    lpa?: number;
    vpa?: number;
    logourl?: string;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    shortName?: string;
    longName?: string;
    currency?: string;
    assetClass?: 'STOCK' | 'FII' | 'CRYPTO' | 'CURRENCY' | 'OTHER';
    fiiCeilingPrice?: number;
    fiiMargin?: number;
    pvp?: number;
    drawdownFromAthPct?: number;
    valuation?: {
        grahamValue?: number | null;
        bazinPrice?: number | null;
        fiiCeilingPrice?: number | null;
        pvp?: number | null;
        safetyMarginPct?: number | null;
        recommendation?: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' | 'DESCONHECIDO';
        reason?: string;
    };
}

export interface MarketData {
    [ticker: string]: MarketInfo;
}

export interface MarketDataResponse {
    data: MarketData;
    sources: { uri: string; title: string; }[];
}

// --- CACHING SYSTEM ---
const USD_RATE_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
let cachedUsdRate: number | null = null;
let lastUsdRateFetchTime = 0;

const TOP_MOVERS_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
let cachedTopMovers: MarketDataResponse | null = null;
let lastTopMoversFetchTime = 0;

const TICKER_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const tickerCache: Record<string, { data: MarketInfo, timestamp: number }> = {};
const BRAPI_MIN_INTERVAL = 15000;
let lastBrapiFetchTime = 0;
const sourceBlockUntil: Record<string, number> = {};
const isBlocked = (name: string) => {
    const until = sourceBlockUntil[name] || 0;
    return Date.now() < until;
};
const blockSource = (name: string, minutes: number) => {
    sourceBlockUntil[name] = Date.now() + minutes * 60 * 1000;
};

// Helper: Parse JSON safely
const parseJsonResponse = (text: string): any | null => {
    if (!text) return null;
    let resultText = text.trim();
    if (resultText.startsWith('```json')) {
        resultText = resultText.substring(7, resultText.length - 3).trim();
    } else if (resultText.startsWith('```')) {
        resultText = resultText.substring(3, resultText.length - 3).trim();
    }
    
    try {
        return JSON.parse(resultText);
    } catch (e) {
        console.warn("Initial JSON.parse failed. Attempting regex extraction.", { response: resultText });
        const jsonMatch = resultText.match(/(\[.*\]|\{.*\})/s);
        if (jsonMatch && jsonMatch[0]) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e2) {
                console.error("Failed to parse extracted JSON:", jsonMatch[0], e2);
                return null;
            }
        }
        return null;
    }
};

const fetchWithRetry = async (url: string, attempts = 3, timeoutMs = 4000, baseDelayMs = 350): Promise<Response> => {
    let lastErr: any = null;
    for (let i = 0; i < attempts; i++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const token = typeof window !== 'undefined' ? window.localStorage.getItem('gestor_financeiro_app_token') : null;
            const res = await fetch(url, {
                signal: ctrl.signal,
                headers: token && (url.startsWith('/proxy/') || url.includes('/api/proxy')) ? { Authorization: `Bearer ${token}` } : undefined,
            });
            clearTimeout(timer);
            if (!res.ok) {
                lastErr = new Error(`fetch not ok: ${res.status}`);
            } else {
                return res;
            }
        } catch (e) {
            clearTimeout(timer);
            lastErr = e;
        }
        const delay = baseDelayMs * Math.pow(2, i);
        await new Promise(r => setTimeout(r, delay));
    }
    throw lastErr || new Error('fetch failed');
};

const tryFetchText = async (url: string): Promise<string> => {
    const r = await fetchWithRetry(url);
    return await r.text();
};

const tryFetchJson = async (url: string): Promise<any> => {
    const firstUrl = url.startsWith('/proxy/') ? (rewriteToRemote(url) || url) : url;
    try {
        const res = await fetchWithRetry(firstUrl);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            try { return await res.json(); } catch {}
        }
        const text = await res.text();
        try { return JSON.parse(text); } catch {}
        const parsed = parseJsonResponse(text);
        if (parsed) return parsed;
    } catch (e) {
        const remote = rewriteToExternal(url);
        if (remote) {
            const res2 = await fetchWithRetry(remote);
            const ct2 = (res2.headers.get('content-type') || '').toLowerCase();
            if (ct2.includes('application/json')) {
                try { return await res2.json(); } catch {}
            }
            const text2 = await res2.text();
            try { return JSON.parse(text2); } catch {}
            const parsed2 = parseJsonResponse(text2);
            if (parsed2) return parsed2;
        }
        throw e;
    }
    // If we reached here without returning, attempt remote rewrite as last resort
    const remote = rewriteToExternal(url);
    if (remote) {
        const res2 = await fetchWithRetry(remote);
        const ct2 = (res2.headers.get('content-type') || '').toLowerCase();
        if (ct2.includes('application/json')) {
            try { return await res2.json(); } catch {}
        }
        const text2 = await res2.text();
        try { return JSON.parse(text2); } catch {}
        const parsed2 = parseJsonResponse(text2);
        if (parsed2) return parsed2;
    }
    throw new Error('json parse failed');
};

const getUsdToBrlRate = async (): Promise<number> => {
    if (cachedUsdRate !== null && (Date.now() - lastUsdRateFetchTime < USD_RATE_CACHE_DURATION)) {
        return cachedUsdRate;
    }
    try {
        const json = await tryFetchJson(`${AWESOME_BASE}/json/last/USD-BRL`);
        const bid = parseFloat(json?.USDBRL?.bid || json?.USDBRL?.ask || '0');
        if (!isNaN(bid) && bid > 0) {
            cachedUsdRate = bid;
            lastUsdRateFetchTime = Date.now();
            return bid;
        }
        return cachedUsdRate || 5.0;
    } catch (e) {
        console.error('Error fetching USD/BRL rate', e);
        return cachedUsdRate || 5.0;
    }
};

const isB3Ticker = (t: string) => /\d{1,2}$/.test(t) && /(3|4|5|6|11)$/.test(t);
const isCryptoTicker = (t: string) => ['BTC','ETH','ADA','DOGE','SOL','XRP','LTC','BNB','DOT','MATIC'].includes(t.toUpperCase());
const cryptoIdMap: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', ADA: 'cardano', DOGE: 'dogecoin', SOL: 'solana', XRP: 'ripple', LTC: 'litecoin', BNB: 'binancecoin', DOT: 'polkadot', MATIC: 'matic-network'
};
const getBrapiToken = (): string | undefined => {
    return undefined;
};

const BRAPI_BASE = '/proxy/brapi';
const STOOQ_BASE = '/proxy/stooq';
const AWESOME_BASE = '/proxy/awesome';
const COINGECKO_BASE = '/proxy/coingecko';
const YAHOO_BASE = '/proxy/yahoo';

const rewriteToRemote = (url: string): string | null => {
    if (!url.startsWith('/proxy/')) return null;
    const [path, query = ''] = url.split('?');
    const parts = path.split('/').filter(Boolean);
    const source = parts[1] || '';
    const remainder = '/' + parts.slice(2).join('/');
    const u = new URL('/api/proxy', window.location.origin);
    u.searchParams.set('src', source);
    u.searchParams.set('path', remainder);
    new URLSearchParams(query).forEach((value, key) => u.searchParams.set(key, value));
    return u.toString();
};

const rewriteToExternal = (_url: string): string | null => null;

export const getMarketData = async (tickers: string[], force: boolean = false): Promise<MarketDataResponse> => {
    if (!tickers || tickers.length === 0) return { data: {}, sources: [] };
    const isHosted = (() => { try { const h = window.location.hostname || ''; return !(/^(localhost|127\.0\.0\.1)$/i.test(h)); } catch { return true; } })();
    const disableYahoo = (() => { try { const ls = window.localStorage.getItem('gestor_financeiro_disable_yahoo'); if (ls && (ls === '1' || ls === 'true')) return true; } catch {} const ve = (import.meta as any)?.env?.VITE_DISABLE_YAHOO; const envDisabled = String(ve || '').trim() === '1'; return envDisabled || isHosted; })();
    const disableStooq = (() => { try { const ls = window.localStorage.getItem('gestor_financeiro_disable_stooq'); if (ls && (ls === '1' || ls === 'true')) return true; } catch {} const ve = (import.meta as any)?.env?.VITE_DISABLE_STOOQ; const envDisabled = String(ve || '').trim() === '1'; return envDisabled || isHosted; })();
    
    const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    const now = Date.now();
    const resultData: MarketData = {};
    const tickersToFetch: string[] = [];

    uniqueTickers.forEach(ticker => {
        const cached = tickerCache[ticker];
        if (!force && cached && (now - cached.timestamp < TICKER_CACHE_DURATION)) {
            resultData[ticker] = cached.data;
        } else {
            tickersToFetch.push(ticker);
        }
    });

    if (tickersToFetch.length === 0) {
        return { data: resultData, sources: [] };
    }

    // Primary: Call unified Azure backend endpoint /api/portfolio/market-data
    try {
        const token = typeof window !== 'undefined' ? (window.localStorage.getItem('auth_token') || window.localStorage.getItem('session_token') || '') : '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const backendRes = await fetch(`/api/portfolio/market-data?tickers=${encodeURIComponent(tickersToFetch.join(','))}`, {
            method: 'GET',
            headers
        });

        if (backendRes.ok) {
            const json = await backendRes.json();
            if (json && json.data && Object.keys(json.data).length > 0) {
                Object.entries(json.data).forEach(([t, item]: [string, any]) => {
                    if (item && item.price > 0) {
                        const info: MarketInfo = {
                            price: item.price,
                            change: item.change ?? 0,
                            changePercent: item.changePercent ?? 0,
                            signal: item.signal ?? 'Manter',
                            decision: item.decision,
                            decisionLabel: item.decisionLabel,
                            grahamPrice: item.grahamPrice,
                            grahamMargin: item.grahamMargin,
                            bazinPrice: item.bazinPrice,
                            bazinMargin: item.bazinMargin,
                            dividendYield: item.dividendYield,
                            dividends12m: item.dividends12m,
                            priceEarnings: item.priceEarnings,
                            priceToBook: item.priceToBook,
                            lpa: item.lpa,
                            vpa: item.vpa,
                            logourl: item.logourl,
                            fiftyTwoWeekHigh: item.fiftyTwoWeekHigh,
                            fiftyTwoWeekLow: item.fiftyTwoWeekLow,
                            shortName: item.shortName,
                            longName: item.longName,
                            assetClass: item.assetClass,
                            fiiCeilingPrice: item.fiiCeilingPrice,
                            fiiMargin: item.fiiMargin,
                            pvp: item.pvp,
                            drawdownFromAthPct: item.drawdownFromAthPct,
                            valuation: item.valuation
                        };
                        resultData[t] = info;
                        tickerCache[t] = { data: info, timestamp: now };
                    }
                });

                const remaining = tickersToFetch.filter(t => !resultData[t] || resultData[t].price === 0);
                if (remaining.length === 0) {
                    return {
                        data: resultData,
                        sources: [{ uri: '/api/portfolio/market-data', title: 'Azure Financial Market Data Engine (Brapi + Valuation)' }]
                    };
                }
            }
        }
    } catch (err) {
        console.warn('Backend market-data fetch failed, falling back to client fetchers:', err);
    }

    const b3 = tickersToFetch.filter(isB3Ticker);
    // Explicitly add ^BVSP to B3 if requested
    if (tickersToFetch.includes('^BVSP') && !b3.includes('^BVSP')) b3.push('^BVSP');
    if (tickersToFetch.includes('IBOV') && !b3.includes('IBOV')) b3.push('IBOV');

    const crypto = tickersToFetch.filter(isCryptoTicker);
    const intl = tickersToFetch.filter(t => !b3.includes(t) && !crypto.includes(t) && t !== 'USD');
    const isUsdRequested = tickersToFetch.includes('USD');

    const sources: { uri: string; title: string }[] = [];
    let usdRate = 1;
    if (intl.length > 0 || crypto.length > 0 || isUsdRequested) {
        usdRate = await getUsdToBrlRate();
        if (isUsdRequested) {
            resultData['USD'] = { price: usdRate, change: 0, signal: 'Manter' };
            sources.push({ uri: `${AWESOME_BASE}/json/last/USD-BRL`, title: 'AwesomeAPI USD/BRL' });
        }
    }

    // Fetch B3 via brapi; fallback single if bulk fails
    if (b3.length > 0) {
        if (isBlocked('brapi')) {
            b3.forEach(t => {
                const cached = tickerCache[t];
                if (cached) {
                    resultData[t] = cached.data;
                }
            });
        } else try {
            if (!force && Date.now() - lastBrapiFetchTime < BRAPI_MIN_INTERVAL) {
                b3.forEach(t => {
                    const cached = tickerCache[t];
                    if (cached) {
                        resultData[t] = cached.data;
                    }
                });
            } else {
                const url = `${brapiBase()}/api/quote/${b3.join(',')}`;
                const json = await tryFetchJson(url);
                const arr = json?.results || json?.result || [];
                arr.forEach((item: any) => {
                    const ticker = (item.symbol || item.ticker || '').toUpperCase();
                    let rawPrice: any;
                    if (/11$/.test(ticker)) {
                        rawPrice = (
                            item.regularMarketPrice ??
                            item.price ??
                            item.last ??
                            item.lastPrice ??
                            item.close ??
                            item.regularMarketPreviousClose
                        );
                    } else {
                        rawPrice = (
                            item.regularMarketPrice ??
                            item.price ??
                            item.close ??
                            item.regularMarketPreviousClose ??
                            item.last ??
                            item.lastPrice
                        );
                    }
                    const rawChange = (
                        item.regularMarketChange ??
                        item.change ??
                        item.difference ??
                        ((item.regularMarketPrice && item.regularMarketPreviousClose)
                            ? (item.regularMarketPrice - item.regularMarketPreviousClose)
                            : 0)
                    );
                    const price = parseFloat(String(rawPrice));
                    const change = parseFloat(String(rawChange));
                    if (ticker && !isNaN(price) && price > 0) {
                        const normTicker = ticker.toUpperCase();
                        const bench = B3_FUNDAMENTAL_BENCHMARKS[normTicker];
                        const isFii = normTicker.endsWith('11') || ['O', 'VNQ'].includes(normTicker);
                        const vpa = bench?.vpa || (isFii ? price : price / 1.25);
                        const lpa = bench?.lpa || (isFii ? 0 : price / 8.5);
                        const dividends12m = bench?.dividends12m || (price * (isFii ? 0.095 : 0.055));
                        const bazinPrice = dividends12m > 0 ? Math.round((dividends12m / 0.06) * 100) / 100 : undefined;
                        const bazinMargin = (bazinPrice && price > 0) ? Math.round(((bazinPrice - price) / price) * 1000) / 10 : undefined;
                        const grahamPrice = isFii ? vpa : (lpa > 0 && vpa > 0 ? Math.round(Math.sqrt(22.5 * lpa * vpa) * 100) / 100 : undefined);
                        const grahamMargin = (grahamPrice && price > 0) ? Math.round(((grahamPrice - price) / price) * 1000) / 10 : undefined;
                        const fiiCeilingPrice = isFii && dividends12m > 0 ? Math.round((dividends12m / 0.0875) * 100) / 100 : undefined;
                        const fiiMargin = (fiiCeilingPrice && price > 0) ? Math.round(((fiiCeilingPrice - price) / price) * 1000) / 10 : undefined;
                        const pvp = vpa > 0 ? Math.round((price / vpa) * 100) / 100 : undefined;

                        const info: MarketInfo = {
                            price,
                            change: isNaN(change) ? 0 : change,
                            changePercent: parseFloat(String(item.regularMarketChangePercent ?? 0)) || 0,
                            signal: 'Manter',
                            priceEarnings: parseFloat(String(item.priceEarnings ?? '')) || (lpa > 0 ? Math.round((price / lpa) * 10) / 10 : undefined),
                            logourl: item.logourl || undefined,
                            fiftyTwoWeekHigh: parseFloat(String(item.fiftyTwoWeekHigh ?? '')) || undefined,
                            fiftyTwoWeekLow: parseFloat(String(item.fiftyTwoWeekLow ?? '')) || undefined,
                            bazinPrice,
                            bazinMargin,
                            grahamPrice,
                            grahamMargin,
                            fiiCeilingPrice,
                            fiiMargin,
                            pvp,
                            vpa,
                            lpa,
                            dividends12m,
                            dividendYield: (dividends12m / price)
                        };
                        resultData[ticker] = info;
                        tickerCache[ticker] = { data: info, timestamp: now };
                    }
                });
                const missingAfterBulk = b3.filter(t => !resultData[t.toUpperCase()]);
                if (missingAfterBulk.length > 0) {
                    for (const t of missingAfterBulk) {
                        await new Promise(r => setTimeout(r, 350));
                        try {
                            const urlSingle = `${brapiBase()}/api/quote/${t}`;
                            const js = await tryFetchJson(urlSingle);
                            const item = (js?.results || js?.result || [])[0] || js;
                            if (item) {
                                const ticker = (item.symbol || item.ticker || t).toUpperCase();
                                const rawPrice = /11$/.test(ticker)
                                    ? (item.regularMarketPrice ?? item.price ?? item.last ?? item.lastPrice ?? item.close ?? item.regularMarketPreviousClose)
                                    : (item.regularMarketPrice ?? item.price ?? item.close ?? item.regularMarketPreviousClose ?? item.last ?? item.lastPrice);
                                const rawChange = (item.regularMarketChange ?? item.change ?? item.difference ?? 0);
                                const price = parseFloat(String(rawPrice));
                                const change = parseFloat(String(rawChange));
                                if (!isNaN(price) && price > 0) {
                                    const normTicker = ticker.toUpperCase();
                                    const bench = B3_FUNDAMENTAL_BENCHMARKS[normTicker];
                                    const isFii = normTicker.endsWith('11') || ['O', 'VNQ'].includes(normTicker);
                                    const vpa = bench?.vpa || (isFii ? price : price / 1.25);
                                    const lpa = bench?.lpa || (isFii ? 0 : price / 8.5);
                                    const dividends12m = bench?.dividends12m || (price * (isFii ? 0.095 : 0.055));
                                    const bazinPrice = dividends12m > 0 ? Math.round((dividends12m / 0.06) * 100) / 100 : undefined;
                                    const bazinMargin = (bazinPrice && price > 0) ? Math.round(((bazinPrice - price) / price) * 1000) / 10 : undefined;
                                    const grahamPrice = isFii ? vpa : (lpa > 0 && vpa > 0 ? Math.round(Math.sqrt(22.5 * lpa * vpa) * 100) / 100 : undefined);
                                    const grahamMargin = (grahamPrice && price > 0) ? Math.round(((grahamPrice - price) / price) * 1000) / 10 : undefined;
                                    const fiiCeilingPrice = isFii && dividends12m > 0 ? Math.round((dividends12m / 0.0875) * 100) / 100 : undefined;
                                    const fiiMargin = (fiiCeilingPrice && price > 0) ? Math.round(((fiiCeilingPrice - price) / price) * 1000) / 10 : undefined;
                                    const pvp = vpa > 0 ? Math.round((price / vpa) * 100) / 100 : undefined;

                                    const info: MarketInfo = {
                                        price,
                                        change: isNaN(change) ? 0 : change,
                                        changePercent: parseFloat(String(item.regularMarketChangePercent ?? 0)) || 0,
                                        signal: 'Manter',
                                        priceEarnings: parseFloat(String(item.priceEarnings ?? '')) || (lpa > 0 ? Math.round((price / lpa) * 10) / 10 : undefined),
                                        logourl: item.logourl || undefined,
                                        fiftyTwoWeekHigh: parseFloat(String(item.fiftyTwoWeekHigh ?? '')) || undefined,
                                        fiftyTwoWeekLow: parseFloat(String(item.fiftyTwoWeekLow ?? '')) || undefined,
                                        bazinPrice,
                                        bazinMargin,
                                        grahamPrice,
                                        grahamMargin,
                                        fiiCeilingPrice,
                                        fiiMargin,
                                        pvp,
                                        vpa,
                                        lpa,
                                        dividends12m,
                                        dividendYield: (dividends12m / price)
                                    };
                                    resultData[ticker] = info;
                                    tickerCache[ticker] = { data: info, timestamp: now };
                                }
                                sources.push({ uri: urlSingle, title: 'brapi.dev quote (single after bulk)' });
                            }
                        } catch (eSingle) {
                            console.error('Bulk missing single brapi failed', t, eSingle);
                        }
                    }
                }
                sources.push({ uri: url, title: 'brapi.dev quote' });
                lastBrapiFetchTime = Date.now();
            }
        } catch (e) {
            const msg = String(e || '');
            if (msg.includes('429')) blockSource('brapi', 5);
            // Do not block on 401; allow immediate fallbacks with proxy and token
            try {
                for (const t of b3) {
                    await new Promise(r => setTimeout(r, 500));
                    const url = `${brapiBase()}/api/quote/${t}`;
                    const json = await tryFetchJson(url);
                    const item = (json?.results || json?.result || [])[0] || json;
                    if (item) {
                        const ticker = (item.symbol || item.ticker || t).toUpperCase();
                        const rawPrice = /11$/.test(ticker)
                            ? (item.regularMarketPrice ?? item.price ?? item.last ?? item.lastPrice ?? item.close ?? item.regularMarketPreviousClose)
                            : (item.regularMarketPrice ?? item.price ?? item.close ?? item.regularMarketPreviousClose ?? item.last ?? item.lastPrice);
                        const rawChange = (item.regularMarketChange ?? item.change ?? item.difference ?? 0);
                        const price = parseFloat(String(rawPrice));
                        const change = parseFloat(String(rawChange));
                        if (!isNaN(price) && price > 0) {
                            const info: MarketInfo = { price, change: isNaN(change) ? 0 : change, signal: 'Manter' };
                            resultData[ticker] = info;
                            tickerCache[ticker] = { data: info, timestamp: now };
                        }
                        sources.push({ uri: url, title: 'brapi.dev quote (single)' });
                    }
                }
                lastBrapiFetchTime = Date.now();
            } catch (e2) {
                const msg2 = String(e2 || '');
                if (msg2.includes('429')) blockSource('brapi', 5);
                // Do not block on 401; token may be present via proxy
                console.error('Error fetching B3 quotes from brapi', e2);
            }
        }
    }

    // Fallback for any missing B3: try Stooq (.SA)
    const missingB3 = b3.filter(t => !resultData[t.toUpperCase()]);
    if (missingB3.length > 0 && !disableStooq && !isBlocked('stooq')) {
        try {
            const symbols = missingB3.map(t => `${t.toLowerCase()}.sa`).join(',');
            const url = `/proxy/stooq/q/l/?s=${encodeURIComponent(symbols)}&f=sd2t2ohlcv&h&e=json`;
            const sjson = await tryFetchJson(url);
            const list = Array.isArray(sjson?.symbols) ? sjson.symbols : (Array.isArray(sjson) ? sjson : []);
            list.forEach((it: any) => {
                const sym = String(it.symbol || it.code || '').toUpperCase();
                const ticker = sym.replace('.SA', '').replace('.sa', '');
                const close = parseFloat(String(it.close ?? it.c ?? 0));
                const open = parseFloat(String(it.open ?? it.o ?? 0));
                const change = (!isNaN(close) && !isNaN(open) && open > 0) ? (close - open) : 0;
                const price = close;
                if (ticker && !isNaN(price) && price > 0) {
                    const info: MarketInfo = { price, change, signal: 'Manter' };
                    resultData[ticker] = info;
                    tickerCache[ticker] = { data: info, timestamp: now };
                }
            });
        } catch (e) {
            console.error('Fallback Stooq for B3 failed', e);
        }
    }

    // Final fallback for missing B3: Yahoo Finance (.SA suffix)
    {
        const stillMissing = b3.filter(t => !resultData[t.toUpperCase()]);
        if (stillMissing.length > 0 && !disableYahoo) {
            if (!isBlocked('yahoo')) {
                try {
                    const symbols = stillMissing.map(t => `${t}.SA`).join(',');
                    const url = `/proxy/yahoo/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
                    const yjson = await tryFetchJson(url);
                    const list = (yjson?.quoteResponse?.result) || [];
                    list.forEach((q: any) => {
                        const sym = String(q.symbol || '').toUpperCase();
                        const ticker = sym.replace('.SA', '');
                        const rawPrice = (
                            q.regularMarketPrice ??
                            q.postMarketPrice ??
                            q.preMarketPrice ??
                            q.bid ??
                            q.ask ??
                            q.regularMarketPreviousClose
                        );
                        const rawChange = (
                            q.regularMarketChange ??
                            ((q.regularMarketPrice && q.regularMarketPreviousClose) ? (q.regularMarketPrice - q.regularMarketPreviousClose) : 0)
                        );
                        const price = parseFloat(String(rawPrice));
                        const change = parseFloat(String(rawChange));
                        if (ticker && !isNaN(price) && price > 0) {
                            const info: MarketInfo = { price, change: isNaN(change) ? 0 : change, signal: 'Manter' };
                            resultData[ticker] = info;
                            tickerCache[ticker] = { data: info, timestamp: now };
                        }
                    });
                    sources.push({ uri: url, title: 'Yahoo Finance quote' });
                } catch (e) {
                    const msg = String(e || '');
                    if (msg.includes('401')) blockSource('yahoo', 10);
                    console.error('Fallback Yahoo for B3 failed', e);
                }
            }
        }
    }

    // Fetch Crypto via brapi; fallback to CoinGecko on error
    if (crypto.length > 0) {
        try {
            for (const c of crypto) {
                const url = `${brapiBase()}/api/v2/crypto?coin=${c}&currency=BRL`;
                const json = await tryFetchJson(url);
                const coin = json?.coins?.[0];
                const price = parseFloat(coin?.regularMarketPrice ?? '0');
                if (!isNaN(price) && price > 0) {
                    const info: MarketInfo = { price, change: parseFloat(coin?.regularMarketChange ?? '0') || 0, signal: 'Manter' };
                    resultData[c.toUpperCase()] = info;
                    tickerCache[c.toUpperCase()] = { data: info, timestamp: now };
                }
                sources.push({ uri: url, title: 'brapi.dev crypto' });
            }
        } catch (e) {
            try {
                const ids = crypto.map(c => cryptoIdMap[c] || cryptoIdMap[c.toUpperCase()]).filter(Boolean);
                if (ids.length > 0) {
                    const url = `${COINGECKO_BASE}/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=brl`;
                    const json = await tryFetchJson(url);
                    crypto.forEach(c => {
                        const id = cryptoIdMap[c] || cryptoIdMap[c.toUpperCase()];
                        const price = json?.[id]?.brl;
                        if (price) {
                            const info: MarketInfo = { price, change: 0, signal: 'Manter' };
                            resultData[c.toUpperCase()] = info;
                            tickerCache[c.toUpperCase()] = { data: info, timestamp: now };
                        }
                    });
                    sources.push({ uri: 'https://api.coingecko.com/api/v3/simple/price', title: 'CoinGecko simple price' });
                }
            } catch (e2) {
                console.error('Error fetching crypto prices', e2);
            }
        }
    }

    if (intl.length > 0 && !disableStooq && !isBlocked('stooq')) {
        try {
            for (const t of intl) {
                const symbol = `${t.toLowerCase()}.us`;
                const url = `/proxy/stooq/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=json`;
                const json = await tryFetchJson(url);
                const item = Array.isArray(json?.symbols) ? json.symbols[0] : (json?.symbols?.[0] || json);
                const close = parseFloat(item?.close ?? item?.c ?? '0');
                if (!isNaN(close) && close > 0) {
                    const priceBRL = close * usdRate;
                    const info: MarketInfo = { price: priceBRL, change: 0, signal: 'Manter' };
                    resultData[t.toUpperCase()] = info;
                    tickerCache[t.toUpperCase()] = { data: info, timestamp: now };
                    sources.push({ uri: url, title: 'Stooq JSON quote' });
                }
            }
        } catch (e) {
            console.error('Error fetching international quotes', e);
            blockSource('stooq', 10);
        }
    }

    return { data: resultData, sources };
};

export const getTopMovers = async (): Promise<MarketDataResponse> => {
    const now = Date.now();
    if (cachedTopMovers && (now - lastTopMoversFetchTime) < TOP_MOVERS_CACHE_DURATION) {
        return cachedTopMovers;
    }
    const universe = [
        'PETR4','VALE3','ITUB4','BBDC4','BBAS3','ELET3','ELET6','ABEV3','B3SA3','WEGE3',
        'PRIO3','GGBR4','CSNA3','SUZB3','RENT3','LREN3','MGLU3','LWSA3','NTCO3','HAPV3',
        'RADE3','CMIN3','PETR3','BRFS3','AZUL4','CVCB3'
    ];
    const chunkSize = 6;
    const data: Record<string, MarketInfo> = {};
    const sources: { uri: string; title: string }[] = [];
    for (let i = 0; i < universe.length; i += chunkSize) {
        const group = universe.slice(i, i + chunkSize);
        try {
            const url = `${brapiBase()}/api/quote/${group.join(',')}`;
            const json = await tryFetchJson(url);
            const arr = json?.results || json?.result || [];
            arr.forEach((item: any) => {
                const ticker = (item.symbol || item.ticker || '').toUpperCase();
                const rawPrice = (
                    item.regularMarketPrice ?? item.price ?? item.close ?? item.regularMarketPreviousClose ?? item.last ?? item.lastPrice
                );
                const rawChange = (
                    item.regularMarketChange ?? item.change ?? item.difference ?? ((item.regularMarketPrice && item.regularMarketPreviousClose) ? (item.regularMarketPrice - item.regularMarketPreviousClose) : 0)
                );
                const price = parseFloat(String(rawPrice));
                const change = parseFloat(String(rawChange));
                if (ticker && !isNaN(price) && price > 0) {
                    data[ticker] = { price, change: isNaN(change) ? 0 : change, signal: 'Manter' };
                }
            });
            sources.push({ uri: url, title: 'brapi.dev quote' });
        } catch {
            for (const t of group) {
                try {
                    await new Promise(r => setTimeout(r, 600));
                    const urlSingle = `${brapiBase()}/api/quote/${t}`;
                    const jsonSingle = await tryFetchJson(urlSingle);
                    const item = (jsonSingle?.results || jsonSingle?.result || [])[0] || jsonSingle;
                    if (item) {
                        const ticker = (item.symbol || item.ticker || t).toUpperCase();
                        const rawPrice = item.regularMarketPrice ?? item.price ?? item.close ?? item.regularMarketPreviousClose ?? item.last ?? item.lastPrice;
                        const rawChange = item.regularMarketChange ?? item.change ?? item.difference ?? 0;
                        const price = parseFloat(String(rawPrice));
                        const change = parseFloat(String(rawChange));
                        if (!isNaN(price) && price > 0) {
                            data[ticker] = { price, change: isNaN(change) ? 0 : change, signal: 'Manter' };
                        }
                        sources.push({ uri: urlSingle, title: 'brapi.dev quote (single)' });
                    }
                } catch {}
            }
            // Stooq fallback for B3 (.sa suffix)
            try {
                const stooqSymbols = group.map(t => `${t.toLowerCase()}.sa`).join(',');
                const surl = `${STOOQ_BASE}/q/l/?s=${encodeURIComponent(stooqSymbols)}&f=sd2t2ohlcv&h&e=json`;
                const sjson = await tryFetchJson(surl);
                const symbols = sjson?.symbols || sjson || [];
                const list = Array.isArray(symbols) ? symbols : [];
                list.forEach((it: any) => {
                    const sym = String(it.symbol || it.code || '').toUpperCase();
                    const ticker = sym.replace('.SA', '').replace('.sa', '');
                    const close = parseFloat(String(it.close ?? it.c ?? 0));
                    const open = parseFloat(String(it.open ?? it.o ?? 0));
                    const change = (!isNaN(close) && !isNaN(open) && open > 0) ? (close - open) : 0;
                    const price = close;
                    if (ticker && !isNaN(price) && price > 0) {
                        data[ticker] = { price, change, signal: 'Manter' };
                    }
                });
                sources.push({ uri: surl, title: 'Stooq JSON quote' });
            } catch {}
        }
        await new Promise(r => setTimeout(r, 500));
    }
    if (Object.keys(data).length === 0) {
        try {
            const stooqSymbols = universe.map(t => `${t.toLowerCase()}.sa`).join(',');
            const surl = `/proxy/stooq/q/l/?s=${encodeURIComponent(stooqSymbols)}&f=sd2t2ohlcv&h&e=json`;
            const sjson = await tryFetchJson(surl);
            const symbols = sjson?.symbols || sjson || [];
            const list = Array.isArray(symbols) ? symbols : [];
            list.forEach((it: any) => {
                const sym = String(it.symbol || it.code || '').toUpperCase();
                const ticker = sym.replace('.SA', '').replace('.sa', '');
                const close = parseFloat(String(it.close ?? it.c ?? 0));
                const open = parseFloat(String(it.open ?? it.o ?? 0));
                const change = (!isNaN(close) && !isNaN(open) && open > 0) ? (close - open) : 0;
                const price = close;
                if (ticker && !isNaN(price) && price > 0) {
                    data[ticker] = { price, change, signal: 'Manter' };
                }
            });
            sources.push({ uri: surl, title: 'Stooq JSON quote (all)' });
        } catch {}
    }
    const result: MarketDataResponse = { data, sources };
    if (Object.keys(data).length > 0) {
        cachedTopMovers = result;
        lastTopMoversFetchTime = Date.now();
    }
    return result;
};

export const getFinancialAdvice = async (promptContext: string): Promise<string> => {
    const lines = promptContext.split("\n").map(l => l.trim()).filter(Boolean);
    const getNumber = (label: string) => {
        const line = lines.find(l => l.toLowerCase().startsWith(label.toLowerCase()));
        if (!line) return 0;
        const match = line.match(/(-?\d+[\.,]?\d*)/);
        if (!match) return 0;
        return parseFloat(match[0].replace(',', '.'));
    };
    const balance = getNumber("Current Balance");
    const income = getNumber("Total Monthly Income");
    const expenses = getNumber("Total Monthly Expenses");
    const portfolio = getNumber("Portfolio Value");
    const savingsRate = income > 0 ? (income - expenses) / income : 0;
    const emergencyTarget = expenses > 0 ? expenses * 6 : 0;
    const emergencyStatus = balance >= emergencyTarget ? "Reserva de emergência adequada." : `Reserva de emergência abaixo do ideal (${Math.max(emergencyTarget - balance, 0).toFixed(0)} faltando).`;
    const savingsMsg = savingsRate >= 0.2 ? "Excelente taxa de poupança (≥20%)." : savingsRate >= 0.1 ? "Boa taxa de poupança (10–20%)." : savingsRate > 0 ? "Poupança baixa (<10%)." : "Déficit mensal.";
    const diversificationMsg = portfolio > 0 ? "Carteira ativa; monitore alocação entre renda fixa e variável." : "Sem investimentos registrados.";
    const recs: string[] = [];
    if (savingsRate < 0.1) recs.push("Aumente sua taxa de poupança ajustando despesas recorrentes.");
    if (balance < emergencyTarget) recs.push("Priorize montar 6 meses de despesas como reserva de emergência.");
    const summary = `**Resumo**\nSaldo Atual: ${formatCurrency(balance)}\nReceitas: ${formatCurrency(income)} | Despesas: ${formatCurrency(expenses)}\nTaxa de Poupança: ${(savingsRate * 100).toFixed(1)}%\nPatrimônio em Investimentos: ${formatCurrency(portfolio)}\n\n**Análise**\n- ${savingsMsg}\n- ${emergencyStatus}\n- ${diversificationMsg}\n\n**Recomendações**\n${recs.length ? recs.map(r => `- ${r}`).join("\n") : "- Mantenha a consistência e revise metas mensalmente."}`;
    return summary;
};

// Função auxiliar para calcular similaridade entre strings
function areStringsSimilar(str1: string, str2: string, threshold: number = 0.7): boolean {
    if (str1 === str2) return true;
    if (str1.length === 0 || str2.length === 0) return false;
    
    // Calcula distância de Levenshtein relativa
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    const distance = levenshteinDistance(longer, shorter);
    const similarity = (longer.length - distance) / longer.length;
    
    return similarity >= threshold;
}

// Implementação da distância de Levenshtein
function levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substituição
                    matrix[i][j - 1] + 1,      // inserção
                    matrix[i - 1][j] + 1       // deleção
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

export function recordCategoryPreference(description: string, category: string) {
    try {
        const prefsRaw = window.localStorage.getItem('smartCategoryPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        const stop = new Set(['de','do','da','no','na','em','para','por','com','sem','dos','das']);
        tokens.forEach(t => { if (!stop.has(t)) { prefs[t] = category; } });
        window.localStorage.setItem('smartCategoryPrefs', JSON.stringify(prefs));
    } catch {}
}

export function recordAccountPreference(description: string, accountId: string) {
    try {
        const prefsRaw = window.localStorage.getItem('smartAccountPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        const stop = new Set(['de','do','da','no','na','em','para','por','com','sem','dos','das']);
        tokens.forEach(t => { if (!stop.has(t)) { prefs[t] = accountId; } });
        window.localStorage.setItem('smartAccountPrefs', JSON.stringify(prefs));
    } catch {}
}

export function recordPaymentPreference(description: string, paymentMethod: string) {
    try {
        const prefsRaw = window.localStorage.getItem('smartPaymentPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        const stop = new Set(['de','do','da','no','na','em','para','por','com','sem','dos','das']);
        tokens.forEach(t => { if (!stop.has(t)) { prefs[t] = paymentMethod; } });
        window.localStorage.setItem('smartPaymentPrefs', JSON.stringify(prefs));
    } catch {}
}

function getPreferredCategory(description: string, categories: string[]): string | null {
    try {
        const prefsRaw = window.localStorage.getItem('smartCategoryPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        for (const t of tokens) {
            const pref = prefs[t];
            if (pref && categories.some(c => c.toLowerCase() === pref.toLowerCase())) {
                return categories.find(c => c.toLowerCase() === pref.toLowerCase()) || pref;
            }
        }
        return null;
    } catch { return null; }
}

function getPreferredAccount(description: string, accounts: { id: string; name: string }[]): string | null {
    try {
        const prefsRaw = window.localStorage.getItem('smartAccountPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        for (const t of tokens) {
            const pref = prefs[t];
            if (pref && accounts.some(a => a.id === pref)) {
                return pref;
            }
        }
        return null;
    } catch { return null; }
}

function getPreferredPaymentMethod(description: string): string | null {
    try {
        const prefsRaw = window.localStorage.getItem('smartPaymentPrefs');
        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
        const tokens = description.toLowerCase().split(/[^a-zA-Z0-9çáàâãéêíóôõúü]+/).filter(t => t && t.length >= 3);
        for (const t of tokens) {
            const pref = prefs[t];
            if (pref && typeof pref === 'string' && pref.length > 0) {
                return pref;
            }
        }
        return null;
    } catch { return null; }
}

export const suggestCategoryAndType = async (description: string, categories: string[]): Promise<{ category: string, type: 'Entrada' | 'Saída' | null } | null> => {
    const text = description.toLowerCase();
    const incomeWords = ["salario","salário","recebi","entrada","deposito","depósito","bonus","bônus","rendimento","juros","cashback","venda","reembolso","provento","pix recebido"];
    const expenseWords = ["paguei","pagamento","compra","almoço","mercado","supermercado","uber","ifood","aluguel","conta","internet","energia","luz","gas","gasolina","transporte","cinema","lazer","assinatura","netflix","spotify","restaurante","padaria"];
    const type: 'Entrada' | 'Saída' = incomeWords.some(w => text.includes(w)) && !expenseWords.some(w => text.includes(w)) ? 'Entrada' : 'Saída';
    // Pistas lexicais prioritárias
    const lexMap: { key: string; cat: string }[] = [
        { key: 'mc donald', cat: 'Restaurante' },
        { key: 'mc donalds', cat: 'Restaurante' },
        { key: 'mcdonald', cat: 'Restaurante' },
        { key: 'mcdonalds', cat: 'Restaurante' },
        { key: 'burger king', cat: 'Restaurante' },
        { key: 'subway', cat: 'Restaurante' },
        { key: 'outback', cat: 'Restaurante' },
        { key: 'ifood', cat: 'Delivery' },
        { key: 'rappi', cat: 'Delivery' },
        { key: 'uber', cat: 'Transporte' },
        { key: '99', cat: 'Transporte' },
        { key: 'gasolina', cat: 'Combustível' },
        { key: 'combustível', cat: 'Combustível' },
        { key: 'combustivel', cat: 'Combustível' },
        { key: 'supermercado', cat: 'Mercado' },
        { key: 'mercado', cat: 'Mercado' },
        { key: 'farmácia', cat: 'Farmácia' },
        { key: 'farmacia', cat: 'Farmácia' },
        { key: 'drogaria', cat: 'Farmácia' },
        { key: 'refrigerante', cat: 'Bebidas' },
        { key: 'adega', cat: 'Bebidas' },
        { key: 'bar', cat: 'Bebidas' },
        { key: 'pub', cat: 'Bebidas' },
        { key: 'padaria', cat: 'Padaria' },
        { key: 'café', cat: 'Padaria' },
        { key: 'cafe', cat: 'Padaria' }
    ];
    const directLex = lexMap.find(l => text.includes(l.key));
    if (directLex) {
        return { category: directLex.cat, type };
    }
    const preferred = getPreferredCategory(description, categories);
    if (preferred) return { category: preferred, type };
    const dict: Record<string, string[]> = {
        'alimentação': ["almoço","jantar","restaurante","supermercado","mercado","comida","ifood","padaria"],
        'transporte': ["uber","99","combustível","gasolina","ônibus","metro","estacionamento","pedágio"],
        'moradia': ["aluguel","condomínio","água","luz","energia","internet","iptu","gás"],
        'lazer': ["cinema","netflix","spotify","bar","show","assinatura","games"],
        'salário': ["salário","folha","provento"],
        'freelance': ["freelance","projeto","serviço","extra"],
    };
    const scored: { name: string; score: number }[] = categories.map(c => {
        const key = c.toLowerCase();
        const kws = dict[key] || [];
        let score = 0;
        kws.forEach(k => { if (text.includes(k)) score += 1; });
        return { name: c, score };
    });
    scored.sort((a,b) => b.score - a.score);
    const chosen = scored[0]?.score > 0 ? scored[0].name : 'Outros';
    return { category: typeof chosen === 'string' ? chosen : categories[0], type };
};

const ESTABLISHMENT_DICT: Record<string,string> = {
    // Bancos e Fintechs
    'nubank': 'Nubank',
    'inter': 'Inter',
    'itaú': 'Itaú',
    'bradesco': 'Bradesco',
    'santander': 'Santander',
    'banco do brasil': 'Banco do Brasil',
    'bb': 'Banco do Brasil',
    'caixa': 'Caixa',
    'caixa econômica': 'Caixa',
    'picpay': 'PicPay',
    'mercadopago': 'Mercado Pago',
    'mercado pago': 'Mercado Pago',
    'c6 bank': 'C6 Bank',
    'c6': 'C6 Bank',
    'next': 'Next',
    'neon': 'Neon',
    'original': 'Banco Original',
    'sicoob': 'Sicoob',
    'sicredi': 'Sicredi',
    'pagbank': 'PagBank',
    'pag bank': 'PagBank',
    // Delivery
    'ifood': 'iFood',
    'uber eats': 'Uber Eats',
    'rappi': 'Rappi',
    '99 food': '99 Food',
    'aiqfome': 'Aiqfome',
    'apetit': 'Apetit',
    'benji': 'Benji',
    'bistek': 'Bistek',
    'cabrilla': 'Cabrilla',
    'caderninho': 'Caderninho',
    'chef': 'Chef',
    'compra fácil': 'Compra Fácil',
    'compra facil': 'Compra Fácil',
    'delivery much': 'Delivery Much',
    'didi food': 'Didi Food',
    'dileto': 'Dileto',
    'e-fácil': 'E-Fácil',
    'e facil': 'E-Fácil',
    'fome fácil': 'Fome Fácil',
    'fome facil': 'Fome Fácil',
    'goomer': 'Goomer',
    'gourmet': 'Gourmet',
    'grubster': 'Grubster',
    'hellofood': 'HelloFood',
    'james': 'James Delivery',
    'marmita delivery': 'Marmita Delivery',
    'meu cardápio': 'Meu Cardápio',
    'meu cardapio': 'Meu Cardápio',
    'pede fácil': 'Pede Fácil',
    'pede facil': 'Pede Fácil',
    'pede pronto': 'Pede Pronto',
    'pedeaki': 'Pedeaki',
    'quero delivery': 'Quero Delivery',
    'quero pizza': 'Quero Pizza',
    'sabor city': 'Sabor City',
    'sinners': 'Sinners Burger',
    'super menu': 'Super Menu',
    'telepizza': 'Telepizza',
    // Transporte
    'uber': 'Uber',
    '99': '99',
    '99 taxi': '99',
    'cabify': 'Cabify',
    'bolt': 'Bolt',
    'didí': 'Didi',
    'didi': 'Didi',
    'in driver': 'InDriver',
    'indriver': 'InDriver',
    'lyft': 'Lyft',
    'táxi': 'Táxi',
    'taxi': 'Táxi',
    'cab': 'Táxi',
    'gasolina': 'Posto',
    'posto': 'Posto',
    'combustível': 'Posto',
    'combustivel': 'Posto',
    'ipiranga': 'Ipiranga',
    'shell': 'Shell',
    'petrobras': 'Petrobras',
    'br': 'BR',
    'ale': 'Ale',
    'texaco': 'Texaco',
    'auto posto': 'Auto Posto',
    // Supermercados
    'carrefour': 'Carrefour',
    'carrefour bairro': 'Carrefour Bairro',
    'extra': 'Extra',
    'pão de açúcar': 'Pão de Açúcar',
    'pao de acucar': 'Pão de Açúcar',
    'assai': 'Assaí',
    'atacadão': 'Atacadão',
    'atacadao': 'Atacadão',
    'sams club': 'Sam\'s Club',
    'sams': 'Sam\'s Club',
    'makro': 'Makro',
    'maxxi': 'Maxxi',
    'supermercados bh': 'Supermercados BH',
    'super bh': 'Supermercados BH',
    'bretas': 'Bretas',
    'cencosud': 'Cencosud',
    'cooper': 'Cooper',
    'economiza': 'Economiza',
    'epa': 'EPA',
    'gbarbosa': 'GBarbosa',
    'gimba': 'Gimba',
    'havan': 'Havan',
    'imperatriz': 'Imperatriz',
    'líder': 'Líder',
    'lider': 'Líder',
    'lojas torra': 'Lojas Torra',
    'mart plus': 'Mart Plus',
    'martminas': 'Martminas',
    'mercadinho são luís': 'Mercadinho São Luís',
    'mercadinho sao luis': 'Mercadinho São Luís',
    'mercadol': 'MercadoL',
    'nacional': 'Nacional',
    'perini': 'Perini',
    'pompeia': 'Pompeia',
    'prezunic': 'Prezunic',
    'rede cometa': 'Rede Cometa',
    'rede economia': 'Rede Economia',
    'rede mais': 'Rede Mais',
    'rede mercados': 'Rede Mercados',
    'rede sul': 'Rede Sul',
    'rede super': 'Rede Super',
    'rede': 'Rede',
    'sempre': 'Sempre',
    'sonda': 'Sonda',
    'super lopes': 'Super Lopes',
    'super mais': 'Super Mais',
    'super mix': 'Super Mix',
    'super pague menos': 'Super Pague Menos',
    'super santa': 'Super Santa',
    'supermercado angeloni': 'Angeloni',
    'angeloni': 'Angeloni',
    'supermercado copacabana': 'Copacabana',
    'copacabana': 'Copacabana',
    'supermercado guanabara': 'Guanabara',
    'guanabara': 'Guanabara',
    'supermercado menegalli': 'Menegalli',
    'menegalli': 'Menegalli',
    'supermercado paulista': 'Paulista',
    'paulista': 'Paulista',
    'supermercado sonda': 'Sonda',
    'supermercado toque': 'Toque',
    'toque': 'Toque',
    'supermercado veran': 'Veran',
    'veran': 'Veran',
    
    'tenda': 'Tenda',
    'tonin': 'Tonin',
    'toninho': 'Toninho\'s',
    'tonys': 'Tony\'s',
    'villa': 'Villa',
    'wal mart': 'Walmart',
    'walmart': 'Walmart',
    'zona sul': 'Zona Sul',
    // Farmácias
    'drogasil': 'Drogasil',
    'droga raia': 'Droga Raia',
    'raia': 'Droga Raia',
    'pague menos': 'Pague Menos',
    'onofre': 'Onofre',
    'drogaria avenida': 'Drogaria Avenida',
    'drogaria iguatemi': 'Drogaria Iguatemi',
    'drogaria pacheco': 'Drogaria Pacheco',
    'pacheco': 'Drogaria Pacheco',
    'drogaria são paulo': 'Drogaria São Paulo',
    'drogaria sao paulo': 'Drogaria São Paulo',
    'dpharma': 'DPharma',
    'farma & cia': 'Farma & Cia',
    'farma e cia': 'Farma & Cia',
    'farmais': 'Farmais',
    'farmácia popular': 'Farmácia Popular',
    'farmacia popular': 'Farmácia Popular',
    'farmácias associadas': 'Farmácias Associadas',
    'farmacia associadas': 'Farmácias Associadas',
    'farmalife': 'Farmalife',
    'farmacondo': 'Farmacondo',
    'farmaforte': 'Farmaforte',
    'farminas': 'Farminas',
    'farmácia são sebastião': 'Farmácia São Sebastião',
    'farmacia sao sebastiao': 'Farmácia São Sebastião',
    'panvel': 'Panvel',
    'ultrafarma': 'Ultrafarma',
    // Lazer e Streaming
    
    'spotify': 'Spotify',
    'disney+': 'Disney+',
    'disney plus': 'Disney+',
    'prime video': 'Prime Video',
    'amazon prime': 'Prime Video',
    'hbo max': 'HBO Max',
    'paramount+': 'Paramount+',
    'paramount plus': 'Paramount+',
    'youtube premium': 'YouTube Premium',
    'youtube': 'YouTube Premium',
    'xbox': 'Xbox',
    'playstation': 'PlayStation',
    'psn': 'PlayStation',
    'steam': 'Steam',
    'epic games': 'Epic Games',
    'ea play': 'EA Play',
    'ubisoft': 'Ubisoft',
    'blizzard': 'Blizzard',
    'battle.net': 'Battle.net',
    'twitch': 'Twitch',
    'crunchyroll': 'Crunchyroll',
    'funimation': 'Funimation',
    'globoplay': 'Globoplay',
    'globo play': 'Globoplay',
    'telecine': 'Telecine',
    'now': 'NOW',
    'apple tv+': 'Apple TV+',
    'apple tv plus': 'Apple TV+',
    'apple music': 'Apple Music',
    'deezer': 'Deezer',
    'tidal': 'Tidal',
    'amazon music': 'Amazon Music',
    'soundcloud': 'SoundCloud',
    'linkedin premium': 'LinkedIn Premium',
    'linkedin learning': 'LinkedIn Learning',
    // Restaurantes
    'mcdonald': 'McDonald\'s',
    'mcdonalds': 'McDonald\'s',
    'mcdonald\'s': 'McDonald\'s',
    'burger king': 'Burger King',
    'subway': 'Subway',
    'pizza hut': 'Pizza Hut',
    'domino': 'Domino\'s',
    'dominos': 'Domino\'s',
    'domino\'s': 'Domino\'s',
    'kfc': 'KFC',
    'outback': 'Outback',
    'giraffas': 'Giraffas',
    'habib': 'Habib\'s',
    'habibs': 'Habib\'s',
    'bob': 'Bob\'s',
    
    'bob\'s': 'Bob\'s',
    'açaí': 'Açaí',
    'acai': 'Açaí',
    'bacio di latte': 'Bacio di Latte',
    'bobs': 'Bob\'s',
    'brigadeiro': 'Brigadeiro',
    'casa do pão de queijo': 'Casa do Pão de Queijo',
    'chiquinho': 'Chiquinho',
    'coco bambu': 'Coco Bambu',
    'cofix': 'Cofix',
    'conversa fiada': 'Conversa Fiada',
    'crocantella': 'Crocantella',
    'dallas': 'Dallas',
    'dunkin donuts': 'Dunkin\' Donuts',
    'figueira': 'Figueira Rubaiyat',
    'gendai': 'Gendai',
    
    'gosto da vida': 'Gosto da Vida',
    'gran dog': 'Gran Dog',
    'grano': 'Grano',
    'habib\'s': 'Habib\'s',
    'hamburgueria': 'Hamburgueria',
    'hot dog': 'Hot Dog',
    'jacaré': 'Jacaré',
    'jappa': 'Jappa',
    'jerivá': 'Jerivá',
    'jockey': 'Jockey',
    'jota': 'Jota',
    'kibon': 'Kibon',
    'lanchonete': 'Lanchonete',
    'leão': 'Leão',
    'madero': 'Madero',
    'mama': 'Mama',
    'manekineko': 'Manekineko',
    'maria': 'Maria',
    'matsuya': 'Matsuya',
    'milk shake': 'Milk Shake',
    'mistura': 'Mistura',
    'montana': 'Montana',
    'mormaii': 'Mormaii',
    'mr. cheney': 'Mr. Cheney',
    'mr cheney': 'Mr. Cheney',
    'muquém': 'Muquém',
    'muquem': 'Muquém',
    'nakka': 'Nakka',
    'nakka sushi': 'Nakka Sushi',
    'nosso': 'Nosso',
    'nova': 'Nova',
    'o pão': 'O Pão',
    'olive garden': 'Olive Garden',
    
    'pão de queijo': 'Pão de Queijo',
    'pao de queijo': 'Pão de Queijo',
    'pão na brasa': 'Pão na Brasa',
    'pao na brasa': 'Pão na Brasa',
    'parmeggio': 'Parmeggio',
    
    'paulistinha': 'Paulistinha',
    'pé de pira': 'Pé de Pira',
    'pe de pira': 'Pé de Pira',
    'perdigão': 'Perdigão',
    'perdigao': 'Perdigão',
    'picanha': 'Picanha',
    'pira': 'Pira',
    'pizza': 'Pizza',
    
    'pizzaria': 'Pizzaria',
    'pobre juan': 'Pobre Juan',
    'porcão': 'Porcão',
    'porcao': 'Porcão',
    'quintal': 'Quintal',
    'ranch': 'Ranch',
    'restaurante': 'Restaurante',
    'rider': 'Rider',
    'rihappy': 'Ri Happy',
    'roskilde': 'Roskilde',
    'rubaiyat': 'Rubaiyat',
    'sabor': 'Sabor',
    'santa': 'Santa',
    'santo': 'Santo',
    'são paulo': 'São Paulo',
    'sao paulo': 'São Paulo',
    'seu': 'Seu',
    'sorveteria': 'Sorveteria',
    'spoleto': 'Spoleto',
    'st. louis': 'St. Louis',
    'st louis': 'St. Louis',
    
    'sushi': 'Sushi',
    'sushiloko': 'Sushiloko',
    'taco bell': 'Taco Bell',
    'tango': 'Tango',
    'tatu': 'Tatu',
    
    'texas': 'Texas',
    'ticiana': 'Ticiana',
    'tomate': 'Tomate',
    'tony': 'Tony',
    'toscana': 'Toscana',
    'trator': 'Trator',
    'tropilha': 'Tropilha',
    'viena': 'Viena',
    
    'vips': 'Vips',
    'vivenda': 'Vivenda',
    'vó': 'Vó',
    'vo': 'Vó',
    'wendy\'s': 'Wendy\'s',
    'wendys': 'Wendy\'s',
    'yakissoba': 'Yakissoba',
    // Varejo
    'americanas': 'Americanas',
    'magazine luiza': 'Magazine Luiza',
    'magalu': 'Magazine Luiza',
    'shoptime': 'Shoptime',
    'submarino': 'Submarino',
    'mercado livre': 'Mercado Livre',
    'mercadolivre': 'Mercado Livre',
    'amazon': 'Amazon',
    'shein': 'Shein',
    'aliexpress': 'AliExpress',
    'shopee': 'Shopee',
    'casas bahia': 'Casas Bahia',
    'pontofrio': 'Ponto Frio',
    'ponto frio': 'Ponto Frio',
    
    'fast shop': 'Fast Shop',
    'fastshop': 'Fast Shop',
    'kalunga': 'Kalunga',
    'leroy merlin': 'Leroy Merlin',
    'madeira madeira': 'Madeira Madeira',
    'mobly': 'Mobly',
    'nagem': 'Nagem',
    'nagemi': 'Nagemi',
    'nagumo': 'Nagumo',
    'natura': 'Natura',
    'o boticário': 'O Boticário',
    'o boticario': 'O Boticário',
    'pernambucanas': 'Pernambucanas',
    'polishop': 'Polishop',
    'renner': 'Renner',
    'riachuelo': 'Riachuelo',
    'saraiva': 'Saraiva',
    'tok stok': 'Tok Stok',
    'tokstok': 'Tok Stok',
    'tricae': 'Tricae',
    'zattini': 'Zattini',
    // Serviços
    'linkedin': 'LinkedIn',
    'zoom': 'Zoom',
    'office': 'Microsoft Office',
    'microsoft': 'Microsoft',
    'google': 'Google',
    'icloud': 'iCloud',
    'onedrive': 'OneDrive',
    'dropbox': 'Dropbox',
    'canva': 'Canva',
    'adobe': 'Adobe',
    'photoshop': 'Adobe',
    'premiere': 'Adobe',
    'after effects': 'Adobe',
    'illustrator': 'Adobe',
    'notion': 'Notion',
    'slack': 'Slack',
    'trello': 'Trello',
    'asana': 'Asana',
    'monday': 'Monday.com',
    'monday.com': 'Monday.com',
    'clickup': 'ClickUp',
    'evernote': 'Evernote',
    
    
    'netflix': 'Netflix',
    'grammarly': 'Grammarly',
    
    
    
    'bandcamp': 'Bandcamp',
    'pandora': 'Pandora',
    'audible': 'Audible',
    'kindle': 'Kindle',
    'scribd': 'Scribd',
    'medium': 'Medium',
    'substack': 'Substack',
    'patreon': 'Patreon',
    'onlyfans': 'OnlyFans',
    
    
    'vimeo': 'Vimeo',
    'skillshare': 'Skillshare',
    'udemy': 'Udemy',
    'coursera': 'Coursera',
    'edx': 'edX',
    'khan academy': 'Khan Academy',
    'masterclass': 'MasterClass',
    'calm': 'Calm',
    'headspace': 'Headspace',
    'betterhelp': 'BetterHelp',
    'talkspace': 'Talkspace',
    // Utilidades
    'claro': 'Claro',
    'tim': 'TIM',
    'oi': 'Oi',
    'vivo': 'Vivo',
    'sky': 'Sky',
    'oi fibra': 'Oi Fibra',
    'vivo fibra': 'Vivo Fibra',
    'claro fibra': 'Claro Fibra',
    'claro tv': 'Claro TV',
    'vivo tv': 'Vivo TV',
    'sky tv': 'Sky TV',
    'net': 'NET',
    'net virtua': 'NET Virtua',
    'gvt': 'GVT',
    'copel': 'Copel',
    'celesc': 'CELESC',
    'cemig': 'CEMIG',
    'corsan': 'CORSAN',
    'sabesp': 'SABESP',
    'sanepar': 'SANEPAR',
    'caesb': 'CAESB',
    'casal': 'CASAL',
    'copasa': 'COPASA',
    'agevap': 'AGEVAP',
    'cedae': 'CEDAE',
    'embasa': 'EMBASA',
    'prolagos': 'PROLAGOS',
    'sanasa': 'SANASA',
    'saneago': 'SANEAGO',
    'sanesul': 'SANESUL',
    'saneatins': 'SANEATINS',
    'água': 'Água',
    'agua': 'Água',
    'luz': 'Luz',
    'energia': 'Energia',
    'gás': 'Gás',
    'gas': 'Gás',
    'telefone': 'Telefone',
    'celular': 'Celular',
    'internet': 'Internet',
    'banda larga': 'Internet',
    'wifi': 'Internet',
    'condomínio': 'Condomínio',
    'condominio': 'Condomínio',
    'iptu': 'IPTU',
    'ipva': 'IPVA',
    'licenciamento': 'Licenciamento',
    'seguro': 'Seguro',
    'manutenção': 'Manutenção',
    'manutencao': 'Manutenção',
    'limpeza': 'Limpeza',
    'jardim': 'Jardim',
    'portaria': 'Portaria',
    'zeladoria': 'Zeladoria',
};

export const parseTransactionFromText = async (text: string, categories: string[], accounts: { id: string; name: string }[]): Promise<any | null> => {
    const raw = text.trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    // Valor: R$ 45,90 | 45 reais | 45 | 45.50 | 45,50 | 45.50 reais | 45,50 reais | 45.50 rs | 45,50 rs | mil | mil reais | 1.500 | 1500
    const amountPatterns = [
        // R$ 1.234,56 ou R$ 1234,56
        /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i,
        // 1.234,56 reais ou 1234,56 reais
        /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*reais?/i,
        // 1234,56 ou 1234.56 (sem símbolo)
        /(\d{1,6}(?:[.,]\d{1,2})?)(?:\s*(?:rs?|reais?))?/i,
        // Valores com "mil"
        /(\d{1,3}(?:,\d{1,2})?)\s*mil/i
    ];
    
    let amount = NaN;
    let amountText = '';
    let amountMatchIndex: number | null = null;
    
    for (const pattern of amountPatterns) {
        const exec = pattern.exec(lower);
        if (exec) {
            amountText = exec[1];
            amountMatchIndex = exec.index;
            break;
        }
    }
    
    if (amountText) {
        // Remove separadores de milhar e substitui vírgula decimal por ponto
        let normalized = amountText.replace(/\./g, '').replace(',', '.');
        const parsed = parseFloat(normalized);
        
        // Se encontrou "mil", multiplica por 1000
        if (lower.includes('mil') && !lower.includes('milh')) {
            amount = parsed * 1000;
        } else {
            amount = parsed;
        }
        
        // Validação robusta
        if (isNaN(amount) || amount <= 0 || amount >= 10000000) {
            amount = NaN; // Valor inválido
        }
    }
    let description = raw;
    let cutIndex: number | null = amountMatchIndex;
    if (cutIndex === null) {
        const valueMatch = lower.match(/(?:^|[\s,;])((?:r\$\s*)?\d{2,6}(?:[.,]\d{1,2})?(?:\s*(?:rs?|reais?))?)/);
        if (valueMatch) {
            const fullIndex = lower.indexOf(valueMatch[0]);
            const innerOffset = valueMatch[0].indexOf(valueMatch[1]);
            const startIndex = fullIndex + innerOffset;
            const preCtx = lower.slice(Math.max(0, startIndex - 6), startIndex);
            const postCtx = lower.slice(startIndex, Math.min(lower.length, startIndex + 12));
            const looksLikeDate = /\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?/.test(postCtx);
            const hasTimeCue = /\b(a[s]?|às|dia)\s*$/.test(preCtx);
            if (!looksLikeDate && !hasTimeCue) cutIndex = startIndex;
        }
    }
    if (cutIndex !== null) {
        description = raw.substring(0, cutIndex).trim();
        description = description.replace(/\b(de|por|no valor de|valor de|a|em)\s*$/i, '').trim();
    }
    // Data: hoje | ontem | anteontem | dia 5 | 5/12 | 5/12/24 | 5-12-2024 | 5 de dezembro | 5 de dez | 5/12/2024 | próxima segunda | segunda passada | semana passada | mês passado
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const anteontem = new Date(today);
    anteontem.setDate(today.getDate() - 2);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let dateStr = fmt(today);
    
    if (lower.includes('ontem')) dateStr = fmt(yesterday);
    if (lower.includes('anteontem')) dateStr = fmt(anteontem);
    
    // Dias da semana relativos
    const daysOfWeek = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const currentDay = today.getDay();
    
    for (let i = 0; i < daysOfWeek.length; i++) {
        if (lower.includes(daysOfWeek[i]) || lower.includes(daysOfWeek[i].replace('ç', 'c'))) {
            let targetDate = new Date(today);
            let daysDiff = i - currentDay;
            
            if (lower.includes('próxima') || lower.includes('proxima')) {
                // Próxima semana
                if (daysDiff <= 0) daysDiff += 7;
            } else if (lower.includes('passada') || lower.includes('última') || lower.includes('ultima')) {
                // Semana passada
                if (daysDiff >= 0) daysDiff -= 7;
            } else {
                // Esta semana (se já passou, usar semana passada)
                if (daysDiff > 0) daysDiff -= 7;
            }
            
            targetDate.setDate(today.getDate() + daysDiff);
            dateStr = fmt(targetDate);
            break;
        }
    }
    
    // Meses relativos
    if (lower.includes('semana passada')) {
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        dateStr = fmt(lastWeek);
    }
    
    if (lower.includes('mês passado') || lower.includes('mes passado')) {
        const lastMonth = new Date(today);
        lastMonth.setMonth(today.getMonth() - 1);
        dateStr = fmt(lastMonth);
    }
    
    // Formatos de data específicos
    const dateMatch = lower.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (dateMatch) {
        const d = parseInt(dateMatch[1]);
        const m = parseInt(dateMatch[2]) - 1;
        const y = dateMatch[3] ? parseInt(dateMatch[3].replace(/[\/-]/g, '')) : today.getFullYear();
        const fullY = y < 100 ? 2000 + y : y;
        const dt = new Date(fullY, m, d);
        if (!isNaN(dt.getTime())) dateStr = fmt(dt);
    }
    
    // Nomes de meses em português
    const months = {
        'janeiro': 0, 'jan': 0, 'fevereiro': 1, 'fev': 1, 'março': 2, 'mar': 2, 'abril': 3, 'abr': 3,
        'maio': 4, 'junho': 5, 'jun': 5, 'julho': 6, 'jul': 6, 'agosto': 7, 'ago': 7,
        'setembro': 8, 'set': 8, 'outubro': 9, 'out': 9, 'novembro': 10, 'nov': 10, 'dezembro': 11, 'dez': 11
    };
    
    const monthMatch = lower.match(/(\d{1,2})\s+de\s+([a-zç]+)/);
    if (monthMatch) {
        const day = parseInt(monthMatch[1]);
        const monthName = monthMatch[2].toLowerCase();
        const month = months[monthName as keyof typeof months];
        
        if (month !== undefined && day >= 1 && day <= 31) {
            const dt = new Date(today.getFullYear(), month, day);
            if (!isNaN(dt.getTime())) dateStr = fmt(dt);
        }
    }
    
    // Dia do mês (ex: "dia 15")
    const dayMatch = lower.match(/dia\s+(\d{1,2})/);
    if (dayMatch) {
        const day = parseInt(dayMatch[1]);
        if (day >= 1 && day <= 31) {
            const dt = new Date(today.getFullYear(), today.getMonth(), day);
            if (!isNaN(dt.getTime())) dateStr = fmt(dt);
        }
    }
    // Método de pagamento - expandido
    const paymentDict: Record<string,string> = {
        'pix': 'PIX',
        'débito': 'Cartão de Débito',
        'debito': 'Cartão de Débito',
        'crédito': 'Cartão de Crédito',
        'credito': 'Cartão de Crédito',
        'dinheiro': 'Dinheiro',
        'espécie': 'Dinheiro',
        'especie': 'Dinheiro',
        'transferência': 'Transferência Bancária',
        'transferencia': 'Transferência Bancária',
        'ted': 'TED',
        'doc': 'DOC',
        'boleto': 'Boleto',
        'boleto bancário': 'Boleto',
        'boleto bancario': 'Boleto',
        'picpay': 'PicPay',
        'mercadopago': 'Mercado Pago',
        'mercado pago': 'Mercado Pago',
        'paypal': 'PayPal',
        'pay pal': 'PayPal',
        'pagseguro': 'PagSeguro',
        'pague seguro': 'PagSeguro',
        'recarga': 'Recarga',
        'voucher': 'Voucher',
        'vale': 'Vale',
        'ticket': 'Ticket',
        'sodexo': 'Sodexo',
        'alelo': 'Alelo',
        'vr': 'VR',
        'ben visa vale': 'Ben Visa Vale',
        'credicard': 'Credicard',
        'mastercard': 'Mastercard',
        'visa': 'Visa',
        'elo': 'Elo',
        'hipercard': 'Hipercard',
        'american express': 'American Express',
        'amex': 'American Express',
        'hiper': 'Hiper',
        'banrisul': 'Banrisul',
        'caixa': 'Caixa Econômica',
        'bradesco': 'Bradesco',
        'itaucard': 'Itaucard',
        'santander': 'Santander',
        'banco do brasil': 'Banco do Brasil',
        'bb': 'Banco do Brasil',
        'next': 'Next',
        'neon': 'Neon',
        'c6': 'C6 Bank',
        'inter': 'Inter',
        'nubank': 'Nubank',
        'original': 'Banco Original'
    };
    let paymentMethod = getPreferredPaymentMethod(lower) || 'Outros';
    for (const k of Object.keys(paymentDict)) { 
        if (lower.includes(k)) { 
            paymentMethod = paymentDict[k]; 
            break; 
        } 
    }
    // Conta (por nome ou estabelecimento) - lógica aprimorada
    let accountId: string | null = getPreferredAccount(lower, accounts);
    
    // Primeiro: tenta encontrar conta pelo nome exato ou parcial
    for (const acc of accounts) {
        const accountName = acc.name.toLowerCase();
        if (lower.includes(accountName) || accountName.includes(lower.split(' ')[0])) {
            accountId = acc.id;
            break;
        }
    }
    
    // Segundo: tenta encontrar conta por palavras-chave de estabelecimentos
    if (!accountId) {
        // Procura por bancos/fintechs primeiro (mais provável de ter conta)
        const bankKeywords = ['nubank', 'inter', 'itaú', 'bradesco', 'santander', 'bb', 'caixa', 'picpay', 'mercadopago', 'c6', 'neon', 'next'];
        for (const keyword of bankKeywords) {
            if (lower.includes(keyword)) {
                const acc = accounts.find(a => 
                    a.name.toLowerCase().includes(keyword) ||
                    a.name.toLowerCase().includes('banco') ||
                    a.name.toLowerCase().includes('conta') ||
                    a.name.toLowerCase().includes('cartão') ||
                    a.name.toLowerCase().includes('cartao')
                );
                if (acc) { accountId = acc.id; break; }
            }
        }
    }
    
    // Terceiro: tenta encontrar conta pelo estabelecimento detectado
    if (!accountId) {
        for (const key of Object.keys(ESTABLISHMENT_DICT)) {
            if (lower.includes(key)) {
                const establishment = ESTABLISHMENT_DICT[key];
                // Procura conta com nome similar ao estabelecimento
                const acc = accounts.find(a => {
                    const accountName = a.name.toLowerCase();
                    return accountName.includes(establishment.toLowerCase()) ||
                           establishment.toLowerCase().includes(accountName) ||
                           // Verifica se são palavras similares
                           areStringsSimilar(accountName, establishment.toLowerCase());
                });
                if (acc) { accountId = acc.id; break; }
            }
        }
    }
    
    // Quarto: se não encontrou nada, usa a primeira conta como fallback
    if (!accountId && accounts.length > 0) {
        accountId = accounts[0].id;
    }
    // Sugestão de categoria
    const suggestion = await suggestCategoryAndType(raw, categories);
    if (!suggestion || isNaN(amount) || amount <= 0) return null;
    return {
        description,
        amount,
        date: dateStr,
        category: suggestion.category,
        type: suggestion.type,
        paymentMethod,
        accountId
    };
};

export const parseInvestmentFromText = async (text: string): Promise<{
    kind: 'variable' | 'fixed';
    data: any;
} | null> => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const words = lower.split(/\s+/);
    const moneyMatch = raw.match(/(\d+[\.,]\d{2}|\d+)(?=\s*(reais|r\$|brl)?)/i);
    const qtyMatch = raw.match(/(\d+[\.,]?\d*)\s*(x|un|uni|unid|qtd|quantidade|ações|acao|ações|cotas|lotes)?/i);
    const priceMatch = raw.match(/(a\s|por\s|preço\s|preco\s|valor\s)(de\s)?(r\$\s*)?(\d+[\.,]\d{2}|\d+)/i);
    const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    let dateStr = dateMatch ? dateMatch[0] : '';
    if (!dateStr) {
        if (words.includes('hoje')) {
            const d = new Date();
            dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        } else if (words.includes('ontem')) {
            const d = new Date();
            d.setDate(d.getDate()-1);
            dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }
    }
    const amountNum = moneyMatch ? parseFloat(moneyMatch[1].replace('.', '').replace(',', '.')) : NaN;
    const qtyNum = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : NaN;
    const unitPrice = priceMatch ? parseFloat((priceMatch[4] || priceMatch[3] || '').replace('.', '').replace(',', '.')) : NaN;

    const isFixed = /(cdb|lci|lca|tesouro|ipca|cdi|debênture|debenture|cri|cra)/i.test(lower);
    if (isFixed) {
        const nameMatch = raw.match(/(cdb|lci|lca|tesouro selic|tesouro ipca|tesouro prefixado|debênture|debenture|cri|cra)/i);
        const issuerMatch = raw.match(/(banco\s+[a-zA-Z]+|inter|nubank|itau|bradesco|santander|bb|caixa|original|btg|xp)/i);
        const yieldMatch = raw.match(/(\d+\s*%\s*cdi|ipca\s*\+\s*\d+[\.,]?\d*%|prefixado\s*\d+[\.,]?\d*%)/i);
        const maturityMatch = raw.match(/vencimento\s*(em\s*)?(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
        const maturityStr = maturityMatch ? maturityMatch[2] : '';
        if (isNaN(amountNum)) return null;
        return {
            kind: 'fixed',
            data: {
                name: (nameMatch ? nameMatch[0] : 'Renda Fixa').toString(),
                issuer: issuerMatch ? issuerMatch[0] : 'Banco',
                amountInvested: amountNum,
                yieldRate: yieldMatch ? yieldMatch[0] : '100% CDI',
                purchaseDate: dateStr || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`,
                maturityDate: maturityStr || `${new Date().getFullYear()+1}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
            }
        };
    }

    const tickerMatch = raw.match(/([A-Z]{3,5}(?:\d{1,2})?)/);
    let ticker = tickerMatch ? tickerMatch[1] : '';
    if (!ticker && /(btc|eth|xrp|ada|sol)/i.test(lower)) {
        const crypto = lower.match(/(btc|eth|xrp|ada|sol)/i)?.[1] || 'btc';
        ticker = crypto.toUpperCase();
    }
    let type: string = 'Ação';
    if (/\b11\b/.test(ticker)) type = 'Fundo Imobiliário';
    if (/^[A-Z]{2,5}$/.test(ticker) && /(btc|eth|xrp|ada|sol)/i.test(lower)) type = 'Criptomoeda';
    if (!ticker || (isNaN(qtyNum) && isNaN(amountNum))) return null;
    const finalQty = isNaN(qtyNum) ? 1 : qtyNum;
    const finalPrice = isNaN(unitPrice) ? (isNaN(amountNum) ? NaN : amountNum / finalQty) : unitPrice;
    if (isNaN(finalPrice)) return null;
    return {
        kind: 'variable',
        data: {
            type,
            ticker: ticker.toUpperCase(),
            quantity: finalQty,
            purchasePrice: finalPrice,
                purchaseDate: dateStr || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
        }
    };
};

// Polling setup
let intervalId: number | null = null;
export const subscribeToMarketUpdates = (_tickers: string[], _callback: (data: MarketDataResponse) => void): (() => void) => {
    // Manual updates only; polling disabled
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    return () => {};
};
const brapiBase = (): string => {
    return '/proxy/brapi';
};

export const simulateInvestmentPurchase = async (simulation: {
    ticker: string;
    amount: number;
    price?: number;
    bazinPrice?: number;
    grahamPrice?: number;
    fiiCeilingPrice?: number;
    pvp?: number;
    drawdownFromAthPct?: number;
    dividendYield?: number;
    assetClass?: string;
}, context: {
    totalInvested: number;
    assets: any[];
}): Promise<{ text: string; provider?: string; model?: string }> => {
    const token = typeof window !== 'undefined' ? (window.localStorage.getItem('gestor_financeiro_app_token') || window.localStorage.getItem('financeplus_app_token')) : null;
    const res = await fetch('/api/ai/advice', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
            kind: 'investment_simulator',
            simulation,
            context
        })
    });
    if (!res.ok) {
        throw new Error(`Falha ao simular aporte: ${res.statusText}`);
    }
    return await res.json();
};

