import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { isIncomeTx, isExpenseTx } from '../utils/transactionHelpers';

export const PredictiveInsightsWidget: React.FC = () => {
  const { totalBalance, transactions, isPrivacyMode } = useFinancialData();
  const [dismissed, setDismissed] = useState(false);

  // Analyze transaction trends
  const analysis = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const prevDate = new Date(curYear, curMonth - 1, 1);
    const prevMonth = prevDate.getMonth();
    const prevYear = prevDate.getFullYear();

    let curIncome = 0;
    let curExpense = 0;
    let prevExpense = 0;

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getMonth() === curMonth && d.getFullYear() === curYear) {
        if (isIncomeTx(t.transactionType)) curIncome += t.amount;
        if (isExpenseTx(t.transactionType)) curExpense += t.amount;
      } else if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) {
        if (isExpenseTx(t.transactionType)) prevExpense += t.amount;
      }
    });

    const expenseDeltaPct = prevExpense > 0 
      ? ((curExpense - prevExpense) / prevExpense) * 100 
      : 0;

    const netCash = curIncome - curExpense;
    const savingsRate = curIncome > 0 ? Math.max(0, (netCash / curIncome) * 100) : 0;

    return {
      curIncome,
      curExpense,
      prevExpense,
      expenseDeltaPct,
      netCash,
      savingsRate
    };
  }, [transactions]);

  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-slate-900 via-slate-900 to-teal-950/40 border border-teal-500/30 p-4 sm:p-5 shadow-lg shadow-teal-950/20 animate-fadeIn">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left header with IA badge */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center shrink-0 shadow-inner">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">
                Insights Preditivos da IA
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Ao Vivo
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight mt-0.5">
              {analysis.netCash >= 0 
                ? `Fluxo Operacional Positivo em ${isPrivacyMode ? '••••' : formatCurrency(analysis.netCash)} neste mês.` 
                : `Atenção ao Saldo: Despesas superam receitas em ${isPrivacyMode ? '••••' : formatCurrency(Math.abs(analysis.netCash))}.`}
            </h3>
            <p className="text-xs text-slate-300 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {analysis.expenseDeltaPct > 15
                ? `Suas despesas aumentaram ${analysis.expenseDeltaPct.toFixed(1)}% comparadas ao mês passado. Recomenda-se revisar custos variáveis.`
                : analysis.savingsRate >= 20
                ? `Excelente ritmo de poupança: você está retendo ${analysis.savingsRate.toFixed(0)}% das receitas. Considere alocar o excedente em investimentos com margem de segurança.`
                : `Saldo disponível em contas de ${isPrivacyMode ? '••••' : formatCurrency(totalBalance)}. Mantenha as previsões de pagamento atualizadas para evitar juros.`}
            </p>
          </div>
        </div>

        {/* Right CTA actions */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_concierge_chat'))}
            className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md shadow-teal-900/30 transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>Perguntar ao Concierge</span>
            <span>→</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
            title="Fechar insight"
            aria-label="Ocultar insight"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
