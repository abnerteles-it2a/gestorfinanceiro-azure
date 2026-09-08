import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency, formatDate, dateKey } from '../utils/formatters';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';

export const FinancialProgressionChart: React.FC<{ onDateSelect?: (date: string) => void }> = ({ onDateSelect }) => {
    const { transactions, accounts } = useFinancialData();
    
    const chartData = useMemo(() => {
        const transactionDates = [...new Set(transactions.map(t => dateKey(t.date)))].sort();
        
        if (transactionDates.length === 0) return [];

        const initialTotalBalance = accounts.reduce((sum, acc) => sum + acc.initialBalance, 0);

        const dataPoints: { date: string, fullDate: string, balance: number }[] = [];
        
        const sortedTransactionsAsc = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        let currentBalance = initialTotalBalance;
        
        const dailyChanges: {[date: string]: number} = {};
        sortedTransactionsAsc.forEach(t => {
            const date = dateKey(t.date);
            if (!dailyChanges[date]) dailyChanges[date] = 0;
            
            if (t.transactionType === TransactionType.INCOME) dailyChanges[date] += t.amount;
            else if (t.transactionType === TransactionType.EXPENSE) dailyChanges[date] -= t.amount;
        });

        const allDates = Object.keys(dailyChanges).sort();
        
        allDates.forEach(date => {
            currentBalance += dailyChanges[date];
            dataPoints.push({
                date: formatDate(date).substring(0, 5),
                fullDate: date,
                balance: currentBalance
            });
        });

        if (dataPoints.length === 0 && initialTotalBalance > 0) {
             dataPoints.push({ date: 'Início', fullDate: '', balance: initialTotalBalance });
        }

        return dataPoints;

    }, [transactions, accounts]);

    if (chartData.length === 0) return null as any;
    return (
        <div className="bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-md h-full flex flex-col">
            <div className="space-y-1 mb-6">
                <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight uppercase">Progressão Patrimonial</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Evolução do Saldo Consolidado</p>
            </div>

            <div className="w-full h-[clamp(180px,13.75rem,220px)] md:h-[clamp(220px,18.75rem,300px)]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <AreaChart 
                    data={chartData} 
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    onClick={(data: any) => {
                        if (data && data.activePayload && data.activePayload[0] && onDateSelect) {
                            const point = data.activePayload[0].payload;
                            if (point.fullDate) onDateSelect(point.fullDate);
                        }
                    }}
                    style={{ cursor: onDateSelect ? 'pointer' : 'default' }}
                >
                    <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} fontWeight="700" tickLine={false} axisLine={false} />
                    <YAxis 
                        stroke="#94A3B8" 
                        fontSize={10} 
                        fontWeight="700" 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => formatCurrency(value, true)}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '1rem', color: '#F8FAFC', padding: '12px' }}
                        itemStyle={{ fontWeight: '700', fontSize: '12px' }}
                        formatter={(value: number) => [formatCurrency(value), 'Saldo Total']}
                        labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="#4F46E5" 
                        fillOpacity={1} 
                        fill="url(#colorBalance)" 
                        strokeWidth={4} 
                        dot={{ r: 4, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} 
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                    />
                </AreaChart>
            </ResponsiveContainer>
            </div>
        </div>
    );
};
