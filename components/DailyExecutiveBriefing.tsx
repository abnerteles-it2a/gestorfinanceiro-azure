import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { SparklesIcon, AlertTriangleIcon, CheckCircleIcon, TrendingUpIcon } from './icons';

interface DailyBriefingProps {
  openPayablesAmount?: number;
  openReceivablesAmount?: number;
}

export const DailyExecutiveBriefing: React.FC<DailyBriefingProps> = ({
  openPayablesAmount = 0,
  openReceivablesAmount = 0,
}) => {
  const { totalBalance, accounts, investments, marketData } = useFinancialData();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Quick liquidity check
  const liquidityStatus = useMemo(() => {
    if (openPayablesAmount === 0) {
      return {
        level: 'good',
        title: 'Contas em Dia',
        message: 'Nenhuma conta a pagar vencendo no período imediato. Liquidez plena.',
        badge: '🟢 Seguro',
      };
    }

    if (totalBalance >= openPayablesAmount) {
      return {
        level: 'good',
        title: 'Compromissos Cobertos',
        message: `Saldo total de ${formatCurrency(totalBalance)} cobre integralmente os ${formatCurrency(openPayablesAmount)} previstos a pagar.`,
        badge: '🟢 Liquidez Garantida',
      };
    }

    return {
      level: 'warning',
      title: 'Atenção à Liquidez',
      message: `Contas a pagar (${formatCurrency(openPayablesAmount)}) superam o saldo disponível imediato (${formatCurrency(totalBalance)}). Remaneje ou antecipe recebíveis.`,
      badge: '🟠 Alerta de Caixa',
    };
  }, [totalBalance, openPayablesAmount]);

  // Valuation Opportunity Finder
  const topOpportunity = useMemo(() => {
    let bestAsset: { ticker: string; discountPct: number; ceiling: number } | null = null;

    investments.forEach(inv => {
      const ticker = inv.ticker?.toUpperCase().trim();
      const info = marketData[ticker];
      if (!info || !info.bazinPrice || !info.price || info.price <= 0) return;

      const margin = ((info.bazinPrice - info.price) / info.price) * 100;
      if (margin >= 10 && (!bestAsset || margin > bestAsset.discountPct)) {
        bestAsset = {
          ticker,
          discountPct: Number(margin.toFixed(1)),
          ceiling: info.bazinPrice,
        };
      }
    });

    return bestAsset;
  }, [investments, marketData]);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white p-5 rounded-3xl shadow-lg border border-teal-500/20 relative overflow-hidden backdrop-blur-md">
      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Left Briefing Column */}
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[9px] font-black uppercase tracking-widest border border-teal-500/30 flex items-center gap-1.5">
              <SparklesIcon className="w-3 h-3 text-teal-400" />
              Briefing Executivo Diário
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Liquidity item */}
            <div className="flex items-start gap-2.5">
              <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${liquidityStatus.level === 'good' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {liquidityStatus.level === 'good' ? <CheckCircleIcon className="w-4 h-4" /> : <AlertTriangleIcon className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">{liquidityStatus.title}</div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{liquidityStatus.message}</p>
              </div>
            </div>

            {/* Opportunity item */}
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 mt-0.5 shrink-0">
                <TrendingUpIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Radar de Valuation & Oportunidades</div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  {topOpportunity ? (
                    <>
                      Ativo <strong>{topOpportunity.ticker}</strong> opera com <strong>+{topOpportunity.discountPct}% de margem</strong> no Teto Bazin ({formatCurrency(topOpportunity.ceiling)}).
                    </>
                  ) : (
                    'Múltiplos dos ativos monitorados operam em linha com as médias históricas de mercado.'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right CTA Button */}
        <div className="shrink-0 flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_concierge_chat'))}
            className="px-5 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-[10px] uppercase tracking-wider shadow-lg shadow-teal-500/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>Auditoria com IA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
