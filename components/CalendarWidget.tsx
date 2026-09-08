import React, { useState, useEffect, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './shared/Modal';
import { TransactionItem } from './TransactionItem';
import { formatDate, formatCurrency, dateKey } from '../utils/formatters';
import { Transaction } from '../types';

export const CalendarWidget: React.FC<{ isSidebar?: boolean }> = ({ isSidebar }) => {
    const { transactions, categories, viewMode } = useFinancialData();
    const getAuthHeaders = React.useMemo((): Record<string,string> => {
        const headers: Record<string,string> = { 'content-type': 'application/json' };
        try { const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; if (t) headers['authorization'] = `Bearer ${t}`; } catch {}
        if (viewMode) headers['x-view-mode'] = viewMode;
        return headers;
    }, [viewMode]);
    const { showToast } = useToast();
    const today = new Date();
    const [viewDate, setViewDate] = useState(today);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [monthPayables, setMonthPayables] = useState<any[]>([]);
    const [monthReceivables, setMonthReceivables] = useState<any[]>([]);
    const [isLowRes, setIsLowRes] = useState(false);
    const [isExpandingFull, setIsExpandingFull] = useState(false);

    useEffect(() => {
        const handler = () => setIsLowRes(window.innerHeight < 850);
        handler();
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    const isCompact = isSidebar && isLowRes;
    const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const isoToday = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const startWeekday = start.getDay();
    const days = Array.from({ length: end.getDate() }, (_, i) => i + 1);
    const leading = Array.from({ length: startWeekday }, () => null);
    const items = [...leading, ...days];
    const isToday = (d: number | null) => d !== null && today.getFullYear() === viewDate.getFullYear() && today.getMonth() === viewDate.getMonth() && today.getDate() === d;
    const isoFor = (d: number) => `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const byDay = useMemo(() => {
        const map: Record<string, { list: Transaction[]; future: boolean; bills?: { type: 'ap'|'ar'; item: any }[] }> = {};
        transactions.forEach(t => {
            const key = dateKey(t.date);
            const parts = key.split('-').map(p => parseInt(p, 10));
            const y = parts[0];
            const m = parts[1] - 1;
            if (y === viewDate.getFullYear() && m === viewDate.getMonth()) {
                const dtLocal = new Date(`${key}T12:00:00`);
                if (!map[key]) map[key] = { list: [], future: dtLocal.getTime() > today.getTime(), bills: [] };
                map[key].list.push(t);
                if (dtLocal.getTime() > today.getTime()) map[key].future = true;
            }
        });
        monthPayables.forEach(p => {
            const d = (String(p.due_date).slice(0,10));
            const parts = d.split('-').map(n=>parseInt(n,10));
            if (parts[0] === viewDate.getFullYear() && (parts[1]-1) === viewDate.getMonth()) {
                if (!map[d]) map[d] = { list: [], future: new Date(`${d}T12:00:00`).getTime() > today.getTime(), bills: [] };
                (map[d].bills as any[]).push({ type: 'ap', item: p });
            }
        });
        monthReceivables.forEach(r => {
            const d = (String(r.due_date).slice(0,10));
            const parts = d.split('-').map(n=>parseInt(n,10));
            if (parts[0] === viewDate.getFullYear() && (parts[1]-1) === viewDate.getMonth()) {
                if (!map[d]) map[d] = { list: [], future: new Date(`${d}T12:00:00`).getTime() > today.getTime(), bills: [] };
                (map[d].bills as any[]).push({ type: 'ar', item: r });
            }
        });
        return map;
    }, [transactions, monthPayables, monthReceivables, viewDate]);
    useEffect(() => {
        try {
            const k = 'gestor_financeiro_future_alerts';
            const raw = window.localStorage.getItem(k);
            const seen: Record<string, number> = raw ? JSON.parse(raw) : {};
            const soonTx = transactions.filter(t => {
                const dt = new Date(t.date).getTime();
                const now = today.getTime();
                const diff = dt - now;
                return diff > 0 && diff <= 2 * 24 * 60 * 60 * 1000;
            }).filter(t => !seen[`tx_${t.id}`]);
            if (soonTx.length > 0) {
                const dstr = formatDate(dateKey(soonTx[0].date));
                showToast(`Lançamento agendado próximo: ${dstr} • ${soonTx[0].description}`, 'info');
                soonTx.forEach(t => { seen[`tx_${t.id}`] = Date.now(); });
            }
            const alertKey = (p: any, days: number) => `ap_${p.id}_${days}`;
            const nowMs = today.getTime();
            const alertIfDueIn = (list: any[], days: number, label: string) => {
                list.forEach(p => {
                    const dueMs = new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime();
                    const diffDays = Math.round((dueMs - nowMs) / (24*60*60*1000));
                    if (diffDays === days && !seen[alertKey(p, days)]) {
                        showToast(`${label}: ${String(p.title || '')} vence em ${days} dia(s)`, 'warning');
                        seen[alertKey(p, days)] = Date.now();
                    }
                });
            };
            alertIfDueIn(monthPayables.filter(p=>p.status==='open'), 3, 'Conta a pagar');
            alertIfDueIn(monthPayables.filter(p=>p.status==='open'), 1, 'Conta a pagar');
            window.localStorage.setItem(k, JSON.stringify(seen));
        } catch {}
    }, [transactions, monthPayables]);

    useEffect(() => {
        const monthKeyStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}`;
        (async () => {
            try {
                const r1 = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders, body: JSON.stringify({ type: 'payables_list', data: { status: 'open', month: monthKeyStr } }) });
                const j1 = await r1.json();
                setMonthPayables(j1.rows || []);
            } catch { setMonthPayables([]); }
            try {
                const r2 = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders, body: JSON.stringify({ type: 'receivables_list', data: { status: 'open', month: monthKeyStr } }) });
                const j2 = await r2.json();
                setMonthReceivables(j2.rows || []);
            } catch { setMonthReceivables([]); }
        })();
    }, [viewDate, transactions.length, viewMode]);
    const label = viewDate.toLocaleDateString('pt-BR', { 
        month: isSidebar ? 'short' : 'long', 
        year: 'numeric' 
    });
    const selectedList = selectedDate ? (byDay[selectedDate]?.list || []) : [];
    const selectedBills = selectedDate ? (byDay[selectedDate]?.bills || []) : [];
    return (
        <>
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg ${isSidebar ? 'calendar-sidebar-override' : 'p-4 lg:p-4 xl:p-6'}`}>
            <div className="flex items-center justify-between mb-3">
                {!isSidebar && <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Calendário</h3>}
                <div className={`flex items-center ${isSidebar ? 'w-full justify-between' : 'gap-2'}`}>
                    <button className="px-1.5 py-0.5 text-[10px] rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>◀</button>
                    <div className="flex items-center gap-1.5">
                        <span className={`${isSidebar ? 'text-[11px] font-bold uppercase tracking-wider' : 'text-sm'} text-gray-700 dark:text-gray-300`}>{label}</span>
                        {isCompact && (
                            <button 
                                onClick={() => setIsExpandingFull(true)}
                                className="p-0.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-[10px]"
                                title="Ver Mês Completo"
                            >
                                📅
                            </button>
                        )}
                    </div>
                    <button className="px-1.5 py-0.5 text-[10px] rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>▶</button>
                </div>
            </div>

            {(() => {
                const renderGrid = (onDayClick?: (iso: string) => void) => (
                    <div className="grid grid-cols-7 gap-2">
                        {['D','S','T','Q','Q','S','S'].map((w, i) => (
                            <div key={`${w}-${i}`} className="text-xs text-gray-500 dark:text-gray-400 text-center">{w}</div>
                        ))}
                        {items.map((d, idx) => {
                            const iso = d ? isoFor(d) : '';
                            const meta = d ? byDay[iso] : undefined;
                            const hasTx = !!meta && meta.list.length > 0;
                            const future = !!meta && meta.future;
                            const bills = (meta?.bills || []) as { type: 'ap'|'ar'; item: any }[];
                            const ap = bills.filter(b => b.type === 'ap').map(b=>b.item);
                            const ar = bills.filter(b => b.type === 'ar').map(b=>b.item);
                            const nowMs = today.getTime();
                            const hasOverdueAp = ap.some(p => p.status === 'open' && new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime() < nowMs);
                            const hasSoonAp = ap.some(p => {
                                const dueMs = new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime();
                                const diffDays = Math.round((dueMs - nowMs) / (24*60*60*1000));
                                return p.status === 'open' && (diffDays <= 3 && diffDays >= 0);
                            });
                            const base = d === null ? 'bg-transparent' : hasTx ? (future ? 'bg-indigo-100 dark:bg-indigo-700/40' : 'bg-green-100 dark:bg-green-700/40') : 'bg-gray-100 dark:bg-gray-700';
                            const ring = hasOverdueAp ? 'ring-2 ring-red-500' : (hasSoonAp ? 'ring-2 ring-yellow-500' : (ap.length>0 ? 'ring-2 ring-blue-500' : (ar.length>0 ? 'ring-2 ring-emerald-500' : '')));
                            return (
                                <button key={idx} disabled={d===null} onClick={() => { if(d) { onDayClick?.(iso); setSelectedDate(iso); } }} className={`relative h-10 flex items-center justify-center rounded ${base} ${ring} ${isToday(d) ? 'font-semibold' : ''}`}>
                                    <span className="text-sm text-gray-900 dark:text-white">{d ?? ''}</span>
                                    {(ap.length>0 || ar.length>0) && (
                                        <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                            {ap.length>0 && <span title="A Pagar" className={`inline-block w-2 h-2 rounded-full ${hasOverdueAp ? 'bg-red-500' : (hasSoonAp ? 'bg-yellow-500' : 'bg-blue-500')}`}></span>}
                                            {ar.length>0 && <span title="A Receber" className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                );

                if (isCompact) {
                    return (
                        <div className="space-y-2 px-1">
                            <button 
                                onClick={() => setSelectedDate(isoToday)}
                                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5 flex flex-col items-center gap-1.5 hover:bg-slate-800/80 transition-all group"
                            >
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-400">Hoje</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-2xl font-black text-white leading-none">{today.getDate()}</span>
                                    <span className="text-[10px] font-medium text-slate-400 capitalize">{today.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>
                                </div>
                                
                                {(() => {
                                     const meta = byDay[isoToday] || { list: [], future: false, bills: [] };
                                     const bills = (meta?.bills || []) as { type: 'ap'|'ar'; item: any }[];
                                     const ap = bills.filter(b => b.type === 'ap');
                                     const ar = bills.filter(b => b.type === 'ar');
                                     if (ap.length === 0 && ar.length === 0) return null;
                                     return (
                                         <div className="flex gap-3 mt-0.5 px-3 py-1 rounded-full bg-slate-900/50 border border-slate-700/30 font-bold">
                                             {ap.length > 0 && (
                                                 <div className="flex items-center gap-1">
                                                     <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                                                     <span className="text-[9px] text-slate-300">{ap.length}</span>
                                                 </div>
                                             )}
                                             {ar.length > 0 && (
                                                 <div className="flex items-center gap-1">
                                                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                     <span className="text-[9px] text-slate-300">{ar.length}</span>
                                                 </div>
                                             )}
                                         </div>
                                     );
                                })()}
                            </button>
                            <p className="text-center text-[8px] text-slate-500 italic">Toque para ver detalhes</p>
                        </div>
                    );
                }

                return renderGrid();
            })()}
            {!isCompact && (
                <div className="mt-3 flex flex-col gap-1 text-[9px] text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        <span className="opacity-80">A Pagar Vencida</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                        <span className="opacity-80">A Pagar Próxima</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="opacity-80">A Receber</span>
                    </div>
                </div>
            )}
        </div>
        <Modal isOpen={!!selectedDate} onClose={() => setSelectedDate(null)} title={selectedDate ? `Lançamentos em ${formatDate(selectedDate)}` : ''}>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {selectedList.length === 0 ? (
                        <div className="text-sm text-gray-600 dark:text-gray-300">Sem lançamentos neste dia.</div>
                    ) : (
                        selectedList.map(t => {
                            const cat = categories.find(c => c.name === t.category);
                            return <TransactionItem key={t.id} transaction={t} categoryIcon={cat?.icon} />
                        })
                    )}
                    {selectedBills.length > 0 && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Títulos</div>
                            {selectedBills.map(b => (
                                <div key={`${b.type}_${b.item.id}`} className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">{b.type==='ap' ? 'A Pagar' : 'A Receber'} • {b.item.title}</span>
                                    <span className="text-gray-900 dark:text-white">{formatCurrency(Number(b.item.amount||0))}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal 
                isOpen={isExpandingFull} 
                onClose={() => setIsExpandingFull(false)} 
                title={`Navegação Mensal - ${label}`}
            >
                <div className="p-1">
                    {(() => {
                        const GridWithHandler = () => {
                            const renderGrid = (onDayClick?: (iso: string) => void) => (
                                <div className="grid grid-cols-7 gap-2">
                                    {['D','S','T','Q','Q','S','S'].map((w, i) => (
                                        <div key={`${w}-${i}`} className="text-xs text-gray-500 dark:text-gray-400 text-center">{w}</div>
                                    ))}
                                    {items.map((d, idx) => {
                                        const iso = d ? isoFor(d) : '';
                                        const meta = d ? byDay[iso] : undefined;
                                        const hasTx = !!meta && meta.list.length > 0;
                                        const future = !!meta && meta.future;
                                        const bills = (meta?.bills || []) as { type: 'ap'|'ar'; item: any }[];
                                        const ap = bills.filter(b => b.type === 'ap').map(b=>b.item);
                                        const ar = bills.filter(b => b.type === 'ar').map(b=>b.item);
                                        const nowMs = today.getTime();
                                        const hasOverdueAp = ap.some(p => p.status === 'open' && new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime() < nowMs);
                                        const hasSoonAp = ap.some(p => {
                                            const dueMs = new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime();
                                            const diffDays = Math.round((dueMs - nowMs) / (24*60*60*1000));
                                            return p.status === 'open' && (diffDays <= 3 && diffDays >= 0);
                                        });
                                        const base = d === null ? 'bg-transparent' : hasTx ? (future ? 'bg-indigo-100 dark:bg-indigo-700/40' : 'bg-green-100 dark:bg-green-700/40') : 'bg-gray-100 dark:bg-gray-700';
                                        const ring = hasOverdueAp ? 'ring-2 ring-red-500' : (hasSoonAp ? 'ring-2 ring-yellow-500' : (ap.length>0 ? 'ring-2 ring-blue-500' : (ar.length>0 ? 'ring-2 ring-emerald-500' : '')));
                                        return (
                                            <button key={idx} disabled={d===null} onClick={() => { if(d) { setIsExpandingFull(false); setSelectedDate(iso); } }} className={`relative h-12 flex items-center justify-center rounded ${base} ${ring} ${isToday(d) ? 'font-semibold' : ''}`}>
                                                <span className="text-base text-gray-900 dark:text-white">{d ?? ''}</span>
                                                {(ap.length>0 || ar.length>0) && (
                                                    <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                                        {ap.length>0 && <span title="A Pagar" className={`inline-block w-2.5 h-2.5 rounded-full ${hasOverdueAp ? 'bg-red-500' : (hasSoonAp ? 'bg-yellow-500' : 'bg-blue-500')}`}></span>}
                                                        {ar.length>0 && <span title="A Receber" className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                            return renderGrid();
                        };
                        return <GridWithHandler />;
                    })()}
                </div>
            </Modal>
        </>
    );
};
