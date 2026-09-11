import React, { useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { isIncomeTx, isExpenseTx } from '../utils/transactionHelpers';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { AlertTriangleIcon, SparklesIcon, TrendingUpIcon, WalletIcon } from './icons';

interface CashPoint {
  date: string;
  label: string;
  balance: number;
  inflows: number;
  outflows: number;
}

export const PredictiveCashFlow: React.FC = () => {
  const { totalBalance, transactions } = useFinancialData();

  const [daysHorizon, setDaysHorizon] = useState<30 | 60 | 90>(60);
  const [safetyReserve, setSafetyReserve] = useState<number>(5000);

  // Fetch open payables and receivables from local API or memory
  const [payables, setPayables] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  React.useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const token = window.localStorage.getItem('gestor_financeiro_app_token');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) headers['authorization'] = `Bearer ${token}`;

        const [r1, r2] = await Promise.all([
          fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'payables_list', data: { status: 'open' } }) }),
          fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'receivables_list', data: { status: 'open' } }) })
        ]);

        const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
        setPayables(j1.rows || []);
        setReceivables(j2.rows || []);
      } catch (e) {
        console.warn('Failed to load payables/receivables for forecast:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute monthly burn rate (average monthly expense over the last 90 days)
  const burnRateMonthly = useMemo(() => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyIso = ninetyDaysAgo.toISOString().slice(0, 10);

    const recentExpenses = transactions.filter(t => isExpenseTx(t.transactionType) && (t.date || '') >= ninetyIso);
    const totalExp = recentExpenses.reduce((s, t) => s + Number(t.amount || 0), 0);
    // Real mathematical average: if no expenses are recorded, burn rate is strictly 0 (never invent R$ 1.000)
    return totalExp > 0 ? (totalExp / 3) : 0;
  }, [transactions]);

  // Runway in months
  const runwayMonths = useMemo(() => {
    if (burnRateMonthly <= 0) return totalBalance > 0 ? '> 24' : '—';
    return Number((Math.max(totalBalance, 0) / burnRateMonthly).toFixed(1));
  }, [totalBalance, burnRateMonthly]);

  // Forecast daily balances
  const { forecastPoints, minBalance, minBalanceDate, totalProjectedInflow, totalProjectedOutflow } = useMemo(() => {
    const points: CashPoint[] = [];
    const today = new Date();
    let runningBalance = totalBalance;
    let minBal = totalBalance;
    let minDate = today.toISOString().slice(0, 10);
    let sumIn = 0;
    let sumOut = 0;

    // Daily recurring baseline expense from real historical burn rate
    const dailyBaseline = burnRateMonthly > 0 ? (burnRateMonthly / 30) : 0;

    for (let d = 0; d <= daysHorizon; d++) {
      const curDate = new Date(today);
      curDate.setDate(today.getDate() + d);
      const dateStr = curDate.toISOString().slice(0, 10);

      // Inflows scheduled for this day
      const dayRec = receivables.filter(r => String(r.due_date || '').slice(0, 10) === dateStr);
      const dayInflows = dayRec.reduce((s, r) => s + Number((r.amount || 0) - (r.received_amount || 0)), 0);

      // Outflows scheduled for this day
      const dayPay = payables.filter(p => String(p.due_date || '').slice(0, 10) === dateStr);
      const dayScheduledOut = dayPay.reduce((s, p) => s + Number((p.amount || 0) - (p.paid_amount || 0)), 0);

      const dayOutflows = dayScheduledOut + (d > 0 ? dailyBaseline : 0);

      runningBalance = runningBalance + dayInflows - (d > 0 ? dayOutflows : 0);
      sumIn += dayInflows;
      if (d > 0) sumOut += dayOutflows;

      if (runningBalance < minBal) {
        minBal = runningBalance;
        minDate = dateStr;
      }

      points.push({
        date: dateStr,
        label: `${String(curDate.getDate()).padStart(2, '0')}/${String(curDate.getMonth() + 1).padStart(2, '0')}`,
        balance: Math.round(runningBalance),
        inflows: Math.round(dayInflows),
        outflows: Math.round(dayOutflows),
      });
    }

    return {
      forecastPoints: points,
      minBalance: Math.round(minBal),
      minBalanceDate: minDate,
      totalProjectedInflow: Math.round(sumIn),
      totalProjectedOutflow: Math.round(sumOut),
    };
  }, [totalBalance, daysHorizon, receivables, payables, burnRateMonthly]);

  // Only trigger deficit alert if there are actual outflows that cause balance to drop below reserve
  const hasLiquidityDeficit = totalProjectedOutflow > 0 && (minBalance < 0 || minBalance < safetyReserve);

  const handleGenerateAiPlan = async () => {
    setIsGeneratingPlan(true);
    setAiPlan(null);
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers['authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/advice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'cashflow_contingency',
          cashflow: {
            daysHorizon,
            currentBalance: totalBalance,
            minBalance,
            minBalanceDate,
            burnRateMonthly,
            runwayMonths,
            totalProjectedInflow,
            totalProjectedOutflow,
          }
        })
      });
      const data = await res.json();
      if (data.text) {
        setAiPlan(data.text);
      } else {
        setAiPlan('Não foi possível formular o plano de contingência no momento.');
      }
    } catch (e: any) {
      setAiPlan('Erro ao contatar o assistente de tesouraria.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Radar Preditivo de Fluxo de Caixa (30 / 60 / 90 Dias)
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Projeção diária consolidada de Contas a Pagar, Receber, Cartão e Burn Rate operacional
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Action Button: AI Contingency Plan */}
          <button
            onClick={handleGenerateAiPlan}
            disabled={isGeneratingPlan}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-md shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            <span>{isGeneratingPlan ? 'Gerando Plano CFO...' : 'Plano de Caixa com IA'}</span>
          </button>

          {/* Horizon Switcher */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setDaysHorizon(30)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                daysHorizon === 30 ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              30 Dias
            </button>
            <button
              onClick={() => setDaysHorizon(60)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                daysHorizon === 60 ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              60 Dias
            </button>
            <button
              onClick={() => setDaysHorizon(90)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                daysHorizon === 90 ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              90 Dias
            </button>
          </div>
        </div>
      </div>

      {/* AI Contingency Plan Report Drawer */}
      {aiPlan && (
        <div className="p-5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-slate-800 dark:text-slate-100 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-xs uppercase tracking-wider">
              <SparklesIcon className="w-4 h-4" />
              <span>Plano Tático de Tesouraria & Proteção de Caixa</span>
            </div>
            <button
              onClick={() => setAiPlan(null)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold uppercase"
            >
              Fechar
            </button>
          </div>
          <div className="text-xs leading-relaxed whitespace-pre-line font-sans">
            {aiPlan}
          </div>
        </div>
      )}

      {/* Liquidity Alert if Cash Valley dips below reserve */}
      {hasLiquidityDeficit && (
        <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
            <AlertTriangleIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
              Alerta Preditivo de Vale de Caixa
            </h4>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 leading-relaxed">
              No dia <strong>{minBalanceDate}</strong>, seu saldo projetado atingirá o patamar mínimo de <strong>{formatCurrency(minBalance)}</strong>, ficando abaixo da sua margem de segurança configurada ({formatCurrency(safetyReserve)}).
            </p>
            <p className="text-[11px] text-rose-600 dark:text-rose-300 font-bold mt-1">
              Ação Recomendada: Antecipe o recebimento de clientes em aberto ou remaneje o vencimento dos fornecedores para a semana seguinte.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Saldo Atual em Caixa</span>
            <span>Disponível</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {formatCurrency(totalBalance)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Todas as contas conciliadas</p>
        </div>

        <div className="p-4 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
            <span>Runway Operacional</span>
            <span>Fôlego Financeiro</span>
          </div>
          <div className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1">
            {runwayMonths} Meses
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {burnRateMonthly > 0
              ? `Sem novas receitas com Burn Rate de ${formatCurrency(burnRateMonthly)}/mês`
              : 'Sem despesas ou saídas recorrentes registradas'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${minBalance < 0 ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}>
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Ponto Mínimo (Vale de Caixa)</span>
            <span>{totalProjectedOutflow > 0 ? `Em ${minBalanceDate}` : 'Estável'}</span>
          </div>
          <div className={`text-2xl font-black font-mono mt-1 ${minBalance < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
            {formatCurrency(minBalance)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {totalProjectedOutflow > 0 ? 'Menor saldo previsto no período' : 'Nenhuma saída ou obrigação prevista'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <span>Fluxo Líquido ({daysHorizon}d)</span>
            <span>Entradas - Saídas</span>
          </div>
          <div className={`text-2xl font-black font-mono mt-1 ${totalProjectedInflow - totalProjectedOutflow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(totalProjectedInflow - totalProjectedOutflow)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            +{formatCurrency(totalProjectedInflow)} / -{formatCurrency(totalProjectedOutflow)}
          </p>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
          Curva Projetada de Liquidez Diária ({daysHorizon} Dias)
        </h3>

        <div className="h-64 w-full bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-2 border border-slate-100 dark:border-slate-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastPoints} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false}
                tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
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
              <Area type="monotone" dataKey="balance" stroke="#0d9488" strokeWidth={2.5} fillOpacity={1} fill="url(#balanceGrad)" name="Saldo Projetado" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
