import React, { useEffect, useState, useCallback, useRef } from 'react';

interface QuoteItem {
  label: string;
  value: string | null;
  change: number | null; // percentage
  symbol: string;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

const fmt = (v: number, decimals = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const ArrowUp = () => (
  <svg viewBox="0 0 10 10" fill="currentColor" className="inline w-3 h-3">
    <path d="M5 2l4 6H1z" />
  </svg>
);

const ArrowDown = () => (
  <svg viewBox="0 0 10 10" fill="currentColor" className="inline w-3 h-3">
    <path d="M5 8L1 2h8z" />
  </svg>
);

const Spinner = () => (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
);

export const MarketWidget: React.FC<{
  onGoToDashboard: () => void;
  onUpgrade: () => void;
  isPro: boolean;
}> = ({ onGoToDashboard, onUpgrade, isPro }) => {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'market' | 'news'>('market');
  const [newsIndex, setNewsIndex] = useState(0);
  // Controls are rendered as labeled buttons; no form fields are used here.
  const tickerRef = useRef<HTMLDivElement>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const marketHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
      // Fetch exchange rates through the authenticated market gateway.
      const fxRes = await fetch('/api/proxy?src=awesome&path=/json/last/USD-BRL,EUR-BRL,BTC-BRL', { headers: marketHeaders });
      const fxJson = await fxRes.json();

      const usd = fxJson?.USDBRL;
      const eur = fxJson?.EURBRL;
      const btc = fxJson?.BTCBRL;

      // Check if stock market (B3) is open (Mon-Fri 10:00 - 18:00 Brazil local time)
      const d = new Date();
      const day = d.getDay();
      const hour = d.getHours();
      const isMarketOpen = (day !== 0 && day !== 6 && hour >= 10 && hour < 18);

      // Fetch IBOV and IFIX through the authenticated market gateway.
      let ibovValue: number | null = null;
      let ibovChange: number | null = null;
      let ifixValue: number | null = null;
      let ifixChange: number | null = null;
      try {
        const [ibovRes, ifixRes] = await Promise.allSettled([
          fetch('/api/proxy?src=brapi&path=/api/quote/%5EBVSP&interval=1d&range=5d', { headers: marketHeaders }),
          fetch('/api/proxy?src=brapi&path=/api/quote/IFIX&interval=1d&range=5d', { headers: marketHeaders }),
        ]);
        if (ibovRes.status === 'fulfilled' && ibovRes.value.ok) {
          const ibovJson = await ibovRes.value.json();
          const r = ibovJson?.results?.[0];
          if (r) {
            ibovValue = r.regularMarketPrice ?? null;
            ibovChange = r.regularMarketChangePercent ?? null;
          }
        }
        if (ifixRes.status === 'fulfilled' && ifixRes.value.ok) {
          const ifixJson = await ifixRes.value.json();
          const r = ifixJson?.results?.[0];
          if (r) {
            ifixValue = r.regularMarketPrice ?? null;
            ifixChange = r.regularMarketChangePercent ?? null;
          }
        }
      } catch {}

      // SELIC (annualised rate, SGS 1178) and IPCA (monthly, SGS 13522) from BACEN (no key needed)
      let selicValue: number | null = null;
      let ipcaValue: number | null = null;
      try {
        const [selicRes, ipcaRes] = await Promise.allSettled([
          fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json'),
          fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json'),
        ]);
        if (selicRes.status === 'fulfilled') {
          const s = await selicRes.value.json();
          selicValue = parseFloat(s?.[0]?.valor?.replace(',', '.')) || null;
        }
        if (ipcaRes.status === 'fulfilled') {
          const i = await ipcaRes.value.json();
          ipcaValue = parseFloat(i?.[0]?.valor?.replace(',', '.')) || null;
        }
      } catch {}

      const built: QuoteItem[] = [
        {
          label: 'Dólar',
          symbol: 'USD',
          value: usd?.bid ? `R$ ${fmt(parseFloat(usd.bid))}` : null,
          change: usd?.pctChange ? parseFloat(usd.pctChange) : null,
        },
        {
          label: 'Euro',
          symbol: 'EUR',
          value: eur?.bid ? `R$ ${fmt(parseFloat(eur.bid))}` : null,
          change: eur?.pctChange ? parseFloat(eur.pctChange) : null,
        },
        {
          label: 'Bovespa',
          symbol: 'IBOV',
          value: ibovValue !== null ? fmt(ibovValue, 0) + ' pts' : null,
          change: ibovChange,
        },
        {
          label: 'Índice FIIs',
          symbol: 'IFIX',
          value: ifixValue !== null ? fmt(ifixValue, 0) + ' pts' : null,
          change: ifixChange,
        },
        {
          label: 'Bitcoin',
          symbol: 'BTC',
          value: btc?.bid ? `R$ ${fmt(parseFloat(btc.bid), 0)}` : null,
          change: btc?.pctChange ? parseFloat(btc.pctChange) : null,
        },
        {
          label: 'Selic',
          symbol: 'SELIC',
          value: selicValue !== null ? `${fmt(selicValue)} % a.a.` : null,
          change: null,
        },
        {
          label: 'IPCA',
          symbol: 'IPCA',
          value: ipcaValue !== null ? `${fmt(ipcaValue)} %` : null,
          change: null,
        },
      ];

      setQuotes(built);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // silently fail – keep last data
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      // Call our own backend route — fetches RSS server-side, no CORS/rate-limit issues
      const res = await fetch('/api/news');
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok && json?.items?.length) {
        setNews(json.items);
      }
    } catch { /* silently fail */ }
  }, []);


  useEffect(() => {
    fetchQuotes();
    fetchNews();
    const interval = setInterval(() => {
      fetchQuotes();
      fetchNews();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchQuotes, fetchNews]);

  // Auto-advance news carousel
  useEffect(() => {
    if (!news.length) return;
    const t = setInterval(() => setNewsIndex(i => (i + 1) % news.length), 5000);
    return () => clearInterval(t);
  }, [news.length]);

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        background: 'rgba(2,8,26,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 900, letterSpacing: '-0.01em' }}>
            📊 Mercado
          </span>
          {isPro && (
            <span style={{ color: '#0D9488', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(255,159,28,0.15)', padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(255,159,28,0.3)' }}>
              AO VIVO
            </span>
          )}
        </div>
        {lastUpdate && (
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700 }}>
            {lastUpdate}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 4 }}>
        {(['market', 'news'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab ? 'rgba(255,159,28,0.2)' : 'transparent',
              color: activeTab === tab ? '#0D9488' : 'rgba(255,255,255,0.4)',
              outline: activeTab === tab ? '1px solid rgba(255,159,28,0.4)' : '1px solid transparent',
            }}
          >
            {tab === 'market' ? '📈 Cotações' : '📰 Notícias'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 16px' }}>
        {activeTab === 'market' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', alignItems: 'center', gap: 8 }}>
                <Spinner />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Buscando cotações…</span>
              </div>
            ) : quotes.map(q => (
              <div
                key={q.symbol}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {q.symbol}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                    {q.label}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>
                    {q.value ?? '—'}
                  </div>
                  {q.change !== null && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: q.change >= 0 ? '#10B981' : '#F87171',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 2,
                    }}>
                      {q.change >= 0 ? <ArrowUp /> : <ArrowDown />}
                      {Math.abs(q.change).toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!news.length ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', alignItems: 'center', gap: 8 }}>
                <Spinner />
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Carregando notícias…</span>
              </div>
            ) : (
              <>
                {/* Active news card */}
                <a
                  href={news[newsIndex]?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    textDecoration: 'none',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    {news[newsIndex]?.source}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'white', lineHeight: 1.45, marginBottom: 6 }}>
                    {news[newsIndex]?.title}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                    {news[newsIndex]?.publishedAt
                      ? new Date(news[newsIndex].publishedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </a>

                {/* Dots nav */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                  {news.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setNewsIndex(i)}
                      style={{
                        width: i === newsIndex ? 16 : 6,
                        height: 6,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        background: i === newsIndex ? '#0D9488' : 'rgba(255,255,255,0.2)',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* CTA Footer */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          style={{
            width: '100%',
            padding: '12px 0',
            background: 'linear-gradient(135deg, #0D9488, #0F766E)',
            border: 'none',
            borderRadius: 10,
            color: 'white',
            fontSize: 11,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 15px rgba(255,159,28,0.3)',
          }}
          onClick={isPro ? onGoToDashboard : onUpgrade}
        >
          {isPro ? '→ Ir ao Dashboard' : '✦ Fazer Upgrade PRO'}
        </button>
      </div>
    </div>
  );
};
