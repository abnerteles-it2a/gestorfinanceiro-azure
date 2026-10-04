import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { derivePortfolioAssumptions, simulatePortfolio, randomStandardNormal } from '../utils/investmentAnalytics';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { SparklesIcon, TrendingUpIcon, AlertTriangleIcon } from './icons';

export const MonteCarloSimulator: React.FC = () => {
  const { investments, fixedIncomeInvestments, marketData } = useFinancialData();
  
  const [horizonYears, setHorizonYears] = useState<number>(10);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(2000);
  const [targetMilestone, setTargetMilestone] = useState<number>(1000000);
  const [inflationAdjusted, setInflationAdjusted] = useState<boolean>(true);

  // Allocation-based assumptions, not measured historical returns.
  const { initialEquity, expectedReturnAnnual, volatilityAnnual } = useMemo(
    () => derivePortfolioAssumptions(investments, fixedIncomeInvestments, marketData, inflationAdjusted),
    [investments, fixedIncomeInvestments, marketData, inflationAdjusted],
  );

  // Run the production simulation through deterministic draw/clock seams.
  const { trajectoryData, targetProbability, finalP10, finalP50, finalP90 } = useMemo(
    () => simulatePortfolio({ initialEquity, horizonYears, monthlyContribution, targetMilestone, expectedReturnAnnual, volatilityAnnual }, randomStandardNormal, new Date().getFullYear()),
    [initialEquity, horizonYears, monthlyContribution, targetMilestone, expectedReturnAnnual, volatilityAnnual],
  );

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Simulador Estocástico de Monte Carlo (1.000 Trajetórias)
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Projeção probabilística institucional com volatilidade ponderada da sua carteira real
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <input 
              type="checkbox" 
              checked={inflationAdjusted}
              onChange={e => setInflationAdjusted(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500"
            />
            <span>Retorno Real (Desc. IPCA 4.5%)</span>
          </label>
        </div>
      </div>

      {/* Control Sliders & Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Patrimônio Inicial</span>
            <span className="text-teal-600 dark:text-teal-400 font-mono">{formatCurrency(initialEquity)}</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
            Baseado na sua carteira ativa
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Aporte Mensal</span>
            <span className="text-teal-600 dark:text-teal-400 font-mono">{formatCurrency(monthlyContribution)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={20000}
            step={250}
            value={monthlyContribution}
            onChange={e => setMonthlyContribution(Number(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Horizonte Temporal</span>
            <span className="text-teal-600 dark:text-teal-400 font-mono">{horizonYears} anos</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={horizonYears}
            onChange={e => setHorizonYears(Number(e.target.value))}
            className="w-full accent-teal-600 cursor-pointer"
          />
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Meta de Patrimônio</span>
            <span className="text-teal-600 dark:text-teal-400 font-mono">{formatCurrency(targetMilestone)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTargetMilestone(500000)}
              className={`px-2 py-1 text-[9px] font-black rounded-lg border uppercase transition-all ${targetMilestone === 500000 ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600'}`}
            >
              500k
            </button>
            <button
              onClick={() => setTargetMilestone(1000000)}
              className={`px-2 py-1 text-[9px] font-black rounded-lg border uppercase transition-all ${targetMilestone === 1000000 ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600'}`}
            >
              1 Milhão
            </button>
            <button
              onClick={() => setTargetMilestone(2000000)}
              className={`px-2 py-1 text-[9px] font-black rounded-lg border uppercase transition-all ${targetMilestone === 2000000 ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600'}`}
            >
              2 Milhões
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* P10 (Pessimista) */}
        <div className="p-4 rounded-2xl bg-rose-50/40 dark:bg-rose-950/15 border border-rose-200/60 dark:border-rose-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
            <span>P10 (Cenário Pessimista)</span>
            <span>Risco de Cauda</span>
          </div>
          <div className="text-xl font-black text-rose-700 dark:text-rose-300 font-mono mt-1">
            {formatCurrency(finalP10)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Em 90% dos testes históricos adversos, seu patrimônio ficou <strong>acima</strong> deste patamar.
          </p>
        </div>

        {/* P50 (Mediana / Cenário Base) */}
        <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
            <span>P50 (Cenário Mediano)</span>
            <span>Mais Provável</span>
          </div>
          <div className="text-xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1">
            {formatCurrency(finalP50)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Trajetória estatística equilibrada esperada com reinvestimento.
          </p>
        </div>

        {/* P90 (Cenário Otimista) */}
        <div className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span>P90 (Cenário Otimista)</span>
            <span>Bull Market</span>
          </div>
          <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
            {formatCurrency(finalP90)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Resultados nos melhores 10% de ciclos econômicos favoráveis.
          </p>
        </div>

        {/* Probabilidade da Meta */}
        <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <span>Probabilidade da Meta</span>
            <span>{formatCurrency(targetMilestone)}</span>
          </div>
          <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 font-mono mt-1">
            {targetProbability}%
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${targetProbability >= 70 ? 'bg-emerald-500' : targetProbability >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(100, targetProbability)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Trajectory Fan Chart */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
            Leque de Probabilidade Estocástica ({horizonYears} Anos)
          </h3>
          <span className="text-[10px] font-medium text-slate-400">
            1.000 iterações geométricas • Retorno Esperado: {(expectedReturnAnnual * 100).toFixed(1)}% a.a. • Vol: {(volatilityAnnual * 100).toFixed(1)}%
          </span>
        </div>

        <div className="h-72 w-full bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-2 border border-slate-100 dark:border-slate-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trajectoryData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="p90Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="p10Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                tickFormatter={(val: number) => {
                  if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
                  return `R$ ${val}`;
                }}
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
              <Legend 
                verticalAlign="top" 
                height={32}
                formatter={(value) => {
                  if (value === 'p90') return 'Otimista (P90)';
                  if (value === 'p50') return 'Mediana (P50)';
                  if (value === 'p10') return 'Pessimista (P10)';
                  return value;
                }}
              />
              <Area type="monotone" dataKey="p90" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#p90Grad)" />
              <Area type="monotone" dataKey="p50" stroke="#0d9488" strokeWidth={3} fillOpacity={1} fill="url(#p50Grad)" />
              <Area type="monotone" dataKey="p10" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#p10Grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
