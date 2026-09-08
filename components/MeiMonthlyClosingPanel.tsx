import React, { useCallback, useEffect, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { KpiCard } from './KpiCard';
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, CheckCircleIcon } from './icons';

type SnapshotResponse = { closing: any; snapshot: any };

export const MeiMonthlyClosingPanel: React.FC = () => {
    const { viewMode } = useFinancialData();
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [data, setData] = useState<SnapshotResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [actionBusy, setActionBusy] = useState(false);

    const headers = useCallback(() => {
        const token = window.localStorage.getItem('gestor_financeiro_app_token');
        const result: Record<string, string> = { 'content-type': 'application/json' };
        if (token) result.authorization = `Bearer ${token}`;
        if (viewMode) result['x-view-mode'] = viewMode;
        return result;
    }, [viewMode]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/query', { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'mei_monthly_closing_get', data: { year, month } }) });
            if (!response.ok) throw new Error('Não foi possível carregar o fechamento da competência.');
            setData(await response.json());
        } catch (err: any) {
            setError(err?.message || 'Não foi possível carregar o fechamento.');
        } finally {
            setLoading(false);
        }
    }, [headers, year, month]);

    useEffect(() => { load(); }, [load]);

    const runAction = async (type: string) => {
        if (!data?.snapshot || actionBusy) return;
        const notes = type === 'mei_monthly_closing_reopen' ? window.prompt('Informe o motivo da reabertura:') : undefined;
        if (type === 'mei_monthly_closing_reopen' && !notes) return;
        if (!window.confirm(type === 'mei_monthly_closing_close' ? 'Fechar esta competência?' : type === 'mei_monthly_closing_review' ? 'Marcar esta competência como revisada?' : 'Reabrir esta competência?')) return;
        setActionBusy(true);
        try {
            const response = await fetch('/api/query', { method: 'POST', headers: headers(), body: JSON.stringify({ type, data: { year, month, snapshot: data.snapshot, notes } }) });
            if (!response.ok) throw new Error('A ação não pôde ser concluída.');
            await load();
        } catch (err: any) {
            setError(err?.message || 'A ação não pôde ser concluída.');
        } finally {
            setActionBusy(false);
        }
    };

    const exportCsv = () => {
        const entries = data?.snapshot?.entries || [];
        const rows = entries.map((entry: any) => [entry.date, entry.description, entry.category, entry.transactionType, entry.amount].map((value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = '﻿Data,Descrição,Categoria,Tipo,Valor\n' + rows.join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = `livro-caixa-mei-${year}-${String(month).padStart(2, '0')}.csv`; link.click(); URL.revokeObjectURL(url);
    };

    const snapshot = data?.snapshot;
    const status = data?.closing?.status || snapshot?.status || 'open';

    return (
        <section aria-labelledby="mei-closing-title" className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-live="polite">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 id="mei-closing-title" className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-white">Fechamento mensal e livro-caixa</h3>
                    <p className="mt-1 text-xs text-slate-500">Revisão da competência com base nos lançamentos empresariais e na obrigação DAS vinculada.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="mei-closing-month" className="sr-only">Mês da competência</label>
                    <select id="mei-closing-month" value={month} onChange={event => setMonth(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                        {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(year, index, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>)}
                    </select>
                    <label htmlFor="mei-closing-year" className="sr-only">Ano da competência</label>
                    <select id="mei-closing-year" value={year} onChange={event => setYear(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                        <option value={today.getFullYear()}>{today.getFullYear()}</option><option value={today.getFullYear() - 1}>{today.getFullYear() - 1}</option>
                    </select>
                </div>
            </div>
            {loading && <p className="text-sm text-slate-500">Carregando competência…</p>}
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {!loading && snapshot && (
                <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <KpiCard title="Receita empresarial" value={formatCurrency(snapshot.revenue)} icon={<ArrowUpIcon className="h-5 w-5" />} density="compact" color="green" />
                        <KpiCard title="Despesas empresariais" value={formatCurrency(snapshot.expenses)} icon={<ArrowDownIcon className="h-5 w-5" />} density="compact" color="rose" />
                        <KpiCard title="Resultado" value={formatCurrency(snapshot.result)} icon={snapshot.result >= 0 ? <CheckCircleIcon className="h-5 w-5" /> : <AlertTriangleIcon className="h-5 w-5" />} density="compact" color={snapshot.result >= 0 ? 'green' : 'rose'} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                        <div className="text-xs text-slate-600 dark:text-slate-300"><strong>Status:</strong> {status} · <strong>DAS:</strong> {snapshot.das ? `${snapshot.das.status} · ${snapshot.das.totalAmount > 0 ? formatCurrency(snapshot.das.totalAmount) : 'valor não informado'}` : 'não gerado'}</div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={exportCsv} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200">Exportar CSV</button>
                            {status === 'open' && <button disabled={actionBusy} onClick={() => runAction('mei_monthly_closing_review')} className="min-h-11 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Marcar revisado</button>}
                            {status === 'reviewed' && <button disabled={actionBusy} onClick={() => runAction('mei_monthly_closing_close')} className="min-h-11 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Fechar competência</button>}
                            {status === 'closed' && <button disabled={actionBusy} onClick={() => runAction('mei_monthly_closing_reopen')} className="min-h-11 rounded-lg border border-amber-500 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Reabrir</button>}
                        </div>
                    </div>
                    {snapshot.warnings?.length > 0 && <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">{snapshot.warnings.map((warning: string) => <p key={warning}>• {warning}</p>)}</div>}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 dark:bg-slate-800"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{snapshot.entries?.length ? snapshot.entries.map((entry: any) => <tr key={entry.id}><td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(String(entry.date).slice(0, 10))}</td><td className="px-4 py-3">{entry.description || 'Sem descrição'}</td><td className="px-4 py-3">{entry.category}</td><td className="px-4 py-3">{entry.transactionType}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(entry.amount)}</td></tr>) : <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum lançamento empresarial nesta competência.</td></tr>}</tbody></table>
                    </div>
                </>
            )}
        </section>
    );
};
