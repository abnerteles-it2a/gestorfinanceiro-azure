import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useFinancialData } from '../context/FinancialDataContext';
import { AssetType } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ─── TYPES ───────────────────────────────────────────────────────────────────
export type InvTab = 'carteira' | 'proventos' | 'rentabilidade' | 'simulador';

interface DividendItem {
  ticker: string;
  label: string;
  paymentDate: string;
  rate: number;
}

interface PerfPoint {
  month: string;
  portfolio?: number;
  ibov?: number;
  cdi?: number;
  searched?: number;
}

function linearRegression(series: { date: string; close: number }[]) {
  const n = series.length;
  if (n < 3) return null;
  const ys = series.map(h => h.close);
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const num = ys.reduce((acc, y, i) => acc + (i - meanX) * (y - meanY), 0);
  const den = ys.reduce((acc, _, i) => acc + (i - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const projected3m = intercept + slope * (n - 1 + 3);
  const retPct = ((projected3m / ys[ys.length - 1]) - 1) * 100;
  return { slope, projected3m, retPct, direction: slope >= 0 ? 'alta' : 'queda' as const };
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────
export const InvTabBar: React.FC<{ active: InvTab; onChange: (t: InvTab) => void }> = ({ active, onChange }) => {
  const tabs: { id: InvTab; label: string; icon: string }[] = [
    { id: 'carteira', label: 'Carteira', icon: '📊' },
    { id: 'proventos', label: 'Proventos', icon: '💰' },
    { id: 'rentabilidade', label: 'Rentabilidade', icon: '📈' },
    { id: 'simulador', label: 'Simulador', icon: '🎯' },
  ];
  return (
    <div className="flex gap-1 bg-slate-100/60 dark:bg-slate-900/60 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
            active === t.id
              ? 'bg-white dark:bg-slate-800 text-teal-600 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
};

// ─── DIVIDENDS PANEL — CALENDÁRIO ────────────────────────────────────────────
export const DividendsPanel: React.FC = () => {
  const { investments } = useFinancialData();
  const [divs, setDivs] = useState<DividendItem[]>([]);
  const [loading, setLoading] = useState(false);

  const b3Tickers = investments
    .filter(i => i.type !== AssetType.CRYPTO && i.ticker && /\d{1,2}$/.test(i.ticker))
    .map(i => i.ticker);

  const load = useCallback(async () => {
    if (!b3Tickers.length) return;
    setLoading(true);
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const r = await fetch(`/api/portfolio/dividends?tickers=${b3Tickers.join(',')}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await r.json();
      if (json.ok) setDivs(json.dividends || []);
    } finally { setLoading(false); }
  }, [b3Tickers.join(',')]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  // Separate upcoming vs recent (last 90 days)
  const upcoming = divs
    .filter(d => d.paymentDate && d.paymentDate.slice(0, 10) >= today)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recent = divs
    .filter(d => d.paymentDate && d.paymentDate.slice(0, 10) < today && d.paymentDate.slice(0, 10) >= ninetyDaysAgo)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const nextEvent = upcoming[0];
  const daysUntilNext = nextEvent
    ? Math.ceil((new Date(nextEvent.paymentDate.slice(0, 10)).getTime() - new Date(today).getTime()) / 86400000)
    : null;

  const fmtDate = (iso: string) => {
    try { return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return iso; }
  };

  const labelColor = (label: string) => {
    const l = label.toUpperCase();
    if (l.includes('JCP')) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    if (l.includes('AMORT')) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
  };

  const EventRow = ({ d, dim }: { d: DividendItem; dim?: boolean }) => (
    <tr className={`bg-amber-50/15 hover:bg-amber-100/25 dark:bg-amber-950/5 dark:hover:bg-amber-950/10 transition-colors ${dim ? 'opacity-60' : ''}`}>
      <td className="px-4 py-2.5 font-black text-[11px] text-slate-900 dark:text-white">{d.ticker}</td>
      <td className="px-4 py-2.5 text-right">
        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${labelColor(d.label)}`}>{d.label}</span>
      </td>
      <td className="px-4 py-2.5 text-[11px] text-slate-500 text-right tabular-nums">{d.paymentDate ? fmtDate(d.paymentDate) : '—'}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400 font-black text-xs font-mono">
          {formatCurrency(d.rate)}
        </span>
      </td>
    </tr>
  );

  if (!b3Tickers.length) return (
    <div className="text-center py-16 text-slate-400 text-sm">Nenhum ativo B3 cadastrado</div>
  );

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-2xl p-5 border-l-4 border-l-teal-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800 dark:border-r-slate-800">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Próximo Pagamento</div>
          {nextEvent ? (
            <>
              <div className="text-xl font-black text-teal-600 tabular-nums">{nextEvent.ticker}</div>
              <div className="text-[10px] text-slate-500 mt-1">{fmtDate(nextEvent.paymentDate)} · {formatCurrency(nextEvent.rate)}/cota</div>
            </>
          ) : (
            <div className="text-sm text-slate-400 mt-1">Nenhum agendado</div>
          )}
        </div>
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-2xl p-5 border-l-4 border-l-amber-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800 dark:border-r-slate-800">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dias para o Próximo</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {daysUntilNext !== null ? `${daysUntilNext}d` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{upcoming.length} evento{upcoming.length !== 1 ? 's' : ''} agendado{upcoming.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-2xl p-5 border-l-4 border-l-indigo-500 border border-y-slate-200 border-r-slate-200 dark:border-y-slate-800 dark:border-r-slate-800">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Ativos Monitorados</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{b3Tickers.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">apenas ações (FIIs: BRAPI Pro)</div>
        </div>
      </div>

      {/* Upcoming events */}
      <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"/>
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Próximos Pagamentos</h2>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm animate-pulse">Buscando calendário...</div>
        ) : upcoming.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Nenhum pagamento futuro encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Ticker','Tipo','Data Pagamento','R$/Cota'].map(h => (
                    <th key={h} className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcoming.map((d, i) => <EventRow key={i} d={d} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent events (last 90 days) */}
      {recent.length > 0 && (
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamentos Recentes — últimos 90 dias</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/50">
                <tr>
                  {['Ticker','Tipo','Data Pagamento','R$/Cota'].map(h => (
                    <th key={h} className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((d, i) => <EventRow key={i} d={d} dim />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[10px] text-slate-400 px-1">
        <span className="font-black text-slate-500">Nota:</span> Datas de pagamento obtidas via BRAPI. FIIs detalhados (vacância, P/VP, calendário completo) requerem BRAPI Pro.
      </div>
    </div>
  );
};


// ─── PERFORMANCE PANEL ───────────────────────────────────────────────────────
export const PerformancePanel: React.FC = () => {
  const { investments, marketData } = useFinancialData();
  const [rawPortfolio, setRawPortfolio] = useState<Record<string, { date: string; close: number }[]>>({});
  const [rawIbov, setRawIbov] = useState<{ date: string; close: number }[]>([]);
  const [rawCdi, setRawCdi] = useState<{ date: string; value: number }[]>([]);
  const [tickerPerf, setTickerPerf] = useState<{ ticker: string; ret: number; pts: number }[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('consolidada');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Search feature
  const [searchInput, setSearchInput] = useState('');
  const [searchTicker, setSearchTicker] = useState('');
  const [searchSeries, setSearchSeries] = useState<{ date: string; close: number }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [trend, setTrend] = useState<ReturnType<typeof linearRegression>>(null);

  const b3Invs = investments.filter(i => /\d{1,2}$/.test(i.ticker));
  const b3Tickers = b3Invs.map(i => i.ticker);

  const totalCost = b3Invs.reduce((a, i) => a + i.purchasePrice * i.quantity, 0);
  const weights: Record<string, number> = {};
  b3Invs.forEach(i => { weights[i.ticker] = totalCost > 0 ? (i.purchasePrice * i.quantity) / totalCost : 0; });

  const load = useCallback(async () => {
    if (!b3Tickers.length) return;
    setLoading(true); setError('');
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const r = await fetch(`/api/portfolio/performance?tickers=${b3Tickers.join(',')}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await r.json();
      if (!json.ok) { setError('Erro ao carregar dados de performance.'); return; }
      const { portfolioSeries, ibovSeries, cdiSeries } = json;
      setRawPortfolio(portfolioSeries || {});
      setRawIbov(ibovSeries || []);
      setRawCdi(cdiSeries || []);

      const perTicker: { ticker: string; ret: number; pts: number }[] = [];
      b3Tickers.forEach(ticker => {
        const s: { date: string; close: number }[] = (portfolioSeries || {})[ticker] || [];
        if (!s.length) return;
        const base = s[0].close; const last = s[s.length - 1].close;
        if (base > 0) perTicker.push({ ticker, ret: ((last / base) - 1) * 100, pts: s.length });
      });
      setTickerPerf(perTicker.sort((a, b) => b.ret - a.ret));
    } catch { setError('Erro de conexão ao carregar performance.'); }
    finally { setLoading(false); }
  }, [b3Tickers.join(',')]);

  useEffect(() => { load(); }, [load]);

  // Search: fetch a custom ticker
  const handleSearch = useCallback(async () => {
    const t = searchInput.trim().toUpperCase();
    if (!t) return;
    setSearchLoading(true); setSearchError(''); setSearchTicker(t); setSearchSeries([]); setTrend(null);
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const r = await fetch(`/api/portfolio/performance?tickers=${t}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await r.json();
      if (!json.ok) { setSearchError(`Não foi possível carregar dados para ${t}.`); return; }
      const s: { date: string; close: number }[] = (json.portfolioSeries || {})[t] || [];
      if (!s.length) { setSearchError(`Nenhum dado histórico encontrado para ${t}.`); return; }
      setSearchSeries(s);
      setTrend(linearRegression(s));
    } catch { setSearchError('Erro de conexão.'); }
    finally { setSearchLoading(false); }
  }, [searchInput]);

  // Chart data computed per selectedTicker + optional searched ticker
  const chartData = useMemo((): PerfPoint[] => {
    // Build the month axis from ALL available series (ibov + cdi + portfolio + search)
    const allMonths = new Set<string>();
    rawIbov.forEach(h => allMonths.add(h.date.slice(0, 7)));
    rawCdi.forEach(c => allMonths.add(c.date.slice(0, 7)));   // CDI always available — anchors the axis
    Object.values(rawPortfolio).forEach(s => s.forEach(h => allMonths.add(h.date.slice(0, 7))));
    searchSeries.forEach(h => allMonths.add(h.date.slice(0, 7)));
    if (!allMonths.size) return [];
    const months = [...allMonths].sort();

    // Base prices for % return calculation
    const ibovBase = rawIbov.length
      ? (rawIbov.find(h => h.date.slice(0, 7) === months[0])?.close ?? rawIbov[0]?.close ?? 1)
      : null;
    const searchBase = searchSeries[0]?.close || 1;
    let cdiAcc = 0;

    return months.map(month => {
      // ── IBOV / BOVA11
      let ibovRet: number | undefined;
      if (ibovBase !== null && rawIbov.length) {
        const entry = rawIbov.find(h => h.date.slice(0, 7) === month);
        const c = entry?.close ?? ibovBase;
        ibovRet = parseFloat(((c / ibovBase) - 1) * 100 + '');
      }

      // ── CDI accumulated (robust date match)
      const cdiM = rawCdi.find(c => c.date.slice(0, 7) === month);
      if (cdiM) cdiAcc += cdiM.value;

      // ── Searched ticker
      let searchedRet: number | undefined;
      if (searchSeries.length) {
        const sc = searchSeries.find(h => h.date.slice(0, 7) === month)?.close;
        if (sc) searchedRet = parseFloat(((sc / searchBase) - 1) * 100 + '');
      }

      // ── Portfolio (weighted consolidada or single ticker)
      let portfolioRet: number | undefined;
      if (selectedTicker === 'consolidada') {
        let portRet = 0; let wc = 0;
        b3Tickers.forEach(ticker => {
          const s = rawPortfolio[ticker] || [];
          const base = s[0]?.close || 0;
          const cur = s.find(h => h.date.slice(0, 7) === month)?.close;
          if (base > 0 && cur) { portRet += ((cur / base) - 1) * 100 * (weights[ticker] || 0); wc++; }
        });
        if (wc > 0) portfolioRet = parseFloat(portRet.toFixed(2));
      } else {
        const s = rawPortfolio[selectedTicker] || [];
        const base = s[0]?.close || 0;
        const cur = s.find(h => h.date.slice(0, 7) === month)?.close;
        if (base > 0 && cur) portfolioRet = parseFloat(((cur / base) - 1) * 100 + '');
      }

      return {
        month,
        ibov:      ibovRet      !== undefined ? parseFloat(ibovRet.toFixed(2))      : undefined,
        cdi:       parseFloat(cdiAcc.toFixed(2)),
        portfolio: portfolioRet !== undefined ? portfolioRet                          : undefined,
        searched:  searchedRet  !== undefined ? parseFloat(searchedRet.toFixed(2))  : undefined,
      };
    });
  }, [rawPortfolio, rawIbov, rawCdi, selectedTicker, searchSeries]);


  // "Posição Real" — uses purchase price from user's records vs current market price
  const realPositions = useMemo(() => {
    return b3Invs
      .filter(i => marketData?.[i.ticker]?.price)
      .map(i => {
        const currentPrice = marketData[i.ticker]?.price || 0;
        const realRet = currentPrice > 0 ? ((currentPrice / i.purchasePrice) - 1) * 100 : 0;
        const purchaseMonth = i.purchaseDate?.slice(0, 7) || '';
        const cdiSincePurchase = rawCdi.filter(c => c.date >= purchaseMonth).reduce((s, c) => s + c.value, 0);
        return { ticker: i.ticker, purchasePrice: i.purchasePrice, currentPrice, purchaseDate: i.purchaseDate, realRet, cdiSincePurchase, delta: realRet - cdiSincePurchase };
      })
      .sort((a, b) => b.realRet - a.realRet);
  }, [b3Invs, marketData, rawCdi]);

  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const chartLabel = selectedTicker === 'consolidada' ? 'Carteira Consolidada' : selectedTicker;

  return (
    <div className="space-y-6">
      {/* Ticker selector + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Visualizar:</span>
        {['consolidada', ...b3Tickers].map(t => (
          <button key={t} onClick={() => setSelectedTicker(t)}
            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
              selectedTicker === t
                ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>{t === 'consolidada' ? '📊 Consolidada' : t}</button>
        ))}
      </div>

      {/* Busca de ativo */}
      <div className="bg-white/40 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-3">🔍 Analisar Ativo — tendência histórica 12m</p>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text" value={searchInput} placeholder="Ex: VALE3, ITUB4, EGIE3..."
            onChange={e => setSearchInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button onClick={handleSearch} disabled={searchLoading}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {searchLoading ? 'Buscando...' : 'Analisar'}
          </button>
          {searchTicker && (
            <button onClick={() => { setSearchTicker(''); setSearchSeries([]); setTrend(null); setSearchInput(''); }}
              className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
              ✕ Limpar
            </button>
          )}
        </div>
        {searchError && <p className="text-rose-500 text-[10px] mt-2 font-bold">{searchError}</p>}
      </div>

      {/* Trend card */}
      {trend && searchTicker && (
        <div className={`rounded-2xl border p-4 flex items-center justify-between flex-wrap gap-4 ${
          trend.direction === 'alta'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
        }`}>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 mb-1">Tendência — {searchTicker} (últimos 12 meses)</p>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-black ${trend.direction === 'alta' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {trend.direction === 'alta' ? '📈 ALTA' : '📉 QUEDA'}
              </span>
              <span className={`text-[11px] font-bold ${trend.direction === 'alta' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                Inclinação: {trend.slope >= 0 ? '+' : ''}{trend.slope.toFixed(2)}/mês
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 mb-1">Projeção +3 meses</p>
            <p className={`text-xl font-black tabular-nums ${trend.direction === 'alta' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatCurrency(trend.projected3m)}
            </p>
            <p className={`text-[10px] font-bold ${trend.retPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trend.retPct >= 0 ? '+' : ''}{trend.retPct.toFixed(2)}% vs hoje
            </p>
            <p className="text-[8px] text-slate-400 dark:text-slate-400 mt-0.5">Regressão linear — não é recomendação de investimento</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="text-[10px] font-black text-slate-500 dark:text-slate-200 uppercase tracking-widest">
            Rentabilidade — 12m — <span className="text-teal-500">{chartLabel}</span>
            {searchTicker && <span className="text-pink-400"> + {searchTicker}</span>}
            <span className="font-normal text-slate-400 dark:text-slate-400"> (base: preço histórico)</span>
          </h2>
          <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-teal-500 inline-block"/>{chartLabel}</span>
            {searchTicker && <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-pink-500 inline-block"/>{searchTicker}</span>}
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-indigo-500 inline-block"/>BOVA11</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-amber-500 inline-block"/>CDI</span>
          </div>
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-400 animate-pulse">Carregando dados históricos...</div>
        ) : error ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <span className="text-rose-500 text-sm font-bold">{error}</span>
            <button onClick={load} className="text-[10px] uppercase font-black tracking-widest px-4 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">Tentar novamente</button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-400 text-sm">Sem dados históricos disponíveis</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v: any) => typeof v === 'number' ? fmt(v) : '—'} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px', color: '#fff' }} />
              <Line type="monotone" dataKey="portfolio" name={chartLabel} stroke="#0D9488" strokeWidth={2.5} dot={false} connectNulls />
              {searchTicker && <Line type="monotone" dataKey="searched" name={searchTicker} stroke="#ec4899" strokeWidth={2.5} dot={false} connectNulls />}
              <Line type="monotone" dataKey="ibov" name="BOVA11/IBOV" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" connectNulls />
              <Line type="monotone" dataKey="cdi" name="CDI" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="2 2" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Posição Real */}
      {realPositions.length > 0 && (
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-700">
            <h2 className="text-[10px] font-black text-slate-500 dark:text-slate-200 uppercase tracking-widest">Minha Posição Real — desde a data de compra</h2>
            <p className="text-[9px] text-slate-400 dark:text-slate-400 mt-0.5">Compara o retorno real (preço de compra → cotação atual) com o CDI acumulado no mesmo período.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {['Ticker','Comprado em','P. Compra','P. Atual','Retorno Real','CDI no Período','Δ vs CDI'].map(h => (
                    <th key={h} className="px-4 py-3 text-[9px] font-black text-slate-500 dark:text-slate-200 uppercase tracking-widest text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {realPositions.map(p => (
                  <tr key={p.ticker} className="bg-teal-50/15 hover:bg-teal-100/25 dark:bg-teal-950/5 dark:hover:bg-teal-950/10 transition-colors">
                    <td className="px-4 py-3 font-black text-[12px] text-slate-900 dark:text-white">{p.ticker}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-300 text-right tabular-nums">
                      {p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-slate-200 text-right tabular-nums">{formatCurrency(p.purchasePrice)}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-slate-200 text-right tabular-nums">{formatCurrency(p.currentPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs font-mono border ${
                        p.realRet >= 0 
                          ? 'bg-emerald-500/10 text-emerald-805 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400' 
                          : 'bg-rose-500/10 text-rose-805 border-rose-200/40 dark:border-transparent dark:bg-rose-950/20 dark:text-rose-400'
                      }`}>
                        {fmt(p.realRet)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-805 border border-amber-200/40 dark:border-transparent dark:bg-amber-950/20 dark:text-amber-400 font-black text-xs font-mono">
                        {fmt(p.cdiSincePurchase)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs font-mono border ${
                        p.delta >= 0 
                          ? 'bg-emerald-600/15 text-emerald-900 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/30 dark:text-emerald-300' 
                          : 'bg-rose-600/15 text-rose-900 border-rose-200/40 dark:border-transparent dark:bg-rose-950/30 dark:text-rose-300'
                      }`}>
                        {p.delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(p.delta))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-ticker 12m historical breakdown */}
      {tickerPerf.length > 0 && (
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/60 dark:border-slate-700">
            <h2 className="text-[10px] font-black text-slate-500 dark:text-slate-200 uppercase tracking-widest">Performance Histórica por Ativo — D-365 → Hoje</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {tickerPerf.map(({ ticker, ret, pts }) => (
              <div key={ticker} className="px-6 py-3 flex items-center justify-between bg-slate-50/20 hover:bg-slate-100/40 dark:bg-slate-900/10 dark:hover:bg-slate-800/20 cursor-pointer transition-colors" onClick={() => setSelectedTicker(ticker)}>
                <div className="flex items-center gap-4">
                  <span className="font-black text-[12px] text-slate-900 dark:text-white w-16">{ticker}</span>
                  <div className="w-28 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ret >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(Math.abs(ret) / 60 * 100, 100)}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400 dark:text-slate-400">{pts} meses</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-slate-400 dark:text-slate-400 uppercase font-bold tracking-widest">Ver no gráfico →</span>
                  <span className={`inline-block px-3 py-1 rounded-lg font-black text-xs font-mono border ${
                    ret >= 0 
                      ? 'bg-emerald-500/10 text-emerald-805 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400' 
                      : 'bg-rose-500/10 text-rose-805 border-rose-200/40 dark:border-transparent dark:bg-rose-950/20 dark:text-rose-400'
                  }`}>
                    {fmt(ret)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-100/80 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-300 space-y-1">
        <div><span className="font-black text-slate-600 dark:text-slate-200">Gráfico 12m:</span> Base = preço histórico D-365. Não considera data de compra do usuário.</div>
        <div><span className="font-black text-slate-600 dark:text-slate-200">Posição Real:</span> Usa o preço de compra cadastrado × cotação atual. CDI via BACEN SGS-4391.</div>
        <div><span className="font-black text-slate-600 dark:text-slate-200">Projeção:</span> Regressão linear simples sobre histórico de preços — <span className="text-rose-400">não é recomendação de investimento.</span></div>
      </div>
    </div>
  );
};

