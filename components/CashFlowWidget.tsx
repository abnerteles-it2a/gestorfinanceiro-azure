import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFinancialData } from '../context/FinancialDataContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency } from '../utils/formatters';
import { TrendingUpIcon, TrendingDownIcon, AlertTriangleIcon } from './icons';
import { InsightsCarousel } from './InsightsCarousel';

export const CashFlowWidget: React.FC = () => {
    const { user } = useAuth();
    const { transactions, recurrences, categories, totalBalance, viewMode } = useFinancialData();
    const [futurePayables, setFuturePayables] = useState<any[]>([]);
    const [futureReceivables, setFutureReceivables] = useState<any[]>([]);

    useEffect(() => {
        const fetchFutures = async () => {
            try {
                const today = new Date();
                const endDate = new Date();
                endDate.setDate(today.getDate() + 90);
                
                const startStr = today.toISOString().split('T')[0];
                const endStr = endDate.toISOString().split('T')[0];

        const getHeaders = () => {
        const h: Record<string,string> = { 'content-type': 'application/json' };
        const t = window.localStorage.getItem('gestor_financeiro_app_token') || '';
        if (t) h['authorization'] = `Bearer ${t}`;
        if (viewMode) h['x-view-mode'] = viewMode;
        return h;
    };

                const [pRes, rRes] = await Promise.all([
                    fetch('/api/query', { 
                        method: 'POST', 
                        headers: getHeaders(),
                        body: JSON.stringify({ 
                            type: 'payables_list', 
                            data: { start_date: startStr, end_date: endStr, status: 'open' } 
                        })
                    }),
                    fetch('/api/query', { 
                        method: 'POST', 
                        headers: getHeaders(),
                        body: JSON.stringify({ 
                            type: 'receivables_list', 
                            data: { start_date: startStr, end_date: endStr, status: 'open' } 
                        })
                    })
                ]);

                if (pRes.ok) {
                    const pData = await pRes.json();
                    setFuturePayables(pData.rows || []);
                }
                if (rRes.ok) {
                    const rData = await rRes.json();
                    setFutureReceivables(rData.rows || []);
                }
            } catch (error) {
                console.error('Error fetching future cash flow', error);
            }
        };

        if (user) {
            fetchFutures();
        }
    }, [user, viewMode]);

    const projection = useMemo(() => {
        const daysToProject = 90; // 3 months
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dataPoints = [];
        let runningBalance = totalBalance;

        // Sort future transactions
        const futureTransactions = transactions
            .filter(t => new Date(t.date) > today)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (let i = 0; i <= daysToProject; i++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];

            // 1. Apply specific future transactions for this day
            const daysTransactions = futureTransactions.filter(t => t.date.startsWith(dateStr));
            daysTransactions.forEach(t => {
                const type = t.transactionType.toLowerCase();
                if (['entrada', 'income', 'receita'].includes(type)) runningBalance += t.amount;
                else if (['saída', 'expense', 'despesa'].includes(type)) runningBalance -= t.amount;
            });

            // 2. Apply recurrences
            recurrences.forEach(rec => {
                if (!rec.active) return;
                if (rec.dayOfMonth === currentDate.getDate()) {
                    const category = categories.find(c => c.name === rec.category);
                    const isIncome = category?.type === 'Entrada';
                    if (isIncome) runningBalance += rec.amount;
                    else runningBalance -= rec.amount;
                }
            });

            // 3. Apply Payables (Outflow)
            futurePayables.forEach(p => {
                if (p.due_date && String(p.due_date).startsWith(dateStr)) {
                    runningBalance -= Number(p.amount || 0);
                }
            });

            // 4. Apply Receivables (Inflow)
            futureReceivables.forEach(r => {
                if (r.due_date && String(r.due_date).startsWith(dateStr)) {
                    runningBalance += Number(r.amount || 0);
                }
            });

            dataPoints.push({
                date: currentDate,
                dateLabel: currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                balance: runningBalance,
                isProjected: true
            });
        }

        return dataPoints;
    }, [transactions, recurrences, categories, totalBalance, futurePayables, futureReceivables]);

    const minBalance = Math.min(...projection.map(p => p.balance));
    const maxBalance = Math.max(...projection.map(p => p.balance));
    const finalBalance = projection[projection.length - 1]?.balance || 0;
    const lowestPoint = projection.find(p => p.balance === minBalance);

    return (
        <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm p-5 lg:p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700/50 h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-display-xs text-slate-800 dark:text-white font-bold tracking-tight">
                        Fluxo de Caixa Projetado (90 dias)
                    </h3>
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                        Previsão baseada em saldo atual e recorrências.
                    </p>
                </div>
                <div className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest ${finalBalance >= totalBalance ? 'bg-emerald-50/50 text-emerald-600 border-emerald-200/50 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50/50 text-rose-600 border-rose-200/50 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                    {finalBalance >= totalBalance ? 'Tendência de Alta' : 'Tendência de Baixa'}
                </div>
            </div>

            <div className="mb-6">
                <InsightsCarousel variant="nested" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Saldo Hoje</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(totalBalance)}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Saldo em 90 dias</div>
                    <div className={`text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(finalBalance)}
                    </div>
                </div>
                <div className={`p-3 rounded-lg border ${minBalance < 0 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'}`}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {minBalance < 0 && <AlertTriangleIcon className="w-3 h-3 text-red-500" />}
                        Mínimo Previsto
                    </div>
                    <div className={`text-lg font-bold ${minBalance < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {formatCurrency(minBalance)}
                    </div>
                    {lowestPoint && (
                        <div className="text-[10px] text-gray-500">
                            em {lowestPoint.dateLabel}
                        </div>
                    )}
                </div>
            </div>

            <div className="h-[clamp(200px,18.75rem,300px)] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={projection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis 
                            dataKey="dateLabel" 
                            stroke="#9CA3AF" 
                            fontSize={12} 
                            tickMargin={10} 
                            minTickGap={30}
                        />
                        <YAxis 
                            stroke="#9CA3AF" 
                            fontSize={12} 
                            tickFormatter={(value) => formatCurrency(value, true)}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                            formatter={(value: number) => [formatCurrency(value), 'Saldo Projetado']}
                            labelFormatter={(label) => `Data: ${label}`}
                        />
                        <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" />
                        <Area 
                            type="monotone" 
                            dataKey="balance" 
                            stroke="#6366f1" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorBalance)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
