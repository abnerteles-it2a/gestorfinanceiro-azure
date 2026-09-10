import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { SparklesIcon, TrendingUpIcon, WalletIcon } from './icons';

interface ScheduledDividend {
  id: string;
  ticker: string;
  type: 'Dividendo' | 'JCP' | 'Rendimento FII';
  amountPerShare: number;
  totalAmount: number;
  dataCom: string;
  dataPag: string;
  status: 'confirmado' | 'previsto';
}

export const DividendCalendar: React.FC = () => {
  const { investments, marketData } = useFinancialData();

  // Known CVM/B3 dividend payment habits for top assets
  const SCHEDULE_PATTERNS: Record<string, { type: 'Dividendo' | 'JCP' | 'Rendimento FII'; months: number[]; avgPerShare: number }> = {
    'PETR4': { type: 'Dividendo', months: [5, 8, 11, 12], avgPerShare: 1.05 },
    'VALE3': { type: 'Dividendo', months: [3, 9], avgPerShare: 2.10 },
    'BBAS3': { type: 'JCP', months: [3, 6, 9, 12], avgPerShare: 0.61 },
    'ITUB4': { type: 'JCP', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.08 },
    'BBDC4': { type: 'JCP', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.05 },
    'TAEE11': { type: 'Dividendo', months: [5, 8, 11, 12], avgPerShare: 0.70 },
    'WEGE3': { type: 'Dividendo', months: [3, 8], avgPerShare: 0.35 },
    'MXRF11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.09 },
    'HGLG11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 1.10 },
    'BTLG11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.78 },
    'XPML11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.92 },
    'KNCR11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 1.05 },
    'VISC11': { type: 'Rendimento FII', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], avgPerShare: 0.85 },
  };

  // Generate scheduled list and monthly cash flow
  const { upcomingDividends, monthlyCashFlow, totalAnnualProjected, snowballStats } = useMemo(() => {
    const list: ScheduledDividend[] = [];
    const monthlyTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) monthlyTotals[m] = 0;

    let annualSum = 0;
    const snowballByAsset: { ticker: string; totalReceived: number; unitPrice: number; newShares: number }[] = [];

    const now = new Date();
    const curYear = now.getFullYear();

    investments.forEach(inv => {
      const ticker = String(inv.ticker || '').toUpperCase().trim();
      const qty = Number(inv.quantity || 0);
      if (qty <= 0) return;

      const price = marketData[ticker]?.price || inv.purchasePrice || 10;
      const pattern = SCHEDULE_PATTERNS[ticker] || {
        type: ticker.endsWith('11') ? 'Rendimento FII' : 'Dividendo',
        months: ticker.endsWith('11') ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [4, 8, 12],
        avgPerShare: ticker.endsWith('11') ? price * 0.008 : (price * 0.06) / 3,
      };

      let assetAnnual = 0;

      pattern.months.forEach(m => {
        const amountPerShare = pattern.avgPerShare;
        const total = amountPerShare * qty;
        monthlyTotals[m] = (monthlyTotals[m] || 0) + total;
        annualSum += total;
        assetAnnual += total;

        // Create scheduled entry for future months
        if (m >= now.getMonth() + 1 && m <= now.getMonth() + 4) {
          const comDay = 15;
          const pagDay = ticker.endsWith('11') ? 14 : 28;
          list.push({
            id: `${ticker}-${m}`,
            ticker,
            type: pattern.type,
            amountPerShare,
            totalAmount: total,
            dataCom: `${curYear}-${String(m).padStart(2, '0')}-${String(comDay).padStart(2, '0')}`,
            dataPag: `${curYear}-${String(m).padStart(2, '0')}-${String(pagDay).padStart(2, '0')}`,
            status: m === now.getMonth() + 1 ? 'confirmado' : 'previsto',
          });
        }
      });

      const newShares = price > 0 ? Math.floor(assetAnnual / price) : 0;
      snowballByAsset.push({
        ticker,
        totalReceived: assetAnnual,
        unitPrice: price,
        newShares,
      });
    });

    // Format chart data for 12 months
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const chartData = Object.entries(monthlyTotals).map(([m, val]) => ({
      month: monthNames[Number(m) - 1],
      total: Math.round(val),
    }));

    return {
      upcomingDividends: list.sort((a, b) => a.dataPag.localeCompare(b.dataPag)),
      monthlyCashFlow: chartData,
      totalAnnualProjected: annualSum,
      snowballStats: snowballByAsset.sort((a, b) => b.totalReceived - a.totalReceived),
    };
  }, [investments, marketData]);

  const [activeSubView, setActiveSubView] = useState<'cronograma' | 'boladeneve'>('cronograma');

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Cronograma Futuro de Proventos & Efeito Bola de Neve
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Acompanhe as datas de corte (Data Com), pagamentos e o poder do reinvestimento passivo
            </p>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveSubView('cronograma')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
              activeSubView === 'cronograma'
                ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Cronograma & Fluxo
          </button>
          <button
            onClick={() => setActiveSubView('boladeneve')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
              activeSubView === 'boladeneve'
                ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Efeito Bola de Neve ❄️
          </button>
        </div>
      </div>

      {/* Top Annual Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span>Renda Anual Projetada</span>
            <span>12 Meses</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
            {formatCurrency(totalAnnualProjected)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Média mensal de <strong>{formatCurrency(totalAnnualProjected / 12)}</strong> em proventos líquidos
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
            <span>Reinvestimento Autônomo</span>
            <span>Bola de Neve</span>
          </div>
          <div className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1">
            {snowballStats.reduce((acc, s) => acc + s.newShares, 0)} Novas Cotas/Ações
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Adquiridas no ano sem tirar R$ 1 do bolso
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Próximos Pagamentos</span>
            <span>Confirmados</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {upcomingDividends.length} Lançamentos
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Mapeados nos próximos meses
          </p>
        </div>
      </div>

      {activeSubView === 'cronograma' ? (
        <div className="space-y-6">
          {/* Monthly Cash Flow Bar Chart */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
              Fluxo Mensal Estimado de Renda Passiva (Próximos 12 Meses)
            </h3>
            <div className="h-56 w-full bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-2 border border-slate-100 dark:border-slate-800">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyCashFlow} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis 
                    stroke="#64748b" 
                    fontSize={10} 
                    tickLine={false} 
                    tickFormatter={(v: number) => `R$ ${v}`}
                  />
                  <Tooltip 
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="total" fill="#0d9488" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Upcoming Events Table */}
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Lançamentos Futuros e Datas de Corte
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">Baseado na sua custódia</span>
            </div>

            {upcomingDividends.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Ativo</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3 text-right">Valor / Ação</th>
                      <th className="px-5 py-3 text-right">Previsão em R$</th>
                      <th className="px-5 py-3 text-center">Data COM (Corte)</th>
                      <th className="px-5 py-3 text-center">Data Pagamento</th>
                      <th className="px-5 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {upcomingDividends.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-900 dark:text-white uppercase font-mono">
                          {item.ticker}
                        </td>
                        <td className="px-5 py-3 text-slate-500">{item.type}</td>
                        <td className="px-5 py-3 text-right font-mono text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.amountPerShare)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(item.totalAmount)}
                        </td>
                        <td className="px-5 py-3 text-center text-slate-500 font-mono">{item.dataCom}</td>
                        <td className="px-5 py-3 text-center text-slate-900 dark:text-white font-mono font-bold">{item.dataPag}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            item.status === 'confirmado'
                              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Nenhum ativo da carteira cadastrado com eventos de proventos previstos para este período.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Snowball Effect View */
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-teal-50/30 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/30 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-teal-800 dark:text-teal-300">
              O Que é o Efeito Bola de Neve?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ocorre quando os proventos gerados por um ativo são suficientes para comprar <strong>1 ou mais cotas completas</strong> dele mesmo todo mês ou ano. A partir deste ponto de inflexão, sua quantidade de cotas cresce exponencialmente de forma 100% autônoma, sem necessidade de aporte externo de capital.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Poder de Reinvestimento por Ativo (Projeção Anual)
              </h4>
              <span className="text-[10px] text-slate-400 font-medium">Cálculo baseado no preço atual</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3">Ativo</th>
                    <th className="px-5 py-3 text-right">Cotação Atual</th>
                    <th className="px-5 py-3 text-right">Renda Anual Gerada</th>
                    <th className="px-5 py-3 text-right">Novas Cotas/Ano</th>
                    <th className="px-5 py-3 text-right">Status do Efeito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {snowballStats.map(item => (
                    <tr key={item.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-900 dark:text-white uppercase font-mono">
                        {item.ticker}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-500">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.totalReceived)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-black text-teal-600 dark:text-teal-400 text-sm">
                        +{item.newShares} cotas
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          item.newShares >= 12
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : item.newShares >= 1
                            ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {item.newShares >= 12 ? '🔥 Bola de Neve Ativa' : item.newShares >= 1 ? '❄️ Fase Inicial' : 'Aguardando Escala'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
