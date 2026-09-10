import React, { useState, useMemo, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { AssetType, type Investment, type FixedIncomeInvestment } from '../types';

interface AssetClassTarget {
  key: string;
  label: string;
  targetPct: number;
  color: string;
}

const DEFAULT_TARGETS: AssetClassTarget[] = [
  { key: 'stocks', label: 'Ações Brasil', targetPct: 40, color: '#0D9488' },
  { key: 'fiis', label: 'Fundos Imobiliários', targetPct: 30, color: '#10B981' },
  { key: 'fixed_income', label: 'Renda Fixa / Tesouro', targetPct: 20, color: '#6366F1' },
  { key: 'crypto', label: 'Criptomoedas / Ouro', targetPct: 10, color: '#F59E0B' }
];

export const SmartRebalancer: React.FC = () => {
  const { investments, fixedIncomeInvestments, marketData, totalBalance, isPrivacyMode } = useFinancialData();

  // Targets state with localStorage persistence
  const [targets, setTargets] = useState<AssetClassTarget[]>(() => {
    try {
      const saved = localStorage.getItem('gestor_financeiro_rebalance_targets');
      return saved ? JSON.parse(saved) : DEFAULT_TARGETS;
    } catch {
      return DEFAULT_TARGETS;
    }
  });

  const [contributionAmount, setContributionAmount] = useState<number>(2000);
  const [isEditingTargets, setIsEditingTargets] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('gestor_financeiro_rebalance_targets', JSON.stringify(targets));
    } catch {}
  }, [targets]);

  // Group assets into classes
  const portfolioBreakdown = useMemo(() => {
    let stocksVal = 0;
    let fiisVal = 0;
    let fixedVal = 0;
    let cryptoVal = 0;

    investments.forEach(inv => {
      const price = marketData[inv.ticker]?.price ?? inv.purchasePrice;
      const total = price * inv.quantity;

      if (inv.type === AssetType.REAL_ESTATE_FUND) {
        fiisVal += total;
      } else if (inv.type === AssetType.CRYPTO) {
        cryptoVal += total;
      } else {
        // STOCK, INTERNATIONAL, etc.
        stocksVal += total;
      }
    });

    fixedIncomeInvestments.forEach(fi => {
      fixedVal += Number(fi.amountInvested) || 0;
    });

    const totalPortfolio = stocksVal + fiisVal + fixedVal + cryptoVal;

    return {
      stocksVal,
      fiisVal,
      fixedVal,
      cryptoVal,
      totalPortfolio
    };
  }, [investments, fixedIncomeInvestments, marketData]);

  // Compute rebalancing math
  const rebalancePlan = useMemo(() => {
    const totalCurrent = portfolioBreakdown.totalPortfolio;
    const totalNew = totalCurrent + (Number(contributionAmount) || 0);

    const valuesMap: Record<string, number> = {
      stocks: portfolioBreakdown.stocksVal,
      fiis: portfolioBreakdown.fiisVal,
      fixed_income: portfolioBreakdown.fixedVal,
      crypto: portfolioBreakdown.cryptoVal
    };

    // Calculate ideal values after contribution
    const classes = targets.map(t => {
      const currentVal = valuesMap[t.key] || 0;
      const currentPct = totalCurrent > 0 ? (currentVal / totalCurrent) * 100 : 0;
      const idealVal = (totalNew * t.targetPct) / 100;
      const deficit = Math.max(0, idealVal - currentVal);

      return {
        ...t,
        currentVal,
        currentPct,
        idealVal,
        deficit
      };
    });

    const totalDeficit = classes.reduce((sum, c) => sum + c.deficit, 0);

    // Distribute the contribution proportionally to deficits
    const allocations = classes.map(c => {
      let allocatedAmount = 0;
      if (totalDeficit > 0 && contributionAmount > 0) {
        allocatedAmount = (c.deficit / totalDeficit) * contributionAmount;
      } else if (totalDeficit === 0 && contributionAmount > 0) {
        allocatedAmount = (c.targetPct / 100) * contributionAmount;
      }

      const projectedVal = c.currentVal + allocatedAmount;
      const projectedPct = totalNew > 0 ? (projectedVal / totalNew) * 100 : 0;

      return {
        ...c,
        allocatedAmount,
        projectedVal,
        projectedPct
      };
    });

    return {
      totalCurrent,
      totalNew,
      allocations
    };
  }, [portfolioBreakdown, targets, contributionAmount]);

  const targetSum = targets.reduce((sum, t) => sum + Number(t.targetPct || 0), 0);

  const handleTargetChange = (key: string, newPct: number) => {
    setTargets(prev => prev.map(t => t.key === key ? { ...t, targetPct: newPct } : t));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
              Smart Rebalancer Engine
            </span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-500/20">
              Rebalanceamento sem Venda
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Alocação Inteligente & Aportes Estratégicos
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Determine seus percentuais-alvo por classe. Ao informar um novo aporte, o algoritmo calcula exatamente onde aplicar o dinheiro para reequilibrar seu portfólio de forma matemática, evitando pagamento desnecessário de impostos.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsEditingTargets(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
              isEditingTargets 
                ? 'bg-teal-600 text-white border-teal-600' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
          >
            {isEditingTargets ? 'Salvar Metas' : 'Ajustar Metas (% Alvo)'}
          </button>
        </div>
      </div>

      {/* Target Setup Controls (When editing) */}
      {isEditingTargets && (
        <div className="bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 animate-fadeIn space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Configuração de Pesos Desejados
            </h3>
            <span className={`text-xs font-bold ${targetSum === 100 ? 'text-emerald-500' : 'text-rose-500'}`}>
              Soma: {targetSum}% {targetSum === 100 ? '✓ (Equilibrado)' : '≠ 100% (Ajuste para totalizar 100%)'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {targets.map(t => (
              <div key={t.key} className="bg-white dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.label}</span>
                  <span className="text-xs font-black text-teal-600 dark:text-teal-400">{t.targetPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={t.targetPct}
                  onChange={e => handleTargetChange(t.key, Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contribution Input Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Quanto você deseja aportar agora?
          </label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={contributionAmount}
                onChange={e => setContributionAmount(Number(e.target.value) || 0)}
                className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500 w-44"
              />
            </div>
            <button
              onClick={() => setContributionAmount(Math.max(0, totalBalance))}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all"
              title="Puxar saldo livre disponível em contas"
            >
              Usar Saldo em Caixa ({isPrivacyMode ? '••••' : formatCurrency(totalBalance)})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-3 sm:pt-0 sm:pl-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Patrimônio Atual</span>
            <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
              {isPrivacyMode ? '••••' : formatCurrency(rebalancePlan.totalCurrent)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Patrimônio Pós-Aporte</span>
            <span className="text-base font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {isPrivacyMode ? '••••' : formatCurrency(rebalancePlan.totalNew)}
            </span>
          </div>
        </div>
      </div>

      {/* Allocation Breakdown Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Recomendação de Compra por Classe
          </h3>
          <span className="text-xs text-slate-400">
            Aporte total distribuído: <strong>{isPrivacyMode ? '••••' : formatCurrency(contributionAmount)}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/75 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-3 px-6">Classe de Ativo</th>
                <th className="py-3 px-4 text-right">Posição Atual</th>
                <th className="py-3 px-4 text-center">Peso Atual</th>
                <th className="py-3 px-4 text-center">Meta (% Alvo)</th>
                <th className="py-3 px-4 text-right">Aporte Sugerido</th>
                <th className="py-3 px-4 text-center">Peso Projetado</th>
                <th className="py-3 px-6 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rebalancePlan.allocations.map(item => {
                const isUnderweight = item.currentPct < item.targetPct;
                return (
                  <tr key={item.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-slate-900 dark:text-white">{item.label}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {isPrivacyMode ? '••••' : formatCurrency(item.currentVal)}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums ${
                        isUnderweight ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {item.currentPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-black text-slate-900 dark:text-white tabular-nums">
                      {item.targetPct}%
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`font-black text-sm tabular-nums ${
                        item.allocatedAmount > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                      }`}>
                        {item.allocatedAmount > 0 ? `+ ${isPrivacyMode ? '••••' : formatCurrency(item.allocatedAmount)}` : 'R$ 0,00'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                        {item.projectedPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {item.allocatedAmount > 0 ? (
                        <button
                          onClick={() => {
                            const evType = item.key === 'fiis' ? AssetType.REAL_ESTATE_FUND : item.key === 'crypto' ? AssetType.CRYPTO : item.key === 'fixed_income' ? AssetType.FIXED_INCOME : AssetType.STOCK;
                            window.dispatchEvent(new CustomEvent('gestor_financeiro_add_investment', { detail: { type: evType } }));
                          }}
                          className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-xs"
                        >
                          Comprar
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">Equilibrado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
