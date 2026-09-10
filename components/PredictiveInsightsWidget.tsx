import React, { useState, useMemo, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, toIsoLocalDate } from '../utils/formatters';
import { isIncomeTx, isExpenseTx } from '../utils/transactionHelpers';

interface ObligationItem {
  id: string;
  due_date: string;
  amount: number | string;
  title?: string;
  description?: string;
  status: string;
}

export const PredictiveInsightsWidget: React.FC = () => {
  const { totalBalance, transactions, isPrivacyMode, viewMode } = useFinancialData();
  const [dismissed, setDismissed] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<'today' | 'week' | 'month'>('today');

  const [openPayables, setOpenPayables] = useState<ObligationItem[]>([]);
  const [openReceivables, setOpenReceivables] = useState<ObligationItem[]>([]);
  const [isLoadingObligations, setIsLoadingObligations] = useState(false);

  // Fetch open payables and receivables
  useEffect(() => {
    let active = true;
    const fetchObligations = async () => {
      try {
        setIsLoadingObligations(true);
        const token = window.localStorage.getItem('gestor_financeiro_app_token') || '';
        const headers = {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`,
          'x-view-mode': viewMode || 'personal'
        };

        const [rPay, rRec] = await Promise.all([
          fetch('/api/query', {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'payables_list', data: { status: 'open' } })
          }),
          fetch('/api/query', {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'receivables_list', data: { status: 'open' } })
          })
        ]);

        if (!active) return;

        if (rPay.ok) {
          const dPay = await rPay.json();
          setOpenPayables(dPay.rows || []);
        }
        if (rRec.ok) {
          const dRec = await rRec.json();
          setOpenReceivables(dRec.rows || []);
        }
      } catch (err) {
        console.warn('Erro ao carregar obrigações para insights preditivos:', err);
      } finally {
        if (active) setIsLoadingObligations(false);
      }
    };

    fetchObligations();
    return () => { active = false; };
  }, [viewMode, transactions.length]);

  // Compute metrics for Today, 7 Days, and Month
  const metrics = useMemo(() => {
    const todayStr = toIsoLocalDate(new Date().toISOString().slice(0, 10));
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysStr = toIsoLocalDate(sevenDaysLater.toISOString().slice(0, 10));

    // Payables breakdowns
    let payToday = 0;
    let payWeek = 0;
    let payMonth = 0;

    openPayables.forEach(p => {
      const val = Number(p.amount) || 0;
      const d = p.due_date ? p.due_date.slice(0, 10) : '';

      if (d === todayStr) payToday += val;
      if (d >= todayStr && d <= sevenDaysStr) payWeek += val;

      const pDate = new Date(d);
      if (pDate.getFullYear() === curYear && pDate.getMonth() === curMonth) {
        payMonth += val;
      }
    });

    // Receivables breakdowns
    let recToday = 0;
    let recWeek = 0;
    let recMonth = 0;

    openReceivables.forEach(r => {
      const val = Number(r.amount) || 0;
      const d = r.due_date ? r.due_date.slice(0, 10) : '';

      if (d === todayStr) recToday += val;
      if (d >= todayStr && d <= sevenDaysStr) recWeek += val;

      const rDate = new Date(d);
      if (rDate.getFullYear() === curYear && rDate.getMonth() === curMonth) {
        recMonth += val;
      }
    });

    // Projections
    const balanceAfterToday = totalBalance + recToday - payToday;
    const balanceAfterWeek = totalBalance + recWeek - payWeek;
    const isTodayDeficit = totalBalance < payToday;
    const isWeekDeficit = balanceAfterWeek < 0;

    // Month actual income & expense from executed transactions
    let monthIncomeExec = 0;
    let monthExpenseExec = 0;
    transactions.forEach(t => {
      const td = new Date(t.date);
      if (td.getFullYear() === curYear && td.getMonth() === curMonth) {
        if (isIncomeTx(t.transactionType)) monthIncomeExec += t.amount;
        if (isExpenseTx(t.transactionType)) monthExpenseExec += t.amount;
      }
    });

    const projectedMonthNet = (monthIncomeExec + recMonth) - (monthExpenseExec + payMonth);

    return {
      todayStr,
      payToday,
      recToday,
      balanceAfterToday,
      isTodayDeficit,
      payWeek,
      recWeek,
      balanceAfterWeek,
      isWeekDeficit,
      payMonth,
      recMonth,
      projectedMonthNet,
      totalBalance
    };
  }, [totalBalance, openPayables, openReceivables, transactions]);

  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-teal-500/25 p-4 sm:p-5 shadow-xl shadow-slate-950/40 animate-fadeIn">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

      {/* Top Header with professional icon and horizon selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-400">
                Diagnóstico de Tesouraria & Liquidez Preditiva
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                Tempo Real
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Análise cruzada de saldos em conta, contas a pagar e recebimentos programados
            </p>
          </div>
        </div>

        {/* Horizon selector buttons */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 self-start sm:self-center">
          <button
            onClick={() => setSelectedHorizon('today')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedHorizon === 'today'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setSelectedHorizon('week')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedHorizon === 'week'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Próximos 7 Dias
          </button>
          <button
            onClick={() => setSelectedHorizon('month')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              selectedHorizon === 'month'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Mês Vigente
          </button>
        </div>
      </div>

      {/* Main Dynamic Insight Content */}
      <div className="pt-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          {selectedHorizon === 'today' && (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${metrics.isTodayDeficit ? 'bg-rose-500 animate-pulse' : 'bg-teal-400'}`} />
                <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {metrics.payToday === 0 && metrics.recToday === 0
                    ? 'Nenhum compromisso financeiro vence no dia de hoje.'
                    : metrics.isTodayDeficit
                    ? `Atenção: Contas a pagar hoje (${isPrivacyMode ? '••••' : formatCurrency(metrics.payToday)}) superam o saldo livre em caixa.`
                    : `Liquidez Assegurada para Hoje: Saldo livre de ${isPrivacyMode ? '••••' : formatCurrency(metrics.totalBalance)} cobre todas as saídas previstas.`}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {metrics.isTodayDeficit
                  ? `Faltam ${isPrivacyMode ? '••••' : formatCurrency(metrics.payToday - metrics.totalBalance)} para liquidar as obrigações do dia sem utilizar cheque especial ou reservas.`
                  : `Total previsto para pagamento hoje: ${isPrivacyMode ? '••••' : formatCurrency(metrics.payToday)} | Previsão de entrada: ${isPrivacyMode ? '••••' : formatCurrency(metrics.recToday)}. Saldo projetado ao final do dia: ${isPrivacyMode ? '••••' : formatCurrency(metrics.balanceAfterToday)}.`}
              </p>
            </>
          )}

          {selectedHorizon === 'week' && (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${metrics.isWeekDeficit ? 'bg-amber-500 animate-pulse' : 'bg-teal-400'}`} />
                <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {metrics.isWeekDeficit
                    ? `Alerta para a Semana: Projeção de déficit de ${isPrivacyMode ? '••••' : formatCurrency(Math.abs(metrics.balanceAfterWeek))} nos próximos 7 dias.`
                    : `Caixa Semanal Estável: Projeção de saldo positivo de ${isPrivacyMode ? '••••' : formatCurrency(metrics.balanceAfterWeek)} ao final dos próximos 7 dias.`}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Compromissos a pagar nos próximos 7 dias: {isPrivacyMode ? '••••' : formatCurrency(metrics.payWeek)} | Recebimentos esperados: {isPrivacyMode ? '••••' : formatCurrency(metrics.recWeek)}.
              </p>
            </>
          )}

          {selectedHorizon === 'month' && (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${metrics.projectedMonthNet >= 0 ? 'bg-teal-400' : 'bg-rose-500'}`} />
                <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {metrics.projectedMonthNet >= 0
                    ? `Encerramento do Mês Projetado: Superávit de ${isPrivacyMode ? '••••' : formatCurrency(metrics.projectedMonthNet)}.`
                    : `Atenção: Projeção de resultado líquido negativo de ${isPrivacyMode ? '••••' : formatCurrency(Math.abs(metrics.projectedMonthNet))} no fechamento do mês.`}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Obrigações a pagar ainda em aberto no mês: {isPrivacyMode ? '••••' : formatCurrency(metrics.payMonth)} | Previsão de recebíveis a entrar: {isPrivacyMode ? '••••' : formatCurrency(metrics.recMonth)}.
              </p>
            </>
          )}
        </div>

        {/* Quick Summary Pills & CTAs */}
        <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('gestor_financeiro_navigate', { detail: { view: 'financeAccounting' } }))}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700/80 transition-all"
          >
            Ver Contas a Pagar
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_concierge_chat'))}
            className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md shadow-teal-950/40 transition-all active:scale-95 flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span>Consultar Concierge</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 text-slate-500 hover:text-slate-300 transition-colors"
            title="Ocultar painel"
            aria-label="Ocultar painel de diagnóstico"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
