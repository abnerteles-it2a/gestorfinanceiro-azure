import React, { useEffect, useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

export const MonthlyBalance: React.FC<{ cardsOnly?: boolean }> = ({ cardsOnly }) => {
  const [data, setData] = useState<{ month: string; income: number; expense: number; net: number; openPayables: number; openReceivables: number; projectionNetAfterOpen: number } | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [loading, setLoading] = useState(false);
  const [openPayables, setOpenPayables] = useState<any[]>([]);
  const [openReceivablesList, setOpenReceivablesList] = useState<any[]>([]);
  const { transactions, accounts, fixedIncomeInvestments, investments, marketData, viewMode } = useFinancialData();

  const getAuthHeaders = useMemo((): Record<string,string> => {
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    try { const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; if (t) headers['authorization'] = `Bearer ${t}`; } catch {}
    if (viewMode) headers['x-view-mode'] = viewMode;
    return headers;
  }, [viewMode]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders, body: JSON.stringify({ type: 'balance_monthly', data: { month } }) });
      const j = await r.json();
      setData(j);
      try {
        const p = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders, body: JSON.stringify({ type: 'payables_list', data: { status: 'open', month } }) });
        const pj = await p.json();
        setOpenPayables(pj.rows || []);
      } catch {}
      try {
        const rr = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders, body: JSON.stringify({ type: 'receivables_list', data: { status: 'open', month } }) });
        const rj = await rr.json();
        setOpenReceivablesList(rj.rows || []);
      } catch {}
    } catch {}
    setLoading(false);
  };

  useEffect(()=>{ load(); }, [month, viewMode]);
  useEffect(()=>{ load(); }, [transactions.length, viewMode]);

  const currency = (v: number) => formatCurrency(Number(v || 0));
  const detail = useMemo(() => {
    const rows = transactions.filter(t => (t.date || '').slice(0,7) === month);
    const byDay: Record<string, { income: number; expense: number }> = {};
    for (const t of rows) {
      const d = (t.date || '').slice(0,10);
      if (!byDay[d]) byDay[d] = { income: 0, expense: 0 };
      if (t.transactionType === TransactionType.INCOME) byDay[d].income += Number(t.amount || 0);
      else if (t.transactionType === TransactionType.EXPENSE) byDay[d].expense += Number(t.amount || 0);
    }
    const days = Object.keys(byDay).sort();
    let acc = 0;
    const out = days.map(d => {
      const inc = Number(byDay[d].income.toFixed(2));
      const exp = Number(byDay[d].expense.toFixed(2));
      const net = Number((inc - exp).toFixed(2));
      acc = Number((acc + net).toFixed(2));
      return { date: d, income: inc, expense: exp, net, acc };
    });
    return out;
  }, [transactions, month]);

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col`}>
      {/* Toolbar Header: Contrast Background for Controls */}
      <div className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <h3 className="text-display-xs text-slate-800 dark:text-white font-bold tracking-tight">Balanço Mensal</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="monthly-balance-month" className="sr-only">Mês do balanço</label>
          <input
            id="monthly-balance-month"
            name="monthly-balance-month"
            type="month"
            value={month} 
            onChange={e=>setMonth(e.target.value)} 
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300" 
          />
          <button 
            onClick={load} 
            className="p-1.5 rounded-lg bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors"
            title="Atualizar"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-6">
        {loading && <div className="text-xs font-bold uppercase tracking-widest text-slate-400 animate-pulse mb-4">Carregando dados financeiros...</div>}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Receitas', val: data.income, color: 'text-emerald-600' },
              { label: 'Despesas', val: data.expense, color: 'text-rose-600' },
              { label: 'Saldo Líquido', val: data.net, color: 'text-indigo-600' },
              { label: 'Pendentes A Pagar', val: data.openPayables, color: 'text-rose-500' },
              { label: 'Pendentes A Receber', val: data.openReceivables, color: 'text-emerald-500' },
              { label: 'Projeção Final', val: data.projectionNetAfterOpen, color: 'text-indigo-600' },
            ].map((i) => (
              <div key={i.label} className="bg-slate-50/50 dark:bg-slate-900/10 p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-1">{i.label}</div>
                <div className={`text-lg font-bold tabular-nums ${i.color}`}>{currency(i.val)}</div>
              </div>
            ))}
          </div>
        )}
        {!cardsOnly && detail.length > 0 && (
          <div className="mt-8 overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="pb-3 px-1">Data</th>
                  <th className="pb-3">Receitas</th>
                  <th className="pb-3">Despesas</th>
                  <th className="pb-3">Saldo Dia</th>
                  <th className="pb-3">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {detail.map(r => (
                  <tr key={r.date} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="py-2.5 px-1 font-medium text-slate-600 dark:text-slate-400">{r.date}</td>
                    <td className="text-emerald-600 font-bold tabular-nums">{currency(r.income)}</td>
                    <td className="text-rose-600 font-bold tabular-nums">{currency(r.expense)}</td>
                    <td className={`font-bold tabular-nums ${r.net>=0? 'text-emerald-600' : 'text-rose-600'}`}>{currency(r.net)}</td>
                    <td className={`font-bold tabular-nums ${r.acc>=0? 'text-indigo-600' : 'text-rose-600'}`}>{currency(r.acc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
