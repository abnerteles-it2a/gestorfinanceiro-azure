import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';
import { calculateMeiFiscal } from '../utils/meiFiscalCalculator';
import { AlertTriangleIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, BankIcon, TrendingUpIcon, CalendarIcon } from './icons';

export const MeiMonitoringWidget: React.FC = () => {
    const { transactions, categories, isMei, meiOpeningDate, viewMode } = useFinancialData();
    const [obligations, setObligations] = React.useState<any[]>([]);
    const currentYear = new Date().getFullYear();
    const today = new Date();
    React.useEffect(() => {
        if (!isMei) return;
        const token = window.localStorage.getItem('gestor_financeiro_app_token');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) headers.authorization = `Bearer ${token}`;
        if (viewMode) headers['x-view-mode'] = viewMode;
        fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'mei_obligations_list', data: {} }) })
            .then(response => response.ok ? response.json() : { rows: [] })
            .then(data => setObligations(Array.isArray(data.rows) ? data.rows : []))
            .catch(() => setObligations([]));
    }, [isMei, viewMode]);
    const fiscal = useMemo(
        () => calculateMeiFiscal({ transactions, categories, year: currentYear, openingDate: meiOpeningDate }),
        [transactions, categories, currentYear, meiOpeningDate],
    );
    const yearlyRevenue = fiscal.annualRevenue;
    const revenuePercentage = fiscal.limitUsagePercent;
    const remainingLimit = fiscal.remainingLimit;

    const overdueDas = useMemo(() => obligations
        .filter(item => item.obligation_type === 'das_mei' && item.status === 'overdue')
        .map(item => new Date(`${item.reference_year}-${String(item.reference_month).padStart(2, '0')}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })), [obligations]);

    if (!isMei) return null;

    const isNearLimit = revenuePercentage > 80;
    const pendingDas = obligations.filter(item => item.obligation_type === 'das_mei' && ['pending', 'scheduled'].includes(item.status));
    const hasOverdue = overdueDas.length > 0;
    const hasPendingDas = pendingDas.length > 0;
    const hasDasAlert = hasOverdue || hasPendingDas;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col h-full">
            {/* Header */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 flex justify-between items-center border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                        <BankIcon className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 tracking-tight">Monitoramento MEI</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Exercício {currentYear}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${hasDasAlert ? (hasOverdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700') : 'bg-emerald-100 text-emerald-600'}`}>
                        {hasOverdue ? 'DAS Atrasado' : hasPendingDas ? 'DAS Pendente' : 'Regularizado'}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 flex-1 space-y-6">
                {/* Revenue Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Receita Empresarial Anual</p>
                            <h4 className="text-xl font-black text-slate-900 dark:text-slate-50">{formatCurrency(yearlyRevenue)}</h4>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Teto MEI</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatCurrency(fiscal.effectiveAnnualLimit)}</p>
                        </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                        <div 
                            className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full ${
                                isNearLimit ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                            }`}
                            style={{ width: `${Math.min(revenuePercentage, 100)}%` }}
                        />
                    </div>
                    
                    <div className="flex justify-between items-center text-[11px] font-medium">
                        <span className="text-slate-500">Utilizado: <b className="text-slate-700 dark:text-slate-300">{revenuePercentage.toFixed(1)}%</b></span>
                        <span className={isNearLimit ? 'text-red-500 font-bold' : 'text-slate-500'}>
                            Limite Restante: <b>{formatCurrency(remainingLimit)}</b>
                        </span>
                    </div>
                </div>

                {/* DAS & Portal Alerts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`p-3.5 rounded-xl border transition-all ${
                        hasDasAlert
                            ? 'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' 
                            : 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/30'
                    }`}>
                        <div className="flex items-center gap-2.5 mb-2">
                            {hasOverdue ? <AlertTriangleIcon className="h-4 w-4 text-red-500" /> : hasPendingDas ? <AlertTriangleIcon className="h-4 w-4 text-amber-500" /> : <CheckCircleIcon className="h-4 w-4 text-emerald-500" />}
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Pagamentos DAS</span>
                        </div>
                        {hasDasAlert ? (
                            <div className="space-y-1.5">
                                <p className={`text-[11px] ${hasOverdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'} font-medium leading-tight`}>
                                    Identificamos pendências nos meses:
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {[...overdueDas, ...(hasPendingDas ? ['pendentes'] : [])].map(month => (
                                        <span key={month} className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${hasOverdue && month !== 'pendentes' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>{month}</span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                                Nenhuma obrigação DAS pendente no momento.
                            </p>
                        )}
                    </div>

                    <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <TrendingUpIcon className="h-4 w-4 text-indigo-500" />
                            Gestão Fiscal
                        </p>
                        <div className="flex flex-col gap-2">
                            <a 
                                href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center justify-between group p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                            >
                                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 group-hover:text-indigo-600">Portal PGMEI</span>
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500" />
                            </a>
                            <a 
                                href="https://www.nfse.gov.br/EmissorNacional" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center justify-between group p-1.5 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
                            >
                                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 group-hover:text-indigo-600">Emissor NFS-e</span>
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('gestor_financeiro_add_tx', { detail: { category: 'Impostos', description: 'DAS MEI' } }))}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-200 dark:shadow-none"
                >
                    <CalendarIcon className="h-4 w-4" />
                    Registrar Pagamento DAS
                </button>
            </div>
        </div>
    );
};
