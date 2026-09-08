import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { TrendingUpIcon, ArrowUpIcon, ArrowDownIcon } from './icons';
import { simulateInvestmentPurchase, getMarketData, MarketInfo } from '../services/marketDataService';
import { useToast } from '../context/ToastContext';

export const InvestmentSimulator: React.FC = () => {
    const { investments, fixedIncomeInvestments, totalInvested, portfolioValue, marketData } = useFinancialData();
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
            showToast('Informe um ticker válido e o valor a aportar.', 'warning');
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
            showToast('Análise de aporte gerada pelo Azure AI Foundry!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Erro ao consultar o simulador de IA', 'error');
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
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Card */}
            <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-slate-950 p-8 rounded-4xl border border-teal-500/20 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 max-w-3xl space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/20 text-teal-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-teal-500/30">
                        <span>⚡ Inteligência Ativa Azure AI Foundry</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Simulador de Aportes: "Devo Comprar?"</h2>
                    <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                        Avalie o impacto de um novo aporte antes de fechar a boleta. O Azure AI Foundry analisa o 
                        <strong className="text-teal-300"> Preço Teto de Bazin (DY min 6%)</strong>, o <strong className="text-teal-300">Preço Justo de Graham</strong> e calcula o risco de concentração na sua carteira.
                    </p>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Form Controls (5 cols) */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ativo Pretendido (Ticker)</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={ticker}
                                onChange={e => setTicker(e.target.value.toUpperCase())}
                                placeholder="Ex: MXRF11, PETR4, VALE3..."
                                className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 text-base font-black text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                            {fetchingQuote && (
                                <div className="absolute right-4 top-3 text-[10px] font-bold text-teal-500 animate-pulse">
                                    Buscando cotação...
                                </div>
                            )}
                        </div>

                        {/* Quick Suggestions */}
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setTicker(s)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                        ticker === s 
                                            ? 'bg-teal-600 text-white shadow-sm' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Value & Price Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Valor do Aporte (R$)</label>
                            <input 
                                type="number"
                                value={amount}
                                onChange={e => setAmount(Number(e.target.value))}
                                min="10"
                                step="50"
                                className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 text-base font-black text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cotação Atual (R$)</label>
                            <input 
                                type="number"
                                value={customPrice}
                                onChange={e => setCustomPrice(e.target.value ? Number(e.target.value) : '')}
                                step="0.01"
                                className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 text-base font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 outline-none"
                            />
                        </div>
                    </div>

                    {/* Instant Metrics Card */}
                    {activeQuote && (
                        <div className="p-5 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Termômetro Fundamentalista</span>
                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                    activeQuote.decision === 'COMPRA_FORTE' ? 'bg-emerald-500 text-white' :
                                    activeQuote.decision === 'COMPRA' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                                    activeQuote.decision === 'AGUARDAR' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                                    'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                }`}>
                                    {activeQuote.decisionLabel || 'Neutro'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs">
                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Teto Bazin (DY 6%)</span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {activeQuote.bazinPrice ? formatCurrency(activeQuote.bazinPrice) : 'n/d'}
                                    </span>
                                    {activeQuote.bazinMargin !== undefined && (
                                        <span className={`text-[10px] ml-1.5 font-black ${activeQuote.bazinMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            ({activeQuote.bazinMargin >= 0 ? `+${activeQuote.bazinMargin}%` : `${activeQuote.bazinMargin}%`})
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Graham Justo</span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                        {activeQuote.grahamPrice ? formatCurrency(activeQuote.grahamPrice) : 'n/d'}
                                    </span>
                                    {activeQuote.grahamMargin !== undefined && (
                                        <span className={`text-[10px] ml-1.5 font-black ${activeQuote.grahamMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            ({activeQuote.grahamMargin >= 0 ? `+${activeQuote.grahamMargin}%` : `${activeQuote.grahamMargin}%`})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pre-computation of allocation */}
                    <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl border border-teal-200 dark:border-teal-900/40 text-xs space-y-2">
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
                        className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-teal-700 active:scale-95 shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Consultando Azure AI Foundry...</span>
                            </>
                        ) : (
                            <>
                                <span>Analisar Aporte com IA</span>
                                <TrendingUpIcon className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>

                {/* AI Executive Report (7 cols) */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-8 rounded-4xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[460px] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Parecer da Inteligência Artificial</h3>
                                <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Avaliação de Aporte - {ticker}</h4>
                            </div>
                            <span className="px-3 py-1 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-teal-200 dark:border-teal-800">
                                gpt-4.1
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-600 rounded-full animate-spin" />
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
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-3xl flex items-center justify-center text-2xl">
                                    💡
                                </div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma simulação ativa no momento.</p>
                                <p className="text-xs max-w-sm text-slate-400">
                                    Selecione o ativo pretendido e o valor do aporte ao lado para receber um parecer executivo gerado pelo Azure AI Foundry.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Gestor Financeiro AI Advisor • Model gpt-4.1</span>
                        <span>* Análise probabilística e fundamentalista orientada a dados.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
