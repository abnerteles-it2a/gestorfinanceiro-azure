import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { TrendingUpIcon } from './icons';
import { EmptyState } from './ui/EmptyState';

export const InvestmentSummary: React.FC = () => {
    const { portfolioValue, portfolioPL, totalInvested, investments, marketData, isPrivacyMode } = useFinancialData();
    const plPercentage = totalInvested > 0 ? portfolioPL / totalInvested : 0;
    
    const bestPerformer = useMemo(() => {
        if (investments.length === 0) return null;
        return investments.reduce((best, current) => {
            const bestPl = (marketData[best.ticker]?.price ?? best.purchasePrice) * best.quantity - (best.purchasePrice * best.quantity);
            const currentPl = (marketData[current.ticker]?.price ?? current.purchasePrice) * current.quantity - (current.purchasePrice * current.quantity);
            return currentPl > bestPl ? current : best;
        });
    }, [investments, marketData]);

    return (
        <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 h-full flex flex-col backdrop-blur-sm">
            <h3 className="text-label-caps !text-slate-400 mb-6">
                Resumo de Investimentos
            </h3>
            <div className="space-y-5 flex-1">
                <div className="flex justify-between items-center text-[13px]">
                    <span className="text-slate-500 dark:text-slate-400 font-black uppercase tracking-tight">Valor da Carteira</span>
                    <span className="font-black text-slate-900 dark:text-white tabular-nums">{isPrivacyMode ? '••••' : formatCurrency(portfolioValue)}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                    <span className="text-slate-500 dark:text-slate-400 font-black uppercase tracking-tight">Lucro / Prejuízo</span>
                    <span className={`font-black tabular-nums ${portfolioPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPrivacyMode ? '••••' : `${formatCurrency(portfolioPL)} (${formatPercentage(plPercentage)})`}
                    </span>
                </div>
                {bestPerformer && (
                    <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50 mt-auto">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destaque de Ganho</span>
                        <div className="flex justify-between items-center mt-2 group">
                            <span className="font-black text-slate-900 dark:text-slate-200 uppercase tracking-tight group-hover:text-indigo-500 transition-colors">{bestPerformer.ticker}</span>
                            <span className="text-xs font-black text-emerald-500 tabular-nums">
                                {isPrivacyMode ? '••••' : `+${formatCurrency((marketData[bestPerformer.ticker]?.price ?? bestPerformer.purchasePrice) * bestPerformer.quantity - (bestPerformer.purchasePrice * bestPerformer.quantity))}`}
                            </span>
                        </div>
                    </div>
                )}
            </div>
            {!bestPerformer && (
                <div className="flex-1 flex items-center justify-center opacity-30 mt-4">
                    <div className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">Sem Ativos Ativos</div>
                </div>
            )}
        </div>
    );
};
