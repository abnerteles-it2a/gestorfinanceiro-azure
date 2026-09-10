import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { AlertTriangleIcon, TrendingUpIcon, ArrowDownIcon, SparklesIcon, WalletIcon } from './icons';

interface CrisisScenario {
  id: string;
  name: string;
  period: string;
  description: string;
  shockEquities: number;      // % shock
  shockFiis: number;          // % shock
  shockFixedIncome: number;   // % shock
  shockCrypto: number;        // % shock
  benchmarkIbovShock: number; // % drop for reference
  recoveryMonths: number;     // Historical months to full recovery
}

const HISTORICAL_CRISES: CrisisScenario[] = [
  {
    id: 'covid19',
    name: 'Circuit Breaker COVID-19',
    period: 'Fev - Mar / 2020',
    description: 'Pânico global e interrupção das cadeias de suprimentos. 6 circuit breakers acionados na B3 em 8 dias de pregão.',
    shockEquities: -35.2,
    shockFiis: -18.5,
    shockFixedIncome: 0.5,
    shockCrypto: -48.0,
    benchmarkIbovShock: -45.0,
    recoveryMonths: 9,
  },
  {
    id: 'joesley_day',
    name: 'Joesley Day (Gravações JBS)',
    period: '18 de Maio de 2017',
    description: 'Crise política súbita provocando circuit breaker instantâneo de -10,5% no Ibovespa e disparada do dólar.',
    shockEquities: -10.5,
    shockFiis: -4.8,
    shockFixedIncome: -1.2,
    shockCrypto: 0.0,
    benchmarkIbovShock: -10.5,
    recoveryMonths: 4,
  },
  {
    id: 'subprime_2008',
    name: 'Crise Financeira Global (Subprime)',
    period: 'Setembro de 2008',
    description: 'Quebra do Lehman Brothers e colapso de liquidez internacional. Retração aguda de commodities e bancos.',
    shockEquities: -44.0,
    shockFiis: -25.0,
    shockFixedIncome: 12.0,
    shockCrypto: 0.0,
    benchmarkIbovShock: -41.2,
    recoveryMonths: 14,
  },
  {
    id: 'selic_shock_15',
    name: 'Choque de Juros Altos (Selic 15%+)',
    period: 'Cenário de Estresse Fiscal',
    description: 'Aperto monetário severo. Compressão de múltiplos em ações de crescimento e desvalorização de FIIs de tijolo.',
    shockEquities: -15.0,
    shockFiis: -12.0,
    shockFixedIncome: 14.5,
    shockCrypto: -25.0,
    benchmarkIbovShock: -12.0,
    recoveryMonths: 7,
  }
];

export const StressTestLab: React.FC = () => {
  const { totalInvested, portfolioValue, investments, fixedIncomeInvestments } = useFinancialData();
  const currentEquity = portfolioValue > 0 ? portfolioValue : (totalInvested > 0 ? totalInvested : 100000);

  const [selectedCrisisId, setSelectedCrisisId] = useState<string>('covid19');

  // Asset class breakdown
  const allocation = useMemo(() => {
    let equitiesVal = 0;
    let fiisVal = 0;
    let cryptoVal = 0;
    let fixedVal = 0;

    investments.forEach(inv => {
      const val = (inv.purchasePrice || 0) * (inv.quantity || 0);
      const type = String(inv.type || '').toUpperCase();
      if (type.includes('CRYPTO') || type.includes('CRIPT')) cryptoVal += val;
      else if (type.includes('FII') || type.includes('IMOBIL')) fiisVal += val;
      else equitiesVal += val;
    });

    fixedIncomeInvestments.forEach(fi => {
      fixedVal += (fi.amountInvested || 0);
    });

    const sum = equitiesVal + fiisVal + cryptoVal + fixedVal;
    if (sum === 0) {
      // Benchmark default 40% eq, 30% fii, 25% fix, 5% cry
      return {
        equities: currentEquity * 0.4,
        fiis: currentEquity * 0.3,
        fixed: currentEquity * 0.25,
        crypto: currentEquity * 0.05,
        total: currentEquity,
      };
    }

    return {
      equities: equitiesVal,
      fiis: fiisVal,
      fixed: fixedVal,
      crypto: cryptoVal,
      total: sum,
    };
  }, [investments, fixedIncomeInvestments, currentEquity]);

  const selectedCrisis = useMemo(() => {
    return HISTORICAL_CRISES.find(c => c.id === selectedCrisisId) || HISTORICAL_CRISES[0];
  }, [selectedCrisisId]);

  // Stress calculation
  const impact = useMemo(() => {
    const eqDelta = allocation.equities * (selectedCrisis.shockEquities / 100);
    const fiiDelta = allocation.fiis * (selectedCrisis.shockFiis / 100);
    const fixDelta = allocation.fixed * (selectedCrisis.shockFixedIncome / 100);
    const cryDelta = allocation.crypto * (selectedCrisis.shockCrypto / 100);

    const totalDelta = eqDelta + fiiDelta + fixDelta + cryDelta;
    const finalEquity = Math.max(allocation.total + totalDelta, 0);
    const totalPercentage = allocation.total > 0 ? (totalDelta / allocation.total) * 100 : 0;

    // Resilience score (0 to 100): Lower drawdown vs benchmark Ibov = higher resilience
    const ibovRef = Math.abs(selectedCrisis.benchmarkIbovShock);
    const userDrawdown = Math.abs(totalPercentage);
    const resilience = Math.max(10, Math.min(98, Math.round(100 - (userDrawdown / ibovRef) * 50)));

    return {
      totalDelta,
      finalEquity,
      totalPercentage,
      resilience,
      eqDelta,
      fiiDelta,
      fixDelta,
      cryDelta,
    };
  }, [allocation, selectedCrisis]);

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangleIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Laboratório de Stress Testing (Choques Históricos)
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Simule a resiliência do seu patrimônio frente aos maiores episódios de volatilidade da história
            </p>
          </div>
        </div>

        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
          Base Patrimonial: {formatCurrency(allocation.total)}
        </span>
      </div>

      {/* Crisis Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HISTORICAL_CRISES.map(crisis => {
          const isSelected = crisis.id === selectedCrisisId;
          return (
            <button
              key={crisis.id}
              onClick={() => setSelectedCrisisId(crisis.id)}
              className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${
                isSelected
                  ? 'bg-slate-900 dark:bg-slate-800 text-white border-teal-500 shadow-md ring-1 ring-teal-500/50'
                  : 'bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest mb-1 text-teal-400">
                <span>{crisis.period}</span>
                <span className="font-mono text-rose-400">{crisis.benchmarkIbovShock}% Ibov</span>
              </div>
              <h4 className="text-xs font-black tracking-tight">{crisis.name}</h4>
              <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {crisis.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Main Stress Result Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Drawdown Estimado */}
        <div className="p-5 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
            <span>Impacto na Carteira</span>
            <span>Drawdown</span>
          </div>
          <div className="text-2xl font-black text-rose-700 dark:text-rose-300 font-mono mt-1">
            {formatCurrency(impact.totalDelta)}
          </div>
          <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
            <ArrowDownIcon className="w-3.5 h-3.5" />
            <span>{impact.totalPercentage.toFixed(2)}% do patrimônio</span>
          </div>
        </div>

        {/* Patrimônio Remanescente */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Patrimônio no Choque</span>
            <span>Pós-Crise</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {formatCurrency(impact.finalEquity)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Valor de liquidação no fundo do mercado
          </p>
        </div>

        {/* Score de Resiliência */}
        <div className="p-5 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
            <span>Score de Resiliência</span>
            <span>0 a 100</span>
          </div>
          <div className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1">
            {impact.resilience} / 100
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full rounded-full ${impact.resilience >= 70 ? 'bg-emerald-500' : impact.resilience >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${impact.resilience}%` }}
            />
          </div>
        </div>

        {/* Tempo de Recuperação Estimado */}
        <div className="p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <span>Tempo de Recuperação</span>
            <span>Histórico</span>
          </div>
          <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300 font-mono mt-1">
            ~{selectedCrisis.recoveryMonths} Meses
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Retorno aos patamares pré-crise com dividendos
          </p>
        </div>
      </div>

      {/* Class Impact Breakdown Table */}
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Decomposição de Perdas e Ganhos por Classe de Ativo
          </h4>
          <span className="text-[10px] text-slate-400 font-medium">Simulação sob {selectedCrisis.name}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3">Classe</th>
                <th className="px-5 py-3 text-right">Patrimônio Alocado</th>
                <th className="px-5 py-3 text-right">Choque Histórico</th>
                <th className="px-5 py-3 text-right">Impacto em R$</th>
                <th className="px-5 py-3 text-right">Papel na Crise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              <tr>
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">Ações Brasil (B3)</td>
                <td className="px-5 py-3 text-right font-mono">{formatCurrency(allocation.equities)}</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{selectedCrisis.shockEquities.toFixed(1)}%</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{formatCurrency(impact.eqDelta)}</td>
                <td className="px-5 py-3 text-right text-[11px] text-slate-400">Ativo de Risco / Queda de Múltiplos</td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">Fundos Imobiliários (FIIs)</td>
                <td className="px-5 py-3 text-right font-mono">{formatCurrency(allocation.fiis)}</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{selectedCrisis.shockFiis.toFixed(1)}%</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{formatCurrency(impact.fiiDelta)}</td>
                <td className="px-5 py-3 text-right text-[11px] text-slate-400">Volatilidade Menor / Fluxo de Aluguéis</td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">Renda Fixa & Caixa (CDI/Tesouro)</td>
                <td className="px-5 py-3 text-right font-mono">{formatCurrency(allocation.fixed)}</td>
                <td className={`px-5 py-3 text-right font-mono font-bold ${selectedCrisis.shockFixedIncome >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {selectedCrisis.shockFixedIncome >= 0 ? '+' : ''}{selectedCrisis.shockFixedIncome.toFixed(1)}%
                </td>
                <td className={`px-5 py-3 text-right font-mono font-bold ${impact.fixDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(impact.fixDelta)}
                </td>
                <td className="px-5 py-3 text-right text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">Colchão de Liquidez / Amortecedor</td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">Criptomoedas & Outros</td>
                <td className="px-5 py-3 text-right font-mono">{formatCurrency(allocation.crypto)}</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{selectedCrisis.shockCrypto.toFixed(1)}%</td>
                <td className="px-5 py-3 text-right font-mono text-rose-500 font-bold">{formatCurrency(impact.cryDelta)}</td>
                <td className="px-5 py-3 text-right text-[11px] text-slate-400">Alta Beta / Desalavancagem Rápida</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
