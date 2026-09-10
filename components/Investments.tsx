
import React, { useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage, formatDate } from '../utils/formatters';
import { ArrowDownIcon, ArrowUpIcon, TrendingUpIcon, EditIcon, TrashIcon, BankIcon, WalletIcon } from './icons';
import type { Investment, FixedIncomeInvestment, AnyInvestment } from '../types';
import { AssetType } from '../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { KpiCard } from './KpiCard';
import { InvTabBar, DividendsPanel, PerformancePanel, type InvTab } from './InvestmentTabs';
import { InvestmentSimulator } from './InvestmentSimulator';
import { SmartRebalancer } from './SmartRebalancer';
import { TaxReportWidget } from './TaxReportWidget';
import { UpgradeScreen } from './UpgradeScreen';
import { DividendCalendar } from './DividendCalendar';
import { PortfolioRiskMatrix } from './PortfolioRiskMatrix';

const SignalBadge: React.FC<{
    signal?: 'Comprar' | 'Vender' | 'Manter';
    valuation?: {
        recommendation?: 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR' | 'DESCONHECIDO';
        grahamValue?: number | null;
        bazinPrice?: number | null;
        safetyMarginPct?: number | null;
        reason?: string;
    };
}> = ({ signal, valuation }) => {
    const rec = valuation?.recommendation || (signal === 'Comprar' ? 'COMPRA' : signal === 'Vender' ? 'AGUARDAR' : signal === 'Manter' ? 'MANTER' : undefined);
    if (!rec) return null;

    const styles: Record<string, { label: string; bg: string; text: string; border: string }> = {
        'COMPRA_FORTE': { label: 'Compra Forte', bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300 font-black', border: 'border-emerald-500/30' },
        'COMPRA': { label: 'Comprar', bg: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-300 font-bold', border: 'border-teal-500/20' },
        'MANTER': { label: 'Manter', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300 font-bold', border: 'border-amber-500/20' },
        'AGUARDAR': { label: 'Aguardar', bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300 font-bold', border: 'border-rose-500/20' },
        'DESCONHECIDO': { label: 'Neutro', bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400 font-medium', border: 'border-slate-500/20' }
    };

    const cfg = styles[rec] || styles['DESCONHECIDO'];
    const title = valuation?.reason
        ? `${valuation.reason}${valuation.bazinPrice ? ` | Bazin: R$ ${valuation.bazinPrice.toFixed(2)}` : ''}${valuation.grahamValue ? ` | Graham: R$ ${valuation.grahamValue.toFixed(2)}` : ''}`
        : cfg.label;

    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wider rounded-md border ${cfg.bg} ${cfg.text} ${cfg.border} cursor-help transition-all hover:scale-105`}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {cfg.label}
        </span>
    );
};


const VariableAssetTable: React.FC<{ title: string; assets: Investment[]; onEdit: (asset: Investment) => void; onDelete: (id: string) => void; }> = ({ title, assets, onEdit, onDelete }) => {
    const { marketData } = useFinancialData();
    if (assets.length === 0) return null;

    return (
        <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden backdrop-blur-sm">
            <div className="bg-slate-50/50 dark:bg-slate-900/50 px-6 py-4 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                <h2 className="text-label-caps !text-slate-400">{title}</h2>
                <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">Renda Variável</span>
            </div>
            <div className="hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/50">
                            <tr>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Ativo</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Sinal</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cotação</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Dia %</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">P. Médio</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Qtd</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Posição</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">L/P Abs.</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Perf %</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">P/L</th>
                                <th className="px-3 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Gestão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {assets.map(inv => {
                                const currentPrice = marketData[inv.ticker]?.price ?? inv.purchasePrice;
                                const totalValue = currentPrice * inv.quantity;
                                const pl = totalValue - (inv.purchasePrice * inv.quantity);
                                const plPercentage = (pl / (inv.purchasePrice * inv.quantity));
                                const isPositive = pl >= 0;
                                const signal = marketData[inv.ticker]?.signal;

                                const changePercent = marketData[inv.ticker]?.changePercent ?? 0;
                                const pe = marketData[inv.ticker]?.priceEarnings;
                                const logoUrl = marketData[inv.ticker]?.logourl;
                                return (
                                    <tr key={inv.id} className="bg-emerald-50/15 hover:bg-emerald-100/25 dark:bg-emerald-950/5 dark:hover:bg-emerald-950/10 transition-colors">
                                        <td className="p-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                {logoUrl && <img src={logoUrl} alt={inv.ticker} className="w-5 h-5 rounded-md object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />}
                                                <div>
                                                    <div className="font-bold text-[11px] text-gray-900 dark:text-white uppercase">{inv.ticker}</div>
                                                    <div className="text-[10px] text-gray-500 dark:text-gray-500">{inv.type}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            <SignalBadge signal={signal} valuation={marketData[inv.ticker]?.valuation} />
                                        </td>
                                        <td className="p-3 text-[11px] font-medium text-gray-600 dark:text-gray-300 text-right whitespace-nowrap tabular-nums">{formatCurrency(currentPrice)}</td>
                                        <td className="p-3 text-right whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded font-black text-[10px] font-mono border ${
                                                changePercent >= 0 
                                                    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400' 
                                                    : 'bg-rose-500/10 text-rose-800 border-rose-200/40 dark:border-transparent dark:bg-rose-950/20 dark:text-rose-400'
                                            }`}>
                                                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                                            </span>
                                        </td>
                                        <td className="p-3 text-[11px] font-medium text-gray-600 dark:text-gray-300 text-right whitespace-nowrap tabular-nums">{formatCurrency(inv.purchasePrice)}</td>
                                        <td className="p-3 text-[11px] font-medium text-gray-600 dark:text-gray-300 text-right whitespace-nowrap tabular-nums">{inv.quantity.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 8 })}</td>
                                        <td className="p-3 font-black text-[11px] text-gray-900 dark:text-white text-right whitespace-nowrap tabular-nums">{formatCurrency(totalValue)}</td>
                                        <td className="p-3 text-right whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded font-black text-[11px] font-mono border ${
                                                isPositive 
                                                    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400' 
                                                    : 'bg-rose-500/10 text-rose-800 border-rose-200/40 dark:border-transparent dark:bg-rose-950/20 dark:text-rose-400'
                                            }`}>
                                                {formatCurrency(pl)}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded font-black text-[10px] font-mono border ${
                                                isPositive 
                                                    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-200/40 dark:border-transparent dark:bg-emerald-950/20 dark:text-emerald-400' 
                                                    : 'bg-rose-500/10 text-rose-800 border-rose-200/40 dark:border-transparent dark:bg-rose-950/20 dark:text-rose-400'
                                            }`}>
                                                {formatPercentage(plPercentage)}
                                            </span>
                                        </td>
                                        <td className="p-3 text-[10px] text-slate-400 text-right whitespace-nowrap tabular-nums">{pe ? pe.toFixed(1) + 'x' : '—'}</td>
                                        <td className="p-3 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end space-x-1.5">
                                                <button onClick={() => onEdit(inv)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-0.5 rounded-full"><EditIcon className="h-4 w-4"/></button>
                                                <button onClick={() => onDelete(inv.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full"><TrashIcon className="h-4 w-4"/></button>
                                                <button onClick={() => { const ev = new CustomEvent('gestor_financeiro_add_tx', { detail: { transactionType: 'Entrada', description: `Dividendos ${inv.ticker}`, category: 'Dividendos', inferredCategory: true, inferredCategoryReason: 'Operação de investimento', inferredPayment: true, inferredPaymentReason: 'Recebimento de proventos' } }); window.dispatchEvent(ev); }} className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold uppercase transition-colors">Prov.</button>
                                                <button onClick={() => { const ev = new CustomEvent('gestor_financeiro_add_investment', { detail: { type: inv.type, ticker: inv.ticker, op: 'sell', assetId: inv.id } }); window.dispatchEvent(ev); }} className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white text-[9px] font-bold uppercase transition-colors">Venda</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="md:hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {assets.map(inv => {
                        const currentPrice = marketData[inv.ticker]?.price ?? inv.purchasePrice;
                        const totalValue = currentPrice * inv.quantity;
                        const pl = totalValue - (inv.purchasePrice * inv.quantity);
                        const plPercentage = (pl / (inv.purchasePrice * inv.quantity));
                        const isPositive = pl >= 0;
                        const signal = marketData[inv.ticker]?.signal;
                        return (
                            <li key={inv.id} className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-gray-900 dark:text-white">{inv.ticker}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{inv.type}</div>
                                    </div>
                                    <SignalBadge signal={signal} valuation={marketData[inv.ticker]?.valuation} />
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">Preço Atual</span>
                                    <span className="text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(currentPrice)}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Preço Médio</span>
                                    <span className="text-right text-gray-700 dark:text-gray-300">{formatCurrency(inv.purchasePrice)}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Quantidade</span>
                                    <span className="text-right text-gray-700 dark:text-gray-300">{inv.quantity.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 8 })}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Valor</span>
                                    <span className="text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(totalValue)}</span>
                                    <span className="text-gray-500 dark:text-gray-400">L/P</span>
                                    <span className={`text-right font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(pl)}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Variação</span>
                                    <span className={`text-right ${isPositive ? 'text-green-500' : 'text-red-500'}`}>{formatPercentage(plPercentage)}</span>
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                    <button onClick={() => onEdit(inv)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-1 rounded-full"><EditIcon className="h-5 w-5"/></button>
                                    <button onClick={() => onDelete(inv.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-full"><TrashIcon className="h-5 w-5"/></button>
                                    <button onClick={() => { const ev = new CustomEvent('gestor_financeiro_add_tx', { detail: { transactionType: 'Entrada', description: `Dividendos ${inv.ticker}`, category: 'Dividendos', inferredCategory: true, inferredCategoryReason: 'Operação de investimento', inferredPayment: true, inferredPaymentReason: 'Recebimento de proventos' } }); window.dispatchEvent(ev); }} className="px-2 py-1 rounded bg-green-600 text-white text-xs">Dividendo</button>
                                    <button onClick={() => { const ev = new CustomEvent('gestor_financeiro_add_investment', { detail: { type: inv.type, ticker: inv.ticker, op: 'sell', assetId: inv.id } }); window.dispatchEvent(ev); }} className="px-2 py-1 rounded bg-teal-600 text-white text-xs">Registrar Venda</button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

const FixedIncomeTable: React.FC<{ assets: FixedIncomeInvestment[]; onEdit: (asset: FixedIncomeInvestment) => void; onDelete: (id: string) => void; }> = ({ assets, onEdit, onDelete }) => {
    if (assets.length === 0) return null;

    return (
         <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden backdrop-blur-sm">
            <div className="bg-slate-50/50 dark:bg-slate-900/50 px-6 py-4 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                <h2 className="text-label-caps !text-slate-400">Renda Fixa</h2>
                <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm">Pós/Pré Fixado</span>
            </div>
            <div className="hidden md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/50">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ativo</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emissor</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-410 uppercase tracking-widest">Indexador</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emissão</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Alocação</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {assets.map(inv => (
                                <tr key={inv.id} className="bg-blue-50/15 hover:bg-blue-100/25 dark:bg-blue-950/5 dark:hover:bg-blue-950/10 transition-colors">
                                    <td className="p-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{inv.name}</td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{inv.issuer}</td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{inv.yieldRate}</td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(inv.purchaseDate)}</td>
                                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(inv.maturityDate)}</td>
                                    <td className="p-4 font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">{formatCurrency(inv.amountInvested)}</td>
                                     <td className="p-4 whitespace-nowrap text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button onClick={() => onEdit(inv)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-1 rounded-full"><EditIcon className="h-5 w-5"/></button>
                                            <button onClick={() => onDelete(inv.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-full"><TrashIcon className="h-5 w-5"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="md:hidden">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {assets.map(inv => (
                        <li key={inv.id} className="p-4">
                            <div className="font-medium text-gray-900 dark:text-white">{inv.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{inv.issuer}</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Rentabilidade</span>
                                <span className="text-right text-gray-700 dark:text-gray-300">{inv.yieldRate}</span>
                                <span className="text-gray-500 dark:text-gray-400">Compra</span>
                                <span className="text-right text-gray-700 dark:text-gray-300">{formatDate(inv.purchaseDate)}</span>
                                <span className="text-gray-500 dark:text-gray-400">Vencimento</span>
                                <span className="text-right text-gray-700 dark:text-gray-300">{formatDate(inv.maturityDate)}</span>
                                <span className="text-gray-500 dark:text-gray-400">Investido</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(inv.amountInvested)}</span>
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                                <button onClick={() => onEdit(inv)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 p-1 rounded-full"><EditIcon className="h-5 w-5"/></button>
                                <button onClick={() => onDelete(inv.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-full"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const AllocationChart: React.FC<{ investments: Investment[], fixedIncome: FixedIncomeInvestment[], marketData: any }> = ({ investments, fixedIncome, marketData }) => {
    const data = useMemo(() => {
        const allocation: Record<string, number> = {};
        
        investments.forEach(inv => {
             const price = marketData[inv.ticker]?.price ?? inv.purchasePrice;
             const value = price * inv.quantity;
             const typeLabel = inv.type === AssetType.STOCK ? 'Ações BR' 
                : inv.type === AssetType.REAL_ESTATE_FUND ? 'FIIs'
                : inv.type === AssetType.INTERNATIONAL_STOCK ? 'Exterior'
                : inv.type === AssetType.REIT ? 'REITs'
                : inv.type === AssetType.CRYPTO ? 'Cripto'
                : 'Outros';
             
             allocation[typeLabel] = (allocation[typeLabel] || 0) + value;
        });

        fixedIncome.forEach(inv => {
            allocation['Renda Fixa'] = (allocation['Renda Fixa'] || 0) + inv.amountInvested;
        });

        return Object.entries(allocation)
            .map(([name, value]) => ({ name, value }))
            .filter(item => item.value > 0)
            .sort((a, b) => b.value - a.value);

    }, [investments, fixedIncome, marketData]);
    
    const COLORS = ['#0D9488', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
    const total = data.reduce((acc, cur) => acc + cur.value, 0);

    if (data.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700/50 pb-2">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Composição de Carteira</h2>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900">Geral</span>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="relative w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius="70%"
                                outerRadius="90%"
                                paddingAngle={4}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                             <RechartsTooltip 
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{ 
                                    backgroundColor: '#1e1b4b', 
                                    border: '1px solid rgba(255,255,255,0.1)', 
                                    borderRadius: '0.75rem', 
                                    fontSize: '11px', 
                                    fontWeight: '900', 
                                    color: '#fff',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                                }}
                                itemStyle={{ color: '#fff' }}
                                labelStyle={{ display: 'none' }}
                                cursor={{ fill: 'transparent' }}
                                wrapperStyle={{ pointerEvents: 'none', outline: 'none', zIndex: 100 }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none select-none z-0">
                         <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest block mb-0 leading-none">Minha Alocação</span>
                         <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums leading-none">100%</span>
                    </div>
                </div>
                
                <div className="flex-1 space-y-1.5">
                    {data.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between group">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight truncate">{entry.name}</span>
                            </div>
                            <span className="text-[9px] font-black text-slate-900 dark:text-slate-200 tabular-nums shrink-0">
                                {total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0'}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="mt-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-2 flex justify-between items-center">
                 <span className="text-[9px] font-black text-slate-400/70 uppercase tracking-widest">Patrimônio em Ativos</span>
                 <span className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(total)}</span>
            </div>
        </div>
    );
};

interface PortfolioHubProps {
    totalInvested: number;
    portfolioValue: number;
    portfolioPL: number;
    marketData: any;
    investments: any[];
    isMarketLoading: boolean;
    refreshMarketData: (force?: boolean) => void | Promise<void>;
    forceUpdate: boolean;
    setForceUpdate: (v: boolean) => void;
    onAddClick: () => void;
    onDetailsClick: () => void;
    usage?: any; // Added usage prop
}

const PortfolioHub: React.FC<PortfolioHubProps> = ({ 
    totalInvested, portfolioValue, portfolioPL, marketData, investments,
    isMarketLoading, refreshMarketData, forceUpdate, setForceUpdate, onAddClick, onDetailsClick,
    usage
}) => {
    const isPositive = portfolioPL >= 0;

    const movers = useMemo(() => {
        return investments
            .map(inv => {
                const cur = marketData[inv.ticker]?.price ?? inv.purchasePrice;
                const pl = (cur - inv.purchasePrice) / inv.purchasePrice;
                return { ticker: inv.ticker, pl };
            })
            .sort((a,b) => Math.abs(b.pl) - Math.abs(a.pl))
            .slice(0, 3);
    }, [investments, marketData]);

    return (
        <div className="space-y-8">
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/40 dark:bg-slate-900/40 p-3 px-6 rounded-2xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => refreshMarketData(forceUpdate)} 
                        disabled={isMarketLoading} 
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-slate-900 dark:bg-slate-800 text-indigo-400 rounded-xl border border-indigo-900/50 hover:bg-slate-800 transition-all disabled:opacity-50 shadow-sm"
                    >
                        {isMarketLoading ? 'Sincronizando...' : 'Atualizar Mercado'}
                    </button>
                    <label className="flex items-center gap-2 text-[9px] uppercase font-bold tracking-widest text-slate-400 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={forceUpdate}
                            onChange={e => setForceUpdate(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-0 transition-all"
                        />
                        <span className="group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">Direto na B3</span>
                    </label>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('open_concierge_chat'))}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-teal-500/10 text-teal-700 dark:text-teal-300 rounded-xl border border-teal-500/30 hover:bg-teal-500/20 transition-all flex items-center gap-1.5 shadow-xs"
                        title="Auditar diversificação e margem de segurança da carteira com o Concierge IA"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Auditar com IA</span>
                    </button>
                    <button onClick={onDetailsClick} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors">Log de Sincronia</button>
                    <button onClick={onAddClick} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-500/20 hover:bg-teal-500 transition-all active:scale-95">Novo Ativo</button>
                </div>
            </div>

            {/* Main Metric Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard 
                    title="Patrimônio em Ativos" 
                    value={formatCurrency(portfolioValue)} 
                    icon={<BankIcon className="h-6 w-6" />} 
                    variant="primary"
                    color="indigo"
                    subtext="Consolidado B3 + Cripto + Renda Fixa"
                />
                <KpiCard 
                    title="Total Investido" 
                    value={formatCurrency(totalInvested)} 
                    icon={<WalletIcon className="h-6 w-6" />} 
                    color="blue"
                    subtext="Preço Médio Acumulado"
                />
                <KpiCard 
                    title="Performance Geral" 
                    value={formatCurrency(portfolioPL)} 
                    icon={isPositive ? <ArrowUpIcon className="h-6 w-6" /> : <ArrowDownIcon className="h-6 w-6" />} 
                    color={isPositive ? 'green' : 'rose'}
                    subtext={`${formatPercentage(totalInvested > 0 ? portfolioPL / totalInvested : 0)} de variação total`}
                />
            </div>

            {/* Intelligence Layer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Market Indicators */}
                <div className="lg:col-span-8 bg-white/40 dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-label-caps !text-slate-400">Monitoramento de Mercado</h4>
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest animate-pulse">Live</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {(() => {
                            const ibov = marketData['^BVSP'] || marketData['IBOV'] || { price: 128450, change: 0 };
                            const btc = marketData['BTC'] || marketData['BTCBRL'] || { price: 384210, change: 0 };
                            const usd = marketData['USD'] || marketData['USDBRL'] || { price: 5.15, change: 0 };

                            const indicators = [
                                { label: 'IBOVESPA', value: ibov.price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), var: (ibov.change >= 0 ? '+' : '') + ((ibov.change / (ibov.price - ibov.change)) * 100).toFixed(2) + '%', pos: ibov.change >= 0 },
                                { label: 'BTC/BRL', value: btc.price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), var: (btc.change >= 0 ? '+' : '') + ((btc.change / (btc.price - btc.change)) * 100).toFixed(2) + '%', pos: btc.change >= 0 },
                                { label: 'USD/BRL', value: usd.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), var: (usd.change >= 0 ? '+' : '') + ((usd.change / (usd.price - usd.change)) * 100).toFixed(2) + '%', pos: usd.change >= 0 }
                            ];

                            return indicators.map((idx, i) => (
                                <div key={i} className="flex flex-col p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 group transition-all hover:bg-white dark:hover:bg-slate-800/40 shadow-sm hover:shadow-md">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{idx.label}</span>
                                    <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{idx.value}</span>
                                    <span className={`text-[10px] font-black mt-1 ${idx.pos ? 'text-emerald-500' : 'text-rose-500'}`}>{idx.var}</span>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                {/* Movers / Highlights */}
                <div className="lg:col-span-4 bg-white/40 dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
                    <h4 className="text-label-caps !text-slate-400 mb-4">Oscilações da Carteira</h4>
                    <div className="space-y-4">
                        {movers.length > 0 ? movers.map((m, i) => (
                            <div key={i} className="flex items-center justify-between group p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-all">
                                <span className="text-xs font-black text-slate-600 dark:text-slate-200 uppercase tracking-tight">{m.ticker}</span>
                                <div className={`text-[11px] font-black ${m.pl >= 0 ? 'text-emerald-500' : 'text-rose-500'} flex items-center gap-1.5 tabular-nums`}>
                                    {m.pl >= 0 ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
                                    {formatPercentage(m.pl)}
                                </div>
                            </div>
                        )) : (
                            <p className="text-[10px] text-slate-400 italic">Análise de rendimento em andamento...</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quota Monitor Banner */}
            <div className="bg-slate-100/50 dark:bg-slate-900/50 px-6 py-4 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600"><TrendingUpIcon className="w-4 h-4" /></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limite de Lançamentos de Ativos</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">Sincronia de Ordens Mensais</span>
                    </div>
                </div>
                <div className="flex-1 max-w-md w-full">
                    <div className="flex justify-between items-center mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>{usage?.transactionsUsed || 0} operados</span>
                        <span>{usage?.transactionsLimit || 1} limite</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-1000 ${((usage?.transactionsUsed || 0) / (usage?.transactionsLimit || 1)) > 0.9 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                            style={{ width: `${Math.min(100, ((usage?.transactionsUsed || 0) / (usage?.transactionsLimit || 1)) * 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

interface InvestmentsProps {
    onEditInvestment: (investment: AnyInvestment) => void;
}

const Investments: React.FC<InvestmentsProps> = ({ onEditInvestment }) => {
    const { 
        investments, 
        fixedIncomeInvestments, 
        totalInvested, 
        portfolioValue, 
        portfolioPL,
        deleteInvestment,
        deleteFixedIncomeInvestment,
        marketDataSources,
        marketData,
        marketDataTs,
        isMarketLoading = false,
        refreshMarketData = async () => undefined,
        usage,
        planInfo,
        subscriptionInfo
    } = useFinancialData();

    const tier = String(planInfo?.tier || 'starter').toLowerCase();
    const isTrialActive = !!(subscriptionInfo?.isTrial && !subscriptionInfo?.isExpired);

    if (tier === 'starter' && !isTrialActive) {
        return (
            <UpgradeScreen 
                title="Gestão de Investimentos"
                description="Acompanhe suas ações, fundos imobiliários, renda fixa e criptomoedas em tempo real. Tenha acesso a cotações integradas, rentabilidade histórica e gráficos analíticos de alocação de ativos."
                requiredTier="plus"
            />
        );
    }

    const transactionsLimit = usage?.transactionsLimit || (tier === 'pro' ? 3000 : tier === 'plus' ? 500 : 100);
    const transactionsUsed = usage?.transactionsUsed || 0;
    const [forceUpdate, setForceUpdate] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [activeTab, setActiveTab] = useState<InvTab>('carteira');
    
    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="text-label-caps !text-slate-400">Meus Investimentos</h1>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Acompanhamento e Rentabilidade de Carteira Global</p>
                </div>
                <InvTabBar active={activeTab} onChange={setActiveTab} />
            </div>

            {activeTab === 'proventos' && (
                <div className="space-y-8">
                    <DividendCalendar />
                    <DividendsPanel />
                </div>
            )}
            {activeTab === 'rentabilidade' && <PerformancePanel />}
            {activeTab === 'rebalanceamento' && (
                <div className="space-y-8">
                    <SmartRebalancer />
                    <PortfolioRiskMatrix />
                </div>
            )}
            {activeTab === 'fiscal' && <TaxReportWidget />}
            {activeTab === 'simulador' && <InvestmentSimulator />}
            {activeTab === 'carteira' && <>
            <PortfolioHub 
                totalInvested={totalInvested}
                portfolioValue={portfolioValue}
                portfolioPL={portfolioPL}
                marketData={marketData}
                investments={investments}
                isMarketLoading={isMarketLoading}
                refreshMarketData={refreshMarketData}
                forceUpdate={forceUpdate}
                setForceUpdate={setForceUpdate}
                onAddClick={() => { try { window.dispatchEvent(new CustomEvent('gestor_financeiro_add_investment', { detail: {} })); } catch {} }}
                onDetailsClick={() => setShowDetails(true)}
                usage={{ ...usage, transactionsLimit, transactionsUsed }}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-8">
                    <VariableAssetTable 
                        title="B3 (Ações e FIIs)" 
                        assets={investments.filter(i => i.type !== AssetType.CRYPTO)} 
                        onEdit={onEditInvestment} 
                        onDelete={deleteInvestment} 
                    />

                    <VariableAssetTable 
                        title="Criptomoedas" 
                        assets={investments.filter(i => i.type === AssetType.CRYPTO)} 
                        onEdit={onEditInvestment} 
                        onDelete={deleteInvestment} 
                    />

                    <FixedIncomeTable 
                        assets={fixedIncomeInvestments} 
                        onEdit={onEditInvestment} 
                        onDelete={deleteFixedIncomeInvestment} 
                    />
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8">
                    <AllocationChart 
                        investments={investments} 
                        fixedIncome={fixedIncomeInvestments} 
                        marketData={marketData} 
                    />
                    
                    <div className="bg-indigo-600 p-6 rounded-3xl shadow-xl shadow-indigo-500/20 border border-indigo-500 overflow-hidden relative group">
                         <div className="absolute -right-12 -top-12 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
                         <div className="relative z-10 text-white">
                             <div className="flex items-center gap-3 mb-4">
                                 <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md"><TrendingUpIcon className="w-4 h-4" /></div>
                                 <h4 className="text-label-caps !text-indigo-100">Inteligência Estratégica</h4>
                             </div>
                             <p className="text-xs font-bold leading-relaxed text-indigo-50 italic">
                                "{(() => {
                                    const assetsCount = investments.length + fixedIncomeInvestments.length;
                                    const base = portfolioPL >= 0 ? 'Performance positiva detectada.' : 'Fase de acumulação estratégica.';
                                    const dive = assetsCount > 5 ? 'Carteira com diversificação avançada.' : 'Foco em expansão de base.';
                                    return `${base} ${dive} Mantenha o fluxo de aportes para otimizar o custo médio.`;
                                })()}"
                             </p>
                         </div>
                    </div>
                </div>
            </div>
            </> /* end carteira tab */}

            {showDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 w-full max-w-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detalhes de Atualização</div>
                            <button onClick={() => setShowDetails(false)} className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">Fechar</button>
                        </div>
                        <div className="space-y-3">
                            <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between">
                                <span>Última atualização:</span>
                                <span className="font-semibold text-slate-900 dark:text-white">{marketDataTs ? new Date(marketDataTs).toLocaleString() : 'Sem atualização'}</span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 flex justify-between">
                                <span>Tickers monitorados:</span>
                                <span className="font-semibold text-slate-900 dark:text-white">{Object.keys(marketData || {}).length} ativos</span>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Fontes Ativas:</div>
                                <ul className="max-h-48 overflow-auto space-y-2 custom-scrollbar">
                                    {(marketDataSources || []).map((s, i) => (
                                        <li key={i} className="text-[11px] leading-relaxed">
                                            <div className="font-semibold text-slate-700 dark:text-slate-200">{s.title}</div>
                                            <div className="text-[10px] text-slate-400 font-mono break-all line-clamp-1">{s.uri}</div>
                                        </li>
                                    ))}
                                    {(!marketDataSources || marketDataSources.length === 0) && (
                                        <li className="text-[11px] text-slate-400 italic">Nenhuma fonte registrada.</li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Investments;
