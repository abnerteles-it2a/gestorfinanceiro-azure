import { api } from './api';

export interface MarketInfo {
    price: number;
    change: number;
    changePercent?: number;
    signal: 'Comprar' | 'Vender' | 'Manter';
}

export interface MarketData {
    [ticker: string]: MarketInfo;
}

export interface MarketDataResponse {
    data: MarketData;
    sources: { uri: string; title: string; }[];
}

const TICKER_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const USD_RATE_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const TOP_MOVERS_CACHE_DURATION = 20 * 60 * 1000; // 20 minutes

// In-memory cache
const tickerCache: Record<string, { data: MarketInfo, timestamp: number }> = {};
let cachedUsdRate: number | null = null;
let lastUsdRateFetchTime = 0;
let cachedTopMovers: MarketDataResponse | null = null;
let lastTopMoversFetchTime = 0;

const isB3Ticker = (t: string) => /\d{1,2}$/.test(t) && /(3|4|5|6|11)$/.test(t);
const isCryptoTicker = (t: string) => ['BTC','ETH','ADA','DOGE','SOL','XRP','LTC','BNB','DOT','MATIC'].includes(t.toUpperCase());

// Helper to fetch via proxy
const fetchFromProxy = async (source: string, path: string) => {
    try {
        const response = await api.get('/proxy', { 
            params: { src: source, path },
            timeout: 10000 
        });
        return response.data;
    } catch (error) {
        // console.error(`Proxy fetch failed for ${source} ${path}`, error);
        throw error;
    }
};

const getUsdToBrlRate = async (): Promise<number> => {
    if (cachedUsdRate !== null && (Date.now() - lastUsdRateFetchTime < USD_RATE_CACHE_DURATION)) {
        return cachedUsdRate;
    }
    try {
        const json = await fetchFromProxy('awesome', '/json/last/USD-BRL');
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

export const getMarketData = async (tickers: string[], force: boolean = false): Promise<MarketDataResponse> => {
    if (!tickers || tickers.length === 0) return { data: {}, sources: [] };

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

    const b3 = tickersToFetch.filter(isB3Ticker);
    const crypto = tickersToFetch.filter(isCryptoTicker);
    const intl = tickersToFetch.filter(t => !b3.includes(t) && !crypto.includes(t));

    const sources: { uri: string; title: string }[] = [];

    // 1. Fetch B3 via BRApi
    if (b3.length > 0) {
        try {
            // Bulk fetch
            const path = `/api/quote/${b3.join(',')}`;
            const json = await fetchFromProxy('brapi', path);
            const arr = json?.results || json?.result || [];
            
            arr.forEach((item: any) => {
                const ticker = (item.symbol || item.ticker || '').toUpperCase();
                let rawPrice: any;
                if (/11$/.test(ticker)) {
                    rawPrice = item.regularMarketPrice ?? item.price ?? item.last ?? item.lastPrice ?? item.close ?? item.regularMarketPreviousClose;
                } else {
                    rawPrice = item.regularMarketPrice ?? item.price ?? item.close ?? item.regularMarketPreviousClose ?? item.last ?? item.lastPrice;
                }
                const rawChange = item.regularMarketChange ?? item.change ?? item.difference ?? 0;
                
                const price = parseFloat(String(rawPrice));
                const change = parseFloat(String(rawChange));
                const changePercent = parseFloat(String(item.regularMarketChangePercent ?? 0));
                
                if (ticker && !isNaN(price) && price > 0) {
                    const info: MarketInfo = { 
                        price, 
                        change: isNaN(change) ? 0 : change, 
                        changePercent: isNaN(changePercent) ? 0 : changePercent,
                        signal: 'Manter' 
                    };
                    resultData[ticker] = info;
                    tickerCache[ticker] = { data: info, timestamp: now };
                }
            });
            sources.push({ uri: 'brapi', title: 'brapi.dev' });
        } catch (e) {
            console.error('BRApi bulk fetch failed', e);
        }
    }

    // 2. Fallback B3: Stooq
    const missingB3 = b3.filter(t => !resultData[t.toUpperCase()]);
    if (missingB3.length > 0) {
        try {
            const symbols = missingB3.map(t => `${t.toLowerCase()}.sa`).join(',');
            const path = `/q/l/?s=${encodeURIComponent(symbols)}&f=sd2t2ohlcv&h&e=json`;
            const sjson = await fetchFromProxy('stooq', path);
            const list = Array.isArray(sjson?.symbols) ? sjson.symbols : (Array.isArray(sjson) ? sjson : []);
            
            list.forEach((it: any) => {
                const sym = String(it.symbol || it.code || '').toUpperCase();
                const ticker = sym.replace('.SA', '').replace('.sa', '');
                const close = parseFloat(String(it.close ?? it.c ?? 0));
                const open = parseFloat(String(it.open ?? it.o ?? 0));
                const change = (!isNaN(close) && !isNaN(open) && open > 0) ? (close - open) : 0;
                const changePercent = (open > 0) ? (change / open * 100) : 0;
                const price = close;
                
                if (ticker && !isNaN(price) && price > 0) {
                    const info: MarketInfo = { price, change, changePercent, signal: 'Manter' };
                    resultData[ticker] = info;
                    tickerCache[ticker] = { data: info, timestamp: now };
                }
            });
            sources.push({ uri: 'stooq', title: 'stooq' });
        } catch (e) {
            console.error('Stooq fallback failed', e);
        }
    }

    // 3. Fallback B3: Yahoo
    const stillMissing = b3.filter(t => !resultData[t.toUpperCase()]);
    if (stillMissing.length > 0) {
        try {
            const symbols = stillMissing.map(t => `${t}.SA`).join(',');
            const path = `/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
            const yjson = await fetchFromProxy('yahoo', path);
            const list = (yjson?.quoteResponse?.result) || [];
            
            list.forEach((q: any) => {
                const sym = String(q.symbol || '').toUpperCase();
                const ticker = sym.replace('.SA', '');
                const rawPrice = q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? q.bid ?? q.ask ?? q.regularMarketPreviousClose;
                const rawChange = q.regularMarketChange ?? ((q.regularMarketPrice && q.regularMarketPreviousClose) ? (q.regularMarketPrice - q.regularMarketPreviousClose) : 0);
                
                const price = parseFloat(String(rawPrice));
                const change = parseFloat(String(rawChange));
                const changePercent = parseFloat(String(q.regularMarketChangePercent ?? 0));
                
                if (ticker && !isNaN(price) && price > 0) {
                    const info: MarketInfo = { 
                        price, 
                        change: isNaN(change) ? 0 : change, 
                        changePercent: isNaN(changePercent) ? 0 : changePercent,
                        signal: 'Manter' 
                    };
                    resultData[ticker] = info;
                    tickerCache[ticker] = { data: info, timestamp: now };
                }
            });
            sources.push({ uri: 'yahoo', title: 'Yahoo Finance' });
        } catch (e) {
            console.error('Yahoo fallback failed', e);
        }
    }

    // 4. Crypto
    if (crypto.length > 0) {
        try {
            // Using brapi for crypto as well if available, or coingecko
            for (const c of crypto) {
                const path = `/api/v2/crypto?coin=${c}&currency=BRL`;
                const json = await fetchFromProxy('brapi', path);
                const coin = json?.coins?.[0];
                const price = parseFloat(coin?.regularMarketPrice ?? '0');
                if (!isNaN(price) && price > 0) {
                    const info: MarketInfo = { 
                        price, 
                        change: parseFloat(coin?.regularMarketChange ?? '0') || 0, 
                        changePercent: parseFloat(coin?.regularMarketChangePercent ?? '0') || 0,
                        signal: 'Manter' 
                    };
                    resultData[c.toUpperCase()] = info;
                    tickerCache[c.toUpperCase()] = { data: info, timestamp: now };
                }
            }
            sources.push({ uri: 'brapi', title: 'brapi crypto' });
        } catch (e) {
            console.error('Crypto fetch failed', e);
        }
    }

    // 5. International (Stooq)
    if (intl.length > 0) {
        try {
            const usdRate = await getUsdToBrlRate();
            for (const t of intl) {
                const symbol = `${t.toLowerCase()}.us`;
                const path = `/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=json`;
                const json = await fetchFromProxy('stooq', path);
                const item = Array.isArray(json?.symbols) ? json.symbols[0] : (json?.symbols?.[0] || json);
                const close = parseFloat(item?.close ?? item?.c ?? '0');
                const open = parseFloat(item?.open ?? item?.o ?? '0');
                if (!isNaN(close) && close > 0) {
                    const priceBRL = close * usdRate;
                    const changeUSD = (!isNaN(close) && !isNaN(open) && open > 0) ? (close - open) : 0;
                    const changePercent = (open > 0) ? (changeUSD / open * 100) : 0;
                    const changeBRL = changeUSD * usdRate; // Approx
                    
                    const info: MarketInfo = { price: priceBRL, change: changeBRL, changePercent, signal: 'Manter' };
                    resultData[t.toUpperCase()] = info;
                    tickerCache[t.toUpperCase()] = { data: info, timestamp: now };
                }
            }
            sources.push({ uri: 'stooq', title: 'Stooq Intl' });
        } catch (e) {
            console.error('International fetch failed', e);
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
    
    // Use getMarketData which handles fallbacks (Brapi -> Stooq -> Yahoo)
    const result = await getMarketData(universe);
    
    if (Object.keys(result.data).length > 0) {
        cachedTopMovers = result;
        lastTopMoversFetchTime = Date.now();
    }
    return result;
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
