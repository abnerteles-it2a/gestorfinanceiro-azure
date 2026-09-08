import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { TrendingUpIcon } from './icons';
import { simulateInvestmentPurchase, getMarketData, MarketInfo } from '../services/marketDataService';
import { useToast } from '../context/ToastContext';

export const InvestmentSimulator: React.FC = () => {
    const { investments, totalInvested, portfolioValue, marketData } = useFinancialData();
    const { showToast } = useToast();

    const [ticker, setTicker] = useState('MXRF11');
    const [amount, setAmount] = useState<number>(1000);
    const [customPrice, setCustomPrice] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);
    const [activeQuote, setActiveQuote] = useState<MarketInfo | null>(null);
    const [simulationResult, setSimulationResult] = useState<string | null>(null);
    const [fetchingQuote, setFetchingQuote] = useState(false);

    // Common B3 suggestions
    const suggestions = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'MXRF11', 'HGLG11', 'XPML11', 'BTC'];

    // Fetch quote on ticker change
    useEffect(() => {
        if (!ticker.trim()) return;
        const normalized = ticker.trim().toUpperCase();
        
        if (marketData[normalized]) {
            setActiveQuote(marketData[normalized]);
            if (customPrice === '') {
                setCustomPrice(marketData[normalized].price);
            }
        }

        const timer = setTimeout(async () => {
            setFetchingQuote(true);
            try {
                const res = await getMarketData([normalized], true);
                if (res.data[normalized]) {
                    setActiveQuote(res.data[normalized]);
                    setCustomPrice(res.data[normalized].price);
                }
            } catch (e) {
                console.warn('Failed to fetch ticker quote:', e);
            } finally {
                setFetchingQuote(false);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [ticker]);

    const handleSimulate = async () => {
        if (!ticker.trim() || !amount || amount <= 0) {
            showToast('Informe um ativo válido e o valor a aportar.', 'warning');
            return;
        }

        setLoading(true);
        setSimulationResult(null);

        try {
            const price = Number(customPrice) || activeQuote?.price || 0;
            const res = await simulateInvestmentPurchase({
                ticker: ticker.trim().toUpperCase(),
                amount,
                price,
                bazinPrice: activeQuote?.bazinPrice,
                grahamPrice: activeQuote?.grahamPrice,
                dividendYield: activeQuote?.dividendYield
            }, {
                totalInvested: Number(totalInvested || portfolioValue || 0),
                assets: investments.map(i => ({
                    ticker: i.ticker,
                    quantity: i.quantity,
                    total: (marketData[i.ticker]?.price ?? i.purchasePrice) * i.quantity
                }))
            });

            setSimulationResult(res.text);
            showToast('Parecer estratégico gerado com sucesso!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Erro ao processar a simulação', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Calculate preliminary allocations
    const currentPrice = Number(customPrice) || activeQuote?.price || 0;
    const estQuantity = currentPrice > 0 ? Math.floor(amount / currentPrice) : 0;
    const newTotal = Number(totalInvested || 0) + amount;
    const currentAsset = investments.find(i => i.ticker.toUpperCase() === ticker.trim().toUpperCase());
    const currentAssetVal = currentAsset ? (marketData[currentAsset.ticker]?.price ?? currentAsset.purchasePrice) * currentAsset.quantity : 0;
    const newAssetVal = currentAssetVal + amount;
    const currentWeight = totalInvested > 0 ? (currentAssetVal / totalInvested) * 100 : 0;
    const newWeight = newTotal > 0 ? (newAssetVal / newTotal) * 100 : 100;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Strip - Gestor Financeiro Standard */}
            <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-teal-500" />
                            <h2 className="text-label-caps !text-slate-400">Simulador de Aportes</h2>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                            Planejamento e Diagnóstico de Carteira
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                            Simule o impacto de novos aportes antes de realizar a operação. O Gestor Financeiro avalia a margem de segurança fundamentalista (Preço Teto e Preço Justo) e monitora a exposição e risco de concentração da sua carteira.
                        </p>
                    </div>
                    <div className="hidden lg:flex items-center gap-6 pr-2">
                        <div className="text-right">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio Base</div>
                            <div className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                                {formatCurrency(Number(totalInvested || portfolioValue || 0))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Controls (5 cols) */}
                <div className="lg:col-span-5 bg-white/40 dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm shadow-sm space-y-5">
                    <div>
                        <h4 className="text-label-caps !text-slate-400 mb-3">Configuração do Aporte</h4>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Ativo Pretendido (Ticker)</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={ticker}
                                onChange={e => setTicker(e.target.value.toUpperCase())}
                                placeholder="Ex: MXRF11, PETR4, VALE3..."
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                            {fetchingQuote && (
                                <div className="absolute right-3 top-3 text-[10px] font-bold text-teal-600 dark:text-teal-400 animate-pulse">
                                    Atualizando...
                                </div>
                            )}
                        </div>

                        {/* Quick Suggestions */}
                        <div className="flex flex-wrap gap-1 mt-2.5">
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setTicker(s)}
                                    className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg border transition-all ${
                                        ticker === s
                                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Valor do Aporte (R$)</label>
                            <input 
                                type="number"
                                value={amount || ''}
                                onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
                                placeholder="1000"
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Cotação Atual (R$)</label>
                            <input 
                                type="number"
                                step="0.01"
                                value={customPrice}
                                onChange={e => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder={activeQuote?.price ? String(activeQuote.price) : '0.00'}
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                        </div>
                    </div>

                    {/* Active Market Data Snapshot */}
                    {activeQuote && (
                        <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase">{ticker}</span>
                                    <span className={`text-[10px] font-mono font-bold ${activeQuote.changePercent && activeQuote.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {activeQuote.changePercent && activeQuote.changePercent >= 0 ? '+' : ''}{activeQuote.changePercent?.toFixed(2)}%
                                    </span>
                                </div>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                    activeQuote.decision === 'COMPRA_FORTE' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' :
                                    activeQuote.decision === 'COMPRA' ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/20' :
                                    activeQuote.decision === 'AGUARDAR' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20' :
                                    'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                }`}>
                                    {activeQuote.decisionLabel || 'Neutro'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                                <div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Teto Bazin (DY 6%)</span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {activeQuote.bazinPrice ? formatCurrency(activeQuote.bazinPrice) : 'n/d'}
                                    </span>
                                    {activeQuote.bazinMargin !== undefined && (
                                        <span className={`text-[9px] ml-1 font-bold ${activeQuote.bazinMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            ({activeQuote.bazinMargin >= 0 ? `+${activeQuote.bazinMargin}%` : `${activeQuote.bazinMargin}%`})
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Graham Justo</span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {activeQuote.grahamPrice ? formatCurrency(activeQuote.grahamPrice) : 'n/d'}
                                    </span>
                                    {activeQuote.grahamMargin !== undefined && (
                                        <span className={`text-[9px] ml-1 font-bold ${activeQuote.grahamMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            ({activeQuote.grahamMargin >= 0 ? `+${activeQuote.grahamMargin}%` : `${activeQuote.grahamMargin}%`})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pre-computation of allocation */}
                    <div className="p-4 bg-teal-50/40 dark:bg-teal-950/20 rounded-2xl border border-teal-200/70 dark:border-teal-900/40 text-xs space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">Quantidade estimada:</span>
                            <span className="font-bold text-slate-900 dark:text-white">~{estQuantity} cotas/ações</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">Concentração no ativo:</span>
                            <span className="font-bold text-teal-600 dark:text-teal-400">
                                {currentWeight.toFixed(1)}% ➔ {newWeight.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleSimulate}
                        disabled={loading}
                        className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] active:scale-95 shadow-md shadow-teal-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Processando Análise...</span>
                            </>
                        ) : (
                            <>
                                <span>Simular Aporte</span>
                                <TrendingUpIcon className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>

                {/* Report Panel (7 cols) */}
                <div className="lg:col-span-7 bg-white/40 dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm shadow-sm min-h-[460px] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200/60 dark:border-slate-800">
                            <div>
                                <h3 className="text-label-caps !text-slate-400">Diagnóstico Estratégico</h3>
                                <h4 className="text-base font-bold text-gray-900 dark:text-white uppercase tracking-tight">Avaliação de Aporte — {ticker}</h4>
                            </div>
                            <span className="px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-teal-500/20">
                                Gestor Financeiro
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-10 h-10 border-3 border-teal-500/20 border-t-teal-600 rounded-full animate-spin" />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Analisando múltiplos fundamentalistas e carteira...</p>
                                    <p className="text-xs text-slate-400">Calculando preço justo, teto de dividendos e sensibilidade de risco.</p>
                                </div>
                            </div>
                        ) : simulationResult ? (
                            <div className="prose dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-700 dark:text-slate-200 space-y-4 whitespace-pre-line">
                                {simulationResult}
                            </div>
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
                                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center text-xl">
                                    📊
                                </div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma simulação ativa no momento.</p>
                                <p className="text-xs max-w-sm text-slate-400">
                                    Selecione o ativo pretendido e o valor do aporte ao lado para gerar o parecer executivo do Gestor Financeiro.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 mt-6 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <span>Gestor Financeiro · Análise Fundamentalista & Alocação Estratégica</span>
                        <span>* Métricas orientadas a dados e gestão de risco.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
