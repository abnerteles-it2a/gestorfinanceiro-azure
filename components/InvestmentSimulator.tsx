import React, { useState, useEffect, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { TrendingUpIcon } from './icons';
import { simulateInvestmentPurchase, getMarketData, MarketInfo } from '../services/marketDataService';
import { useToast } from '../context/ToastContext';
import { B3_FUNDAMENTAL_BENCHMARKS } from '../api/portfolio/market-data';
import { MonteCarloSimulator } from './MonteCarloSimulator';
import { StressTestLab } from './StressTestLab';

export const InvestmentSimulator: React.FC = () => {
    const { investments, totalInvested, portfolioValue, marketData } = useFinancialData();
    const { showToast } = useToast();

    const [simulatorView, setSimulatorView] = useState<'valuation' | 'montecarlo' | 'stresstest'>('valuation');

    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            if (ce?.detail?.view && ['valuation', 'montecarlo', 'stresstest'].includes(ce.detail.view)) {
                setSimulatorView(ce.detail.view);
            }
            if (ce?.detail?.ticker) {
                setTicker(ce.detail.ticker.toUpperCase());
            }
        };
        window.addEventListener('gestor_financeiro_set_simulador_view', handler as EventListener);
        return () => window.removeEventListener('gestor_financeiro_set_simulador_view', handler as EventListener);
    }, []);
    const [ticker, setTicker] = useState('PETR4');
    const [amount, setAmount] = useState<number>(1000);
    const [customPrice, setCustomPrice] = useState<number | ''>('');
    const [customDividends, setCustomDividends] = useState<number | ''>('');
    const [customVpa, setCustomVpa] = useState<number | ''>('');
    const [customLpa, setCustomLpa] = useState<number | ''>('');
    const [bazinRate, setBazinRate] = useState<number>(6);
    const [showAdvancedParams, setShowAdvancedParams] = useState(false);

    const [loading, setLoading] = useState(false);
    const [activeQuote, setActiveQuote] = useState<MarketInfo | null>(null);
    const [simulationResult, setSimulationResult] = useState<string | null>(null);
    const [fetchingQuote, setFetchingQuote] = useState(false);

    // Common suggestions (B3 Stocks, FIIs, Crypto, US Stocks & REITs)
    const suggestions = ['PETR4', 'VALE3', 'BBAS3', 'ITUB4', 'WEGE3', 'TAEE11', 'MXRF11', 'HGLG11', 'XPML11', 'BTC', 'AAPL', 'O'];

    // Fetch quote on ticker change
    useEffect(() => {
        if (!ticker.trim()) return;
        const normalized = ticker.trim().toUpperCase();
        
        // Reset manual overrides when changing ticker
        setCustomDividends('');
        setCustomVpa('');
        setCustomLpa('');

        // Pre-fill default bazin rate depending on asset class
        const isFii = normalized.endsWith('11') || ['O', 'VNQ', 'AMT'].includes(normalized);
        setBazinRate(isFii ? 8.75 : 6);

        if (marketData[normalized]) {
            setActiveQuote(marketData[normalized]);
            setCustomPrice(marketData[normalized].price);
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
        }, 350);

        return () => clearTimeout(timer);
    }, [ticker]);

    // Benchmark fallback for current ticker
    const benchmark = useMemo(() => {
        const norm = ticker.trim().toUpperCase();
        return B3_FUNDAMENTAL_BENCHMARKS[norm] || null;
    }, [ticker]);

    // Effective values (User Custom Input > Live API Quote > Benchmark Database)
    const effectivePrice = useMemo(() => {
        if (customPrice !== '' && Number(customPrice) > 0) return Number(customPrice);
        if (activeQuote?.price && activeQuote.price > 0) return activeQuote.price;
        return 0;
    }, [customPrice, activeQuote]);

    const effectiveDividends = useMemo(() => {
        if (customDividends !== '' && Number(customDividends) >= 0) return Number(customDividends);
        if (activeQuote?.dividends12m && activeQuote.dividends12m > 0) return activeQuote.dividends12m;
        if (benchmark?.dividends12m) return benchmark.dividends12m;
        if (activeQuote?.dividendYield && effectivePrice > 0) {
            return Math.round((activeQuote.dividendYield * effectivePrice / 100) * 100) / 100;
        }
        return 0;
    }, [customDividends, activeQuote, benchmark, effectivePrice]);

    const effectiveVpa = useMemo(() => {
        if (customVpa !== '' && Number(customVpa) > 0) return Number(customVpa);
        if (activeQuote?.vpa && activeQuote.vpa > 0) return activeQuote.vpa;
        if (benchmark?.vpa) return benchmark.vpa;
        return 0;
    }, [customVpa, activeQuote, benchmark]);

    const effectiveLpa = useMemo(() => {
        if (customLpa !== '' && Number(customLpa) > 0) return Number(customLpa);
        if (activeQuote?.lpa && activeQuote.lpa > 0) return activeQuote.lpa;
        if (benchmark?.lpa) return benchmark.lpa;
        return 0;
    }, [customLpa, activeQuote, benchmark]);

    const isCrypto = useMemo(() => {
        const t = ticker.trim().toUpperCase();
        return ['BTC', 'ETH', 'SOL', 'BTCBRL', 'ETHBRL', 'SOLBRL', 'XRP', 'ADA', 'BNB'].includes(t);
    }, [ticker]);

    const isFii = useMemo(() => {
        const t = ticker.trim().toUpperCase();
        return (t.endsWith('11') && !['BOVA11', 'SMAL11', 'IVVB11', 'HASH11'].includes(t)) || ['O', 'VNQ', 'AMT'].includes(t);
    }, [ticker]);

    // ─── LIVE DYNAMIC VALUATION CALCULATIONS (NEVER STATIC) ───────────────────────────
    
    // 1. P/VP Dinâmico = Preço / VPA
    const livePvp = useMemo(() => {
        if (effectivePrice > 0 && effectiveVpa > 0) {
            return Math.round((effectivePrice / effectiveVpa) * 100) / 100;
        }
        return activeQuote?.pvp ?? null;
    }, [effectivePrice, effectiveVpa, activeQuote]);

    // 2. Preço Teto Bazin = Proventos12M / (Taxa / 100)
    const liveBazinPrice = useMemo(() => {
        if (effectiveDividends > 0 && bazinRate > 0) {
            return Math.round((effectiveDividends / (bazinRate / 100)) * 100) / 100;
        }
        return activeQuote?.bazinPrice ?? null;
    }, [effectiveDividends, bazinRate, activeQuote]);

    const liveBazinMargin = useMemo(() => {
        if (liveBazinPrice !== null && effectivePrice > 0) {
            return Math.round(((liveBazinPrice - effectivePrice) / effectivePrice) * 1000) / 10;
        }
        return null;
    }, [liveBazinPrice, effectivePrice]);

    // 3. Preço Justo de Graham
    // Para Ações: V = sqrt(22.5 * LPA * VPA)
    // Para FIIs: V = VPA (Valor Justo Contábil)
    const liveGrahamPrice = useMemo(() => {
        if (isFii) {
            return effectiveVpa > 0 ? effectiveVpa : (activeQuote?.grahamPrice ?? null);
        }
        if (effectiveLpa > 0 && effectiveVpa > 0) {
            const raw = Math.sqrt(22.5 * effectiveLpa * effectiveVpa);
            return (!isNaN(raw) && isFinite(raw)) ? Math.round(raw * 100) / 100 : null;
        }
        return activeQuote?.grahamPrice ?? null;
    }, [isFii, effectiveLpa, effectiveVpa, activeQuote]);

    const liveGrahamMargin = useMemo(() => {
        if (liveGrahamPrice !== null && effectivePrice > 0) {
            return Math.round(((liveGrahamPrice - effectivePrice) / effectivePrice) * 1000) / 10;
        }
        return null;
    }, [liveGrahamPrice, effectivePrice]);

    // 4. Preço Teto FII (Spread NTN-B 8.75% a.a.)
    const liveFiiCeiling = useMemo(() => {
        if (effectiveDividends > 0) {
            return Math.round((effectiveDividends / 0.0875) * 100) / 100;
        }
        return activeQuote?.fiiCeilingPrice ?? null;
    }, [effectiveDividends, activeQuote]);

    const liveFiiMargin = useMemo(() => {
        if (liveFiiCeiling !== null && effectivePrice > 0) {
            return Math.round(((liveFiiCeiling - effectivePrice) / effectivePrice) * 1000) / 10;
        }
        return null;
    }, [liveFiiCeiling, effectivePrice]);

    // 5. Dividend Yield Dinâmico
    const liveDy = useMemo(() => {
        if (effectiveDividends > 0 && effectivePrice > 0) {
            return (effectiveDividends / effectivePrice) * 100;
        }
        return activeQuote?.dividendYield ? activeQuote.dividendYield * 100 : 0;
    }, [effectiveDividends, effectivePrice, activeQuote]);

    // 6. Projeção de Renda Passiva
    const estAnnualIncome = useMemo(() => {
        if (amount > 0 && liveDy > 0) {
            return (amount * liveDy) / 100;
        }
        return 0;
    }, [amount, liveDy]);
    const estMonthlyIncome = estAnnualIncome / 12;

    // 7. Estimativa de Cotas/Ações
    const estQuantity = effectivePrice > 0 ? Math.floor(amount / effectivePrice) : 0;

    // 8. Concentração na Carteira
    const newTotal = Number(totalInvested || portfolioValue || 0) + amount;
    const currentAsset = investments.find(i => i.ticker.toUpperCase() === ticker.trim().toUpperCase());
    const currentAssetVal = currentAsset ? (marketData[currentAsset.ticker]?.price ?? currentAsset.purchasePrice) * currentAsset.quantity : 0;
    const newAssetVal = currentAssetVal + amount;
    const currentWeight = (totalInvested || portfolioValue) > 0 ? (currentAssetVal / (totalInvested || portfolioValue || 1)) * 100 : 0;
    const newWeight = newTotal > 0 ? (newAssetVal / newTotal) * 100 : 100;

    // Executive automated diagnostic verdict
    const automatedVerdict = useMemo(() => {
        if (isCrypto) {
            return {
                title: 'Ativo de Alta Volatilidade (Cripto)',
                badge: 'DCA / Fracionado',
                badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
                desc: 'Criptoativos não possuem balanço ou dividendos. Gestão de risco: limite entre 2% a 5% da carteira.'
            };
        }
        if (isFii) {
            if (livePvp !== null && livePvp < 0.98 && (liveFiiMargin ?? 0) >= 0) {
                return {
                    title: 'Compra Forte (Desconto Patrimonial & Yield)',
                    badge: 'Oportunidade de Compra',
                    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
                    desc: `Cota negociada com ${((1 - livePvp) * 100).toFixed(1)}% de desconto sobre o valor patrimonial (P/VP ${livePvp.toFixed(2)}) e abaixo do teto FII.`
                };
            }
            if (livePvp !== null && livePvp > 1.05) {
                return {
                    title: 'Aguardar Correção (Ágio Excessivo)',
                    badge: 'Aguardar',
                    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20',
                    desc: `Cotação com ágio de ${((livePvp - 1) * 100).toFixed(1)}% acima do laudo patrimonial (P/VP ${livePvp.toFixed(2)}). Risco de diluição em novas emissões.`
                };
            }
            return {
                title: 'Preço Justo / Faixa de Equilíbrio',
                badge: 'Preço Justo',
                badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/20',
                desc: `FII operando próximo à paridade (P/VP ${livePvp ? livePvp.toFixed(2) : 'n/d'}). Yield projetado de ${liveDy.toFixed(2)}% a.a.`
            };
        }
        // Stocks
        const gOk = liveGrahamMargin !== null && liveGrahamMargin >= 10;
        const bOk = liveBazinMargin !== null && liveBazinMargin >= 10;
        if (gOk && bOk) {
            return {
                title: 'Compra Forte (Desconto Graham & Bazin)',
                badge: 'Duplo Desconto',
                badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
                desc: `Ativo abaixo do Teto Bazin (${liveBazinMargin > 0 ? `+${liveBazinMargin}%` : `${liveBazinMargin}%`}) e abaixo do Justo Graham (${liveGrahamMargin > 0 ? `+${liveGrahamMargin}%` : `${liveGrahamMargin}%`}).`
            };
        }
        if (gOk || bOk) {
            return {
                title: 'Margem de Segurança Atrativa',
                badge: 'Compra Recomendada',
                badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/20',
                desc: gOk ? `Desconto relevante de Graham (+${liveGrahamMargin}% de margem).` : `Preço abaixo do Teto Bazin (+${liveBazinMargin}% de margem).`
            };
        }
        if ((liveGrahamMargin ?? 0) < -15 && (liveBazinMargin ?? 0) < -15) {
            return {
                title: 'Aguardar Ponto de Entrada',
                badge: 'Acima do Teto',
                badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20',
                desc: 'Cotação atual opera acima do Preço Teto Bazin e do Justo Graham. Risco de assimetria desfavorável.'
            };
        }
        return {
            title: 'Preço Equilibrado / Acúmulo Regular',
            badge: 'Neutro / Manter',
            badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20',
            desc: 'Múltiplos em linha com a média histórica. Recomenda-se aportes regulares sem antecipação excessiva.'
        };
    }, [isCrypto, isFii, livePvp, liveFiiMargin, liveGrahamMargin, liveBazinMargin, liveDy]);

    const handleSimulate = async () => {
        if (!ticker.trim() || !amount || amount <= 0) {
            showToast('Informe um ativo válido e o valor a aportar.', 'warning');
            return;
        }

        setLoading(true);
        setSimulationResult(null);

        try {
            const res = await simulateInvestmentPurchase({
                ticker: ticker.trim().toUpperCase(),
                amount,
                price: effectivePrice,
                assetClass: isCrypto ? 'CRYPTO' : isFii ? 'FII' : 'STOCK',
                bazinPrice: liveBazinPrice ?? undefined,
                grahamPrice: liveGrahamPrice ?? undefined,
                fiiCeilingPrice: liveFiiCeiling ?? undefined,
                pvp: livePvp ?? undefined,
                drawdownFromAthPct: activeQuote?.drawdownFromAthPct,
                dividendYield: liveDy / 100
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

    const resetToDefaults = () => {
        setCustomDividends('');
        setCustomVpa('');
        setCustomLpa('');
        if (activeQuote?.price) setCustomPrice(activeQuote.price);
        setBazinRate(isFii ? 8.75 : 6);
        showToast('Parâmetros restaurados com a base oficial de mercado.', 'info');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Strip */}
            <div className="bg-white/50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#0D9488]" />
                            <h2 className="text-label-caps !text-slate-400">Simulador Institucional & Inteligência Quantitativa</h2>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                            {simulatorView === 'valuation'
                                ? 'Planejamento Fundamentalista · Graham & Bazin Dinâmicos'
                                : simulatorView === 'montecarlo'
                                ? 'Simulação Estocástica de Monte Carlo (1.000 Trajetórias)'
                                : 'Laboratório de Stress Testing · Choques Históricos'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                            {simulatorView === 'valuation'
                                ? 'Simule o impacto do seu aporte em tempo real com Preço Teto Bazin, Preço Justo de Graham, P/VP patrimonial e renda passiva mensal.'
                                : simulatorView === 'montecarlo'
                                ? 'Projeção estatística de horizontes de até 30 anos com leques de probabilidade P10, P50 e P90 baseados na volatilidade da sua carteira.'
                                : 'Teste a resiliência do seu portfólio contra crises históricas como Circuit Breakers COVID-19, Joesley Day e Choque de Juros.'}
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end md:items-center gap-4">
                        <div className="text-right">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patrimônio Base</div>
                            <div className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                                {formatCurrency(Number(totalInvested || portfolioValue || 0))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-view switcher bar */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <button
                        onClick={() => setSimulatorView('valuation')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                            simulatorView === 'valuation'
                                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                        <span>🎯</span> Valuation Graham & Bazin
                    </button>
                    <button
                        onClick={() => setSimulatorView('montecarlo')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                            simulatorView === 'montecarlo'
                                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                        <span>🎲</span> Monte Carlo (1.000 Trajetórias)
                    </button>
                    <button
                        onClick={() => setSimulatorView('stresstest')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                            simulatorView === 'stresstest'
                                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                        <span>⚡</span> Stress Test de Crises
                    </button>
                </div>
            </div>

            {/* Sub-view Content */}
            {simulatorView === 'montecarlo' && <MonteCarloSimulator />}
            {simulatorView === 'stresstest' && <StressTestLab />}

            {simulatorView === 'valuation' && (
            /* Main Interactive Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Form Controls (5 cols) */}
                <div className="lg:col-span-5 bg-white/60 dark:bg-slate-900/60 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-sm space-y-5">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-label-caps !text-slate-400">Configuração do Aporte</h4>
                            <span className="text-[10px] font-bold text-[#0D9488] uppercase tracking-wider">
                                {isFii ? 'Fundo Imobiliário' : isCrypto ? 'Criptoativo' : 'Ação B3'}
                            </span>
                        </div>

                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Ativo Pretendido (Ticker)</label>
                        <div className="relative">
                            <input 
                                type="text"
                                value={ticker}
                                onChange={e => setTicker(e.target.value.toUpperCase())}
                                placeholder="Ex: PETR4, MXRF11, VALE3..."
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-black text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488] outline-none"
                            />
                            {fetchingQuote && (
                                <div className="absolute right-3 top-3 text-[10px] font-bold text-[#0D9488] animate-pulse">
                                    Atualizando cotação...
                                </div>
                            )}
                        </div>

                        {/* Quick Suggestions Chips */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setTicker(s)}
                                    className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg border transition-all ${
                                        ticker === s
                                            ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm'
                                            : 'bg-white dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-[#0D9488]'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                Valor a Aportar (R$)
                            </label>
                            <input 
                                type="number"
                                value={amount || ''}
                                onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
                                placeholder="1000"
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488] outline-none tabular-nums"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                Cotação da Simulação (R$)
                            </label>
                            <input 
                                type="number"
                                step="0.01"
                                value={customPrice}
                                onChange={e => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder={effectivePrice ? String(effectivePrice) : '0.00'}
                                className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488] outline-none tabular-nums"
                            />
                        </div>
                    </div>

                    {/* Interactive Valuation Snapshot Cards */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-3.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-slate-900 dark:text-white uppercase">{ticker}</span>
                                <span className="text-xs font-bold text-slate-500 tabular-nums">
                                    {formatCurrency(effectivePrice)}
                                </span>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${automatedVerdict.badgeClass}`}>
                                {automatedVerdict.badge}
                            </span>
                        </div>

                        {/* Valuation Indicators Grid */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
                            
                            {/* Card 1: P/VP Dinâmico */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/60">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">P/VP Real</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-black text-slate-900 dark:text-white text-sm tabular-nums">
                                        {livePvp !== null ? livePvp.toFixed(2) : 'n/d'}
                                    </span>
                                    {livePvp !== null && (
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                            livePvp < 0.98 
                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' 
                                                : livePvp > 1.05 
                                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400' 
                                                    : 'bg-teal-500/15 text-teal-700 dark:text-teal-400'
                                        }`}>
                                            {livePvp < 0.98 ? 'Desconto' : livePvp > 1.05 ? 'Ágio' : 'Par'}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                    VPA: {effectiveVpa > 0 ? formatCurrency(effectiveVpa) : 'n/d'}
                                </span>
                            </div>

                            {/* Card 2: Teto Bazin */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/60">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                                    Teto Bazin (DY {bazinRate}%)
                                </span>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="font-black text-slate-900 dark:text-white text-sm tabular-nums">
                                        {liveBazinPrice !== null ? formatCurrency(liveBazinPrice) : 'n/d'}
                                    </span>
                                </div>
                                {liveBazinMargin !== null && (
                                    <span className={`text-[9px] font-bold block mt-0.5 ${liveBazinMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        Margem: {liveBazinMargin >= 0 ? `+${liveBazinMargin}%` : `${liveBazinMargin}%`}
                                    </span>
                                )}
                            </div>

                            {/* Card 3: Preço Justo de Graham */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/60">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                                    {isFii ? 'Graham FII (VPA)' : 'Graham Justo'}
                                </span>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="font-black text-slate-900 dark:text-white text-sm tabular-nums">
                                        {liveGrahamPrice !== null ? formatCurrency(liveGrahamPrice) : 'n/d'}
                                    </span>
                                </div>
                                {liveGrahamMargin !== null && (
                                    <span className={`text-[9px] font-bold block mt-0.5 ${liveGrahamMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        Margem: {liveGrahamMargin >= 0 ? `+${liveGrahamMargin}%` : `${liveGrahamMargin}%`}
                                    </span>
                                )}
                            </div>

                            {/* Card 4: Dividend Yield 12M e Projeção */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/60">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">DY 12M Projetado</span>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="font-black text-[#0D9488] dark:text-teal-400 text-sm tabular-nums">
                                        {liveDy > 0 ? `${liveDy.toFixed(2)}%` : 'n/d'}
                                    </span>
                                </div>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                    Proventos: {effectiveDividends > 0 ? formatCurrency(effectiveDividends) : 'n/d'}/ano
                                </span>
                            </div>

                        </div>

                        {/* Diagnostic explanation line */}
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                            <strong className="text-slate-900 dark:text-white block font-bold">{automatedVerdict.title}</strong>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{automatedVerdict.desc}</p>
                        </div>
                    </div>

                    {/* Advanced Parameters Toggle (LPA, VPA, Proventos, Taxa) */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                            className="text-[10px] font-bold uppercase tracking-wider text-[#0D9488] hover:text-[#0F766E] flex items-center gap-1.5 transition-colors"
                        >
                            <span>{showAdvancedParams ? '▲ Ocultar Parâmetros Customizados' : '▼ Customizar Indicadores (LPA, VPA, Proventos, Taxa Bazin)'}</span>
                        </button>

                        {showAdvancedParams && (
                            <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3 animate-in fade-in duration-200">
                                <div className="grid grid-cols-2 gap-2.5 text-xs">
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                            Proventos 12M (R$)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={customDividends}
                                            onChange={e => setCustomDividends(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder={effectiveDividends ? String(effectiveDividends) : '0.00'}
                                            className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                            VPA (R$/ação ou cota)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={customVpa}
                                            onChange={e => setCustomVpa(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder={effectiveVpa ? String(effectiveVpa) : '0.00'}
                                            className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                            LPA (R$/ação)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={customLpa}
                                            onChange={e => setCustomLpa(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder={effectiveLpa ? String(effectiveLpa) : '0.00'}
                                            disabled={isFii}
                                            className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 disabled:opacity-40"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                            Taxa Bazin Requerida
                                        </label>
                                        <select
                                            value={bazinRate}
                                            onChange={e => setBazinRate(Number(e.target.value))}
                                            className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                                        >
                                            <option value={6}>6.0% (Bazin Clássico Ações)</option>
                                            <option value={8}>8.0% (Conservador)</option>
                                            <option value={8.75}>8.75% (Spread NTN-B FIIs)</option>
                                            <option value={10}>10.0% (Exigente / FII Papel)</option>
                                            <option value={12}>12.0% (Alto Risco)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-1">
                                    <button
                                        type="button"
                                        onClick={resetToDefaults}
                                        className="text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                        Restaurar Padrão do Mercado
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pre-computation of allocation & projected passive income */}
                    <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl border border-teal-200/80 dark:border-teal-900/40 text-xs space-y-2.5">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">Quantidade estimada de cotas/ações:</span>
                            <span className="font-black text-slate-900 dark:text-white tabular-nums">
                                ~{estQuantity} {isCrypto ? 'frações' : isFii ? 'cotas' : 'ações'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">Renda Passiva Mensal Estimada:</span>
                            <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                +{formatCurrency(estMonthlyIncome)}/mês
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 dark:text-slate-400 font-medium">Concentração no ativo na carteira:</span>
                            <span className="font-bold text-[#0D9488] dark:text-teal-400 tabular-nums">
                                {currentWeight.toFixed(1)}% ➔ {newWeight.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSimulate}
                        disabled={loading || !effectivePrice || effectivePrice <= 0}
                        className="w-full py-3.5 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] active:scale-95 shadow-md shadow-teal-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Processando Diagnóstico com IA...</span>
                            </>
                        ) : (
                            <>
                                <span>Gerar Parecer Estratégico com IA</span>
                                <TrendingUpIcon className="w-3.5 h-3.5" />
                            </>
                        )}
                    </button>
                </div>

                {/* Report Panel (7 cols) */}
                <div className="lg:col-span-7 bg-white/60 dark:bg-slate-900/60 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-sm min-h-[500px] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200/60 dark:border-slate-800">
                            <div>
                                <h3 className="text-label-caps !text-slate-400">Diagnóstico Executivo</h3>
                                <h4 className="text-base font-bold text-gray-900 dark:text-white uppercase tracking-tight">Avaliação de Aporte — {ticker}</h4>
                            </div>
                            <span className="px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-teal-500/20">
                                Gestor Financeiro
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
                                <div className="w-10 h-10 border-3 border-teal-500/20 border-t-[#0D9488] rounded-full animate-spin" />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Analisando Graham, Bazin e Concentração de Risco...</p>
                                    <p className="text-xs text-slate-400">Consultando múltiplos contábeis e calculando sensibilidade da carteira.</p>
                                </div>
                            </div>
                        ) : simulationResult ? (
                            <div className="prose dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-700 dark:text-slate-200 space-y-4 whitespace-pre-line">
                                {simulationResult}
                            </div>
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 text-slate-400">
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center text-2xl">
                                    📈
                                </div>
                                <div className="space-y-1 max-w-sm">
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                        Diagnóstico em Tempo Real Ativo
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Os múltiplos de <strong>Graham</strong>, <strong>Bazin</strong> e <strong>P/VP</strong> já estão calculados dinamicamente no painel ao lado. Clique em &quot;Gerar Parecer Estratégico com IA&quot; para obter o relatório executivo completo.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 mt-6 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <span>Gestor Financeiro · Valuation Fundamentalista Graham & Bazin</span>
                        <span>* Métricas 100% calculadas dinamicamente com dados da B3/CVM.</span>
                    </div>
                </div>

            </div>
            )}
        </div>
    );
};
