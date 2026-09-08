import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';

export const MonthlyEvolutionChart: React.FC<{ onMonthSelect?: (month: string) => void }> = ({ onMonthSelect }) => {
    const { transactions } = useFinancialData();

    const data = useMemo(() => {
        const months: Record<string, { name: string, key: string, income: number, expense: number }> = {};
        const now = new Date();
        
        // Initialize last 6 months
        for(let i=5; i>=0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const monthName = d.toLocaleString('pt-BR', { month: 'short' });
            months[key] = { name: monthName.toUpperCase(), key, income: 0, expense: 0 };
        }

        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            
            if (months[key]) {
                if (t.transactionType === TransactionType.INCOME) {
                    months[key].income += t.amount;
                } else if (t.transactionType === TransactionType.EXPENSE) {
                    months[key].expense += t.amount;
                }
            }
        });

        return Object.values(months);
    }, [transactions]);

    const allZero = data.every(d => d.income === 0 && d.expense === 0);
    if (allZero) return null as any;
    return (
        <div className="bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-md min-w-0">
            <div className="space-y-1 mb-6">
                <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight uppercase">Evolução Mensal</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fluxo de Caixa (6 Meses)</p>
            </div>
            <div className="w-full h-[clamp(180px,13.75rem,220px)] md:h-[clamp(220px,18.75rem,300px)]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <BarChart 
                    data={data} 
                    margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    onClick={(data: any) => {
                        if (data && data.activePayload && data.activePayload[0] && onMonthSelect) {
                            onMonthSelect(data.activePayload[0].payload.key);
                        }
                    }}
                    style={{ cursor: onMonthSelect ? 'pointer' : 'default' }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} fontWeight="700" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={10} fontWeight="700" tickLine={false} axisLine={false} tickFormatter={(val) => formatCurrency(val, true)} />
                    <Tooltip 
                         contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '1rem', color: '#F8FAFC', padding: '12px' }}
                         itemStyle={{ fontWeight: '700', fontSize: '12px' }}
                         formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                    <Bar dataKey="income" name="Receitas" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={25} />
                    <Bar dataKey="expense" name="Despesas" fill="#E11D48" radius={[6, 6, 0, 0]} barSize={25} />
                </BarChart>
            </ResponsiveContainer>
            </div>
        </div>
    );
};
