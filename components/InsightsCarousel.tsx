import React, { useState, useEffect, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TrendingDownIcon, AlertTriangleIcon, TrophyIcon, TrendingUpIcon, RocketIcon, SparklesIcon } from './icons';

export const InsightsCarousel: React.FC<{ variant?: 'default' | 'nested' }> = ({ variant = 'default' }) => {
    const { getInsights, aiInsights, isAiLoading, financialScore, transactions, accounts, executeAdvisorAction } = useFinancialData();
    const [isExecuting, setIsExecuting] = useState(false);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    
    // Health Score Logic (Transferred from FinancialHealthScore)
    const healthStatus = useMemo(() => {
        if (transactions.length === 0) {
            return { color: 'text-slate-400', strokeColor: '#94a3b8', message: 'Início', score: 0 };
        }

        let color = 'text-rose-500';
        let strokeColor = '#f43f5e'; // rose-500
        let message = 'Crítico';
        
        if (financialScore >= 80) { 
            color = 'text-emerald-500'; 
            strokeColor = '#10b981'; // emerald-500
            message = 'Excelente'; 
        } else if (financialScore >= 50) { 
            color = 'text-green-500'; 
            strokeColor = '#22c55e'; // green-500
            message = 'Bom'; 
        } else if (financialScore >= 30) {
            color = 'text-amber-500';
            strokeColor = '#f59e0b'; // amber-500
            message = 'Atenção';
        }
        
        return { color, strokeColor, message, score: financialScore };
    }, [financialScore, transactions.length]);

    interface InsightItem {
        type: 'positive' | 'negative' | 'neutral';
        message: string;
        icon: string;
        action?: { label: string; actionType: string; params: any; type?: string };
        isAi?: boolean;
    }

    // Merge AI insights with local rules-based insights
    const allInsights = useMemo<InsightItem[]>(() => {
        const local = getInsights();
        const taggedAi = aiInsights.map(insight => ({ 
            ...insight, 
            isAi: true,
            action: insight.action ? {
                ...insight.action,
                type: insight.action.actionType
            } : undefined
        }));
        return [...taggedAi, ...local] as InsightItem[];
    }, [getInsights, aiInsights]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissVersion, setDismissVersion] = useState(0);

    // --- Persistent Dismiss System (30-minute cooldown) ---
    const DISMISS_KEY = 'gf_insights_dismissed';
    const DISMISS_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

    const getDismissedMap = (): Record<string, number> => {
        try {
            const raw = sessionStorage.getItem(DISMISS_KEY);
            if (!raw) return {};
            const map = JSON.parse(raw);
            // Clean expired entries
            const now = Date.now();
            const cleaned: Record<string, number> = {};
            for (const [key, ts] of Object.entries(map)) {
                if (now - (ts as number) < DISMISS_COOLDOWN_MS) {
                    cleaned[key] = ts as number;
                }
            }
            return cleaned;
        } catch { return {}; }
    };

    const getInsightKey = (insight: any): string => {
        return (insight?.message || '').substring(0, 50);
    };

    const filteredInsights = useMemo(() => {
        const dismissedMap = getDismissedMap();
        return allInsights.filter(insight => {
            const key = getInsightKey(insight);
            return !dismissedMap[key];
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allInsights, dismissVersion]);

    const currentInsight = filteredInsights[currentIndex];

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentInsight) return;
        
        const key = getInsightKey(currentInsight);
        const map = getDismissedMap();
        map[key] = Date.now();
        sessionStorage.setItem(DISMISS_KEY, JSON.stringify(map));
        
        // Trigger re-render and adjust index
        setDismissVersion(v => v + 1);
        setCurrentIndex(prev => {
            const newLength = filteredInsights.length - 1;
            if (newLength <= 0) return 0;
            return prev >= newLength ? 0 : prev;
        });
    };

    // Auto-rotation
    useEffect(() => {
        if (filteredInsights.length <= 1 || showAccountSelector || isExecuting) return;
        if (currentInsight?.type === 'negative') return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % filteredInsights.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [filteredInsights.length, showAccountSelector, isExecuting, currentInsight?.type]);

    // Progress Ring Constants
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (financialScore / 100) * circumference;

    const isNegativeAlert = currentInsight?.type === 'negative';
    // For styling: default variant = dark rose bg (white text), nested variant = light rose bg (dark text)
    const isDefaultNegative = isNegativeAlert && variant === 'default';
    const isNestedNegative  = isNegativeAlert && variant === 'nested';

    const handleExecute = async () => {
        if (!selectedAccountId && currentInsight?.action?.type === 'pay_bill') {
            setShowAccountSelector(true);
            return;
        }

        setIsExecuting(true);
        try {
            const res = await executeAdvisorAction(currentInsight.action.type, {
                ...currentInsight.action.params,
                accountId: selectedAccountId
            });
            if (res.success) {
                setShowAccountSelector(false);
                setSelectedAccountId('');
                // Maybe move to next insight or show feedback
            }
        } finally {
            setIsExecuting(false);
        }
    };

    if (isAiLoading && allInsights.length === 0) {
        return (
            <div className={`${variant === 'default' ? 'bg-white/80 dark:bg-gray-800/80' : 'bg-transparent'} backdrop-blur-md rounded-xl ${variant === 'default' ? 'shadow-lg border-indigo-100 dark:border-indigo-900/30' : 'border-transparent'} p-5 min-h-[110px] border animate-pulse flex items-center`}>
                <div className="flex items-center w-full gap-4">
                    <div className="h-14 w-14 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                    <div className="flex-1 space-y-2">
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative group overflow-hidden">
            {/* Background Glow - only for default */}
            {variant === 'default' && (
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-teal-500 to-pink-500 rounded-xl blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
            )}
            
            <div className={`relative ${variant === 'default' 
                ? (isNegativeAlert 
                    ? 'bg-rose-600 dark:bg-rose-900 shadow-xl border-rose-400 dark:border-rose-700' 
                    : 'bg-white/90 dark:bg-gray-800/95 shadow-sm hover:shadow-md border-slate-200/50 dark:border-slate-700/50') 
                : (isNegativeAlert
                    ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40'
                    : 'bg-slate-50/80 dark:bg-indigo-900/10 border-slate-200/60 dark:border-indigo-800/20')} backdrop-blur-xl rounded-xl border p-5 min-h-[110px] flex items-center transition-all duration-500`}>
                
                <div className="flex items-center w-full gap-5">
                    
                    {/* Health Score Gauge */}
                    <div className="relative flex-shrink-0 flex items-center justify-center overflow-visible" style={{width: 'clamp(36px, 6vw, 56px)', height: 'clamp(36px, 6vw, 56px)'}}>
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
                            <circle
                                cx="28"
                                cy="28"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                className={isDefaultNegative ? 'text-rose-800/30' : 'text-slate-200 dark:text-slate-700'}
                            />
                            <circle
                                cx="28"
                                cy="28"
                                r={radius}
                                stroke={isDefaultNegative ? '#fff' : healthStatus.strokeColor}
                                strokeWidth="4"
                                fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-xs font-bold ${isDefaultNegative ? 'text-white' : healthStatus.color}`}>{financialScore}</span>
                        </div>
                    </div>

                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                                    isDefaultNegative ? 'text-rose-100' : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                    Saúde: <span className={isDefaultNegative ? 'text-white' : healthStatus.color}>{healthStatus.message}</span>
                                </span>
                                {currentInsight?.isAi && (
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                            isDefaultNegative ? 'text-rose-600 bg-white' :
                                            isNestedNegative  ? 'text-rose-700 bg-rose-100' :
                                            'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30'
                                        }`}>
                                            <SparklesIcon className="w-2.5 h-2.5" /> IA Advisor
                                        </span>
                                        {!showAccountSelector && !isExecuting && (
                                            <button 
                                                onClick={handleDismiss}
                                                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition-colors ${
                                                isDefaultNegative ? 'bg-rose-800/40 text-rose-100 hover:bg-rose-800/60' :
                                                isNestedNegative  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' :
                                                'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-600'
                                            }`}
                                            >
                                                Lembrar Depois
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => {
                                                // Clear all insight caches
                                                for (let i = 0; i < sessionStorage.length; i++) {
                                                    const key = sessionStorage.key(i);
                                                    if (key && (key.startsWith('gf_ai_insights') || key === DISMISS_KEY)) {
                                                        sessionStorage.removeItem(key);
                                                        i--; // Adjust index after removal
                                                    }
                                                }
                                                window.location.reload();
                                            }}
                                            title="Recarregar IA (Limpar Cache)"
                                            className={`p-1 rounded-full transition-colors ${isNegativeAlert ? 'text-rose-200 hover:bg-rose-800/40 hover:text-white' : 'text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-500'}`}
                                        >
                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                            {isAiLoading && <div className={`w-1.5 h-1.5 rounded-full animate-ping ${isDefaultNegative ? 'bg-white' : isNestedNegative ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>}
                        </div>

                        <p className={`text-sm leading-snug ${
                            isDefaultNegative ? 'font-bold text-white' :
                            isNestedNegative  ? 'font-bold text-rose-800' :
                            (currentInsight?.isAi ? 'font-semibold text-slate-800 dark:text-slate-100 italic' : 'text-slate-600 dark:text-slate-300')
                        }`}>
                            {currentInsight ? `"${currentInsight.message}"` : 'Obtendo novas perspectivas financeiras...'}
                        </p>

                        {/* Action Area */}
                        {currentInsight?.action && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {!showAccountSelector ? (
                                    <button
                                        onClick={() => setShowAccountSelector(true)}
                                        disabled={isExecuting}
                                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-50 ${isNegativeAlert ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                    >
                                        {isExecuting ? 'Executando...' : currentInsight.action.label || 'Agendar Pagamento'}
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-top-2 duration-300">
                                        <select
                                            value={selectedAccountId}
                                            onChange={(e) => setSelectedAccountId(e.target.value)}
                                            className={`text-[10px] rounded-lg py-1 px-2 flex-1 outline-none border transition-colors ${isNegativeAlert ? 'bg-rose-800/40 text-white border-rose-400 placeholder-rose-200 focus:ring-1 focus:ring-white' : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500'}`}
                                        >
                                            <option value="" className="text-slate-800">Selecione a Conta</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id} className="text-slate-800">{acc.name} (R$ {acc.balance.toLocaleString()})</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleExecute}
                                            disabled={!selectedAccountId || isExecuting}
                                            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 shadow-sm ${isNegativeAlert ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                        >
                                            {isExecuting ? '...' : 'Confirmar'}
                                        </button>
                                        <button
                                            onClick={() => setShowAccountSelector(false)}
                                            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors ${isNegativeAlert ? 'bg-rose-800/40 text-white hover:bg-rose-800/60' : 'bg-slate-100 dark:bg-slate-700 dark:text-white hover:bg-slate-200'}`}
                                        >
                                            X
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {allInsights.length > 1 && !showAccountSelector && (
                    <div className="absolute bottom-3 right-5 flex gap-1">
                        {allInsights.map((_, i) => (
                            <div 
                                key={i} 
                                className={`h-1 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-3 bg-indigo-500' : 'w-1 bg-slate-200 dark:bg-slate-700'}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
