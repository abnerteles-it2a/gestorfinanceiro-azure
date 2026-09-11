import React from 'react';
import { AccountingHealthResult } from '../utils/accountingHealth';
import { SparklesIcon, AlertTriangleIcon, CheckCircleIcon, TrendingUpIcon, ShieldCheckIcon } from './icons';

interface AccountingHealthCardProps {
  health: AccountingHealthResult;
  onGenerateAiAudit?: () => void;
  isGeneratingAudit?: boolean;
}

export const AccountingHealthCard: React.FC<AccountingHealthCardProps> = ({
  health,
  onGenerateAiAudit,
  isGeneratingAudit = false,
}) => {
  const { score, tier, tierLabel, colorClass, badgeBg, breakdown, insights } = health;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-br from-slate-900 via-[#041226] to-[#020b18] p-5 sm:p-6 shadow-xl text-white">
      {/* Decorative ambient glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left: Score display & Pillars */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Radial / Score Badge */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800/80 border border-teal-500/30 shadow-inner">
              <svg className="w-18 h-18 sm:w-20 sm:h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-700/50"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-teal-400 transition-all duration-1000 ease-out"
                  strokeDasharray={`${score}, 100`}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white">{score}</span>
                <span className="text-[9px] uppercase tracking-wider text-teal-400 font-bold">/ 100</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400 flex items-center gap-1">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-teal-400" />
                  Health Score Contábil
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                  {tierLabel}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                Saúde & Eficiência Financeira
              </h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed mt-0.5">
                Avaliação autônoma contínua calculada sobre liquidez, margens, inadimplência e cobertura de caixa.
              </p>
            </div>
          </div>

          {/* Pillars mini grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:border-l sm:border-slate-800 sm:pl-6">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5 min-w-[120px]">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Liquidez</span>
                <span className="font-bold text-teal-300">{breakdown.liquidityScore}/25</span>
              </div>
              <div className="w-full h-1 bg-slate-700/60 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full" style={{ width: `${(breakdown.liquidityScore / 25) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5 min-w-[120px]">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Margem</span>
                <span className="font-bold text-teal-300">{breakdown.marginScore}/25</span>
              </div>
              <div className="w-full h-1 bg-slate-700/60 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full" style={{ width: `${(breakdown.marginScore / 25) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5 min-w-[120px]">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Adimplência</span>
                <span className="font-bold text-teal-300">{breakdown.delinquencyScore}/25</span>
              </div>
              <div className="w-full h-1 bg-slate-700/60 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full" style={{ width: `${(breakdown.delinquencyScore / 25) * 100}%` }} />
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5 min-w-[120px]">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Cobertura</span>
                <span className="font-bold text-teal-300">{breakdown.runwayScore}/25</span>
              </div>
              <div className="w-full h-1 bg-slate-700/60 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-teal-400 rounded-full" style={{ width: `${(breakdown.runwayScore / 25) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Trigger action button if provided */}
        {onGenerateAiAudit && (
          <div className="flex-shrink-0 flex items-center">
            <button
              onClick={onGenerateAiAudit}
              disabled={isGeneratingAudit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <SparklesIcon className="w-4 h-4" />
              {isGeneratingAudit ? 'Auditoria em andamento...' : 'Emitir Parecer IFRS com IA'}
            </button>
          </div>
        )}
      </div>

      {/* Autonomous Mini-Insights Bar */}
      {insights.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
          {insights.map((insight) => {
            const isDanger = insight.type === 'danger';
            const isWarning = insight.type === 'warning';
            const isSuccess = insight.type === 'success';

            const bgClass = isDanger
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
              : isWarning
              ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
              : isSuccess
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-teal-950/40 border-teal-500/30 text-teal-200';

            const dotClass = isDanger
              ? 'bg-rose-500'
              : isWarning
              ? 'bg-amber-500'
              : isSuccess
              ? 'bg-emerald-500'
              : 'bg-teal-400';

            return (
              <div
                key={insight.id}
                className={`flex items-start gap-2.5 p-3 rounded-xl border ${bgClass} text-xs transition-all`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotClass}`} />
                <div className="space-y-0.5">
                  <div className="font-bold text-white text-[11px] leading-snug">{insight.title}</div>
                  <p className="text-[11px] text-slate-300/90 leading-relaxed">{insight.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
