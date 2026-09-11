import React, { useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';
import { SparklesIcon } from './icons';

interface DetectedSubscription {
    name: string;
    category: string;
    monthlyAmount: number;
    annualProjected: number;
    occurrences: number;
    lastDate: string;
    driftPct?: number; // e.g., +15% price hike
    isFeeOrLeak: boolean;
    providerType: 'saas' | 'streaming' | 'telecom' | 'fitness' | 'bank_fee' | 'utility' | 'other';
}

export const SubscriptionLeakRadar: React.FC = () => {
    const { transactions } = useFinancialData();
    const [filterType, setFilterType] = useState<'all' | 'leaks' | 'saas_streaming'>('all');
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    const analysis = useMemo(() => {
        const expenses = transactions.filter(t => t.transactionType === TransactionType.EXPENSE);

        // Group by normalized keyword/provider
        const providerPatterns: Array<{
            id: string;
            label: string;
            type: DetectedSubscription['providerType'];
            isFeeOrLeak: boolean;
            regex: RegExp;
        }> = [
            // Bank fees / Leaks
            { id: 'tarifa_banco', label: 'Tarifa de Conta Bancária', type: 'bank_fee', isFeeOrLeak: true, regex: /tarifa|anuidade|pacote serv|manutencao conta|cesta basica/i },
            { id: 'iof_juros', label: 'Juros e IOF Rotativo', type: 'bank_fee', isFeeOrLeak: true, regex: /iof|juros rotativo|multa atraso/i },
            // Streaming
            { id: 'netflix', label: 'Netflix', type: 'streaming', isFeeOrLeak: false, regex: /netflix/i },
            { id: 'spotify', label: 'Spotify', type: 'streaming', isFeeOrLeak: false, regex: /spotify/i },
            { id: 'amazon_prime', label: 'Amazon Prime', type: 'streaming', isFeeOrLeak: false, regex: /amazon prime|prime video/i },
            { id: 'disney', label: 'Disney+ / Star+', type: 'streaming', isFeeOrLeak: false, regex: /disney|star\+/i },
            { id: 'max_hbo', label: 'Max (HBO)', type: 'streaming', isFeeOrLeak: false, regex: /hbo|max\.com/i },
            { id: 'youtube_prem', label: 'YouTube Premium', type: 'streaming', isFeeOrLeak: false, regex: /youtube.*prem/i },
            // SaaS & Cloud
            { id: 'apple', label: 'Apple Services (iCloud)', type: 'saas', isFeeOrLeak: false, regex: /apple\.com|itunes/i },
            { id: 'google_cloud', label: 'Google One / Workspace', type: 'saas', isFeeOrLeak: false, regex: /google.*storage|google.*cloud|google.*workspace/i },
            { id: 'openai', label: 'OpenAI (ChatGPT Plus)', type: 'saas', isFeeOrLeak: false, regex: /openai|chatgpt/i },
            { id: 'claude', label: 'Anthropic (Claude Pro)', type: 'saas', isFeeOrLeak: false, regex: /anthropic|claude/i },
            { id: 'microsoft', label: 'Microsoft 365 / Azure', type: 'saas', isFeeOrLeak: false, regex: /microsoft|office 365|azure/i },
            { id: 'github', label: 'GitHub Copilot / Sub', type: 'saas', isFeeOrLeak: false, regex: /github/i },
            // Fitness
            { id: 'gympass', label: 'Gympass / Wellhub', type: 'fitness', isFeeOrLeak: false, regex: /gympass|wellhub/i },
            { id: 'smartfit', label: 'Smart Fit', type: 'fitness', isFeeOrLeak: false, regex: /smart\s*fit|smartfit/i },
            { id: 'bluefit', label: 'Bluefit', type: 'fitness', isFeeOrLeak: false, regex: /bluefit/i },
            { id: 'totalpass', label: 'TotalPass', type: 'fitness', isFeeOrLeak: false, regex: /totalpass/i },
            // Telecom & Utilities
            { id: 'telecom_vivo', label: 'Vivo Fibra / Móvel', type: 'telecom', isFeeOrLeak: false, regex: /vivo/i },
            { id: 'telecom_claro', label: 'Claro / Net', type: 'telecom', isFeeOrLeak: false, regex: /claro|net servicos/i },
            { id: 'telecom_tim', label: 'TIM Celular / Fibra', type: 'telecom', isFeeOrLeak: false, regex: /tim/i },
            { id: 'energia', label: 'Energia Elétrica', type: 'utility', isFeeOrLeak: false, regex: /enel|cpfl|energisa|elektro|cemig|copel/i },
            { id: 'agua', label: 'Água e Saneamento', type: 'utility', isFeeOrLeak: false, regex: /sabesp|sanepar|copasa|cedae/i },
            { id: 'sem_parar', label: 'Sem Parar / Veloe / ConectCar', type: 'other', isFeeOrLeak: false, regex: /sem parar|veloe|conectcar/i },
        ];

        const results: DetectedSubscription[] = [];

        providerPatterns.forEach(provider => {
            const matches = expenses.filter(t => provider.regex.test(t.description) || provider.regex.test(t.category));
            if (matches.length > 0) {
                // Sort by date ascending
                matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                const occurrences = matches.length;
                const latestTx = matches[matches.length - 1];
                const latestAmount = Number(latestTx.amount);
                
                // Drift calculation if multiple occurrences
                let driftPct: number | undefined = undefined;
                if (matches.length >= 2) {
                    const firstAmount = Number(matches[0].amount);
                    if (firstAmount > 0 && Math.abs(latestAmount - firstAmount) > 1) {
                        driftPct = ((latestAmount - firstAmount) / firstAmount) * 100;
                    }
                }

                results.push({
                    name: provider.label,
                    category: latestTx.category,
                    monthlyAmount: latestAmount,
                    annualProjected: latestAmount * 12,
                    occurrences,
                    lastDate: latestTx.date.split('T')[0],
                    driftPct,
                    isFeeOrLeak: provider.isFeeOrLeak,
                    providerType: provider.type
                });
            }
        });

        // Also identify recurring patterns that happen with the exact same description and amount >= 2 times
        const recurringMap = new Map<string, typeof expenses>();
        expenses.forEach(tx => {
            const key = `${tx.description.trim().toLowerCase()}_${tx.amount}`;
            if (!recurringMap.has(key)) recurringMap.set(key, []);
            recurringMap.get(key)!.push(tx);
        });

        recurringMap.forEach((txList) => {
            if (txList.length >= 2) {
                const sample = txList[0];
                const alreadyMatched = results.some(r => r.name.toLowerCase() === sample.description.toLowerCase());
                if (!alreadyMatched) {
                    const amt = Number(sample.amount);
                    results.push({
                        name: sample.description,
                        category: sample.category,
                        monthlyAmount: amt,
                        annualProjected: amt * 12,
                        occurrences: txList.length,
                        lastDate: txList[txList.length - 1].date.split('T')[0],
                        isFeeOrLeak: /tarifa|taxa|multa/i.test(sample.description),
                        providerType: 'other'
                    });
                }
            }
        });

        // Totals
        const totalMonthly = results.reduce((acc, r) => acc + r.monthlyAmount, 0);
        const totalAnnual = results.reduce((acc, r) => acc + r.annualProjected, 0);
        const totalLeakMonthly = results.filter(r => r.isFeeOrLeak).reduce((acc, r) => acc + r.monthlyAmount, 0);
        const totalLeakAnnual = totalLeakMonthly * 12;

        return {
            items: results,
            totalMonthly,
            totalAnnual,
            totalLeakMonthly,
            totalLeakAnnual,
            leakCount: results.filter(r => r.isFeeOrLeak).length
        };
    }, [transactions]);

    const displayedItems = analysis.items.filter(item => {
        if (filterType === 'leaks') return item.isFeeOrLeak;
        if (filterType === 'saas_streaming') return item.providerType === 'saas' || item.providerType === 'streaming';
        return true;
    });

    // 5-year investment compounding simulation (100% CDI ~ 10.5% a.a.)
    const monthlyRate = Math.pow(1 + 0.105, 1 / 12) - 1;
    const months = 60;
    const futureCompoundedValue = analysis.totalMonthly > 0 
        ? analysis.totalMonthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) 
        : 0;

    const handleGenerateAiReport = async () => {
        setIsGeneratingReport(true);
        setAiReport(null);
        try {
            const token = window.localStorage.getItem('gestor_financeiro_app_token');
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (token) headers['authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/ai/advice', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    kind: 'subscription_optimization',
                    subscriptions: {
                        annualProjected: analysis.totalAnnual,
                        monthlyTotal: analysis.totalMonthly,
                        items: analysis.items,
                        leaks: analysis.items.filter(r => r.isFeeOrLeak)
                    }
                })
            });
            const data = await res.json();
            if (data.text) {
                setAiReport(data.text);
            } else {
                setAiReport('Não foi possível gerar a auditoria de assinaturas no momento.');
            }
        } catch {
            setAiReport('Erro ao contatar o auditor de eficiência operacional.');
        } finally {
            setIsGeneratingReport(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Radar Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 text-white border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#0D9488]/15 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-[10px] font-black uppercase tracking-widest border border-teal-500/30">
                            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                            Radar Anti-Vazamento de Caixa & Assinaturas
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                            Monitoramento de Custos Fixos & Drenos Silenciosos
                        </h2>
                        <p className="text-xs text-slate-400 max-w-xl">
                            Algoritmo que rastreia cobranças repetitivas, aumentos de mensalidade (drift) e tarifas bancárias evitáveis no seu fluxo de caixa.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0">
                        <button
                            onClick={handleGenerateAiReport}
                            disabled={isGeneratingReport}
                            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            <span>{isGeneratingReport ? 'Auditando Gastos...' : 'Otimizar com IA'}</span>
                        </button>

                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Dreno Anual Projetado</span>
                            <span className="text-xl sm:text-2xl font-black text-rose-400 tabular-nums">
                                {formatCurrency(analysis.totalAnnual)}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                                {formatCurrency(analysis.totalMonthly)}/mês comprometidos
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Optimization Drawer */}
            {aiReport && (
                <div className="p-6 rounded-3xl bg-teal-500/10 border border-teal-500/30 text-slate-800 dark:text-slate-100 space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
                        <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-bold text-xs uppercase tracking-wider">
                            <SparklesIcon className="w-4 h-4" />
                            <span>Parecer de Redução de Fugas & Roteiro de Negociação</span>
                        </div>
                        <button
                            onClick={() => setAiReport(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold uppercase"
                        >
                            Fechar
                        </button>
                    </div>
                    <div className="text-xs leading-relaxed whitespace-pre-line font-sans">
                        {aiReport}
                    </div>
                </div>
            )}

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Detectado</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {analysis.items.length} contratos
                        </span>
                    </div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2 tabular-nums">
                        {formatCurrency(analysis.totalMonthly)}
                        <span className="text-xs font-semibold text-slate-400">/mês</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Soma dos compromissos recorrentes ativos
                    </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">Tarifas e Vazamentos</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300">
                            {analysis.leakCount} itens
                        </span>
                    </div>
                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2 tabular-nums">
                        {formatCurrency(analysis.totalLeakAnnual)}
                        <span className="text-xs font-semibold text-slate-400">/ano</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Tarifas de conta e taxas com potencial de 100% de economia
                    </p>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-teal-500/20 dark:border-teal-500/30 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#0D9488] dark:text-teal-400">Simulador de Futuro (5 Anos)</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-teal-50 dark:bg-teal-950/50 text-[#0D9488] dark:text-teal-300">
                            100% CDI
                        </span>
                    </div>
                    <p className="text-2xl font-black text-[#0D9488] dark:text-teal-300 mt-2 tabular-nums">
                        {formatCurrency(futureCompoundedValue)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Patrimônio gerado ao investir essa quantia mensalmente
                    </p>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'all' ? 'bg-[#0D9488] text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                    >
                        Todas as Recorrências ({analysis.items.length})
                    </button>
                    <button
                        onClick={() => setFilterType('leaks')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'leaks' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                    >
                        Vazamentos & Tarifas ({analysis.leakCount})
                    </button>
                    <button
                        onClick={() => setFilterType('saas_streaming')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === 'saas_streaming' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                    >
                        SaaS & Streaming
                    </button>
                </div>
            </div>

            {/* Subscription Table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
                {displayedItems.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <p className="text-sm font-semibold">Nenhuma recorrência identificada neste filtro.</p>
                        <p className="text-xs mt-1">Conforme você cadastra ou importa extratos bancários, o radar identifica padrões automaticamente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-black tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="py-3 px-4">Serviço / Fornecedor</th>
                                    <th className="py-3 px-4">Categoria</th>
                                    <th className="py-3 px-4 text-right">Mensalidade</th>
                                    <th className="py-3 px-4 text-right">Impacto Anual</th>
                                    <th className="py-3 px-4 text-center">Detecção de Drift</th>
                                    <th className="py-3 px-4 text-center">Status / Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {displayedItems.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${item.isFeeOrLeak ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600' : 'bg-teal-50 dark:bg-teal-950/60 text-[#0D9488]'}`}>
                                                    {item.isFeeOrLeak ? '💸' : '🔄'}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-800 dark:text-slate-100 block">{item.name}</span>
                                                    <span className="text-[10px] text-slate-400">Última cobrança: {item.lastDate}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400">
                                            {item.category}
                                        </td>
                                        <td className="py-3 px-4 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">
                                            {formatCurrency(item.monthlyAmount)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-black tabular-nums text-slate-700 dark:text-slate-300">
                                            {formatCurrency(item.annualProjected)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {item.driftPct && item.driftPct > 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300">
                                                    +{item.driftPct.toFixed(1)}% aumento
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400">Preço Estável</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {item.isFeeOrLeak ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300">
                                                    Dreno Evitável
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                    Ativo
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
