import React, { useEffect, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { AlertTriangleIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon } from './icons';

export const MeiStatusWidget: React.FC = () => {
    const { isMei, viewMode } = useFinancialData();
    const [obligations, setObligations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!isMei) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setHasError(false);
            try {
                const token = window.localStorage.getItem('gestor_financeiro_app_token');
                const headers: Record<string, string> = { 'content-type': 'application/json' };
                if (token) headers.authorization = `Bearer ${token}`;
                if (viewMode) headers['x-view-mode'] = viewMode;
                const response = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'mei_obligations_list', data: {} }) });
                if (!response.ok) throw new Error('mei_obligations_unavailable');
                const data = await response.json();
                if (!cancelled) setObligations(Array.isArray(data.rows) ? data.rows : []);
            } catch {
                if (!cancelled) setHasError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isMei, viewMode]);

    if (!isMei) return null;

    const overdue = obligations.filter(item => item.obligation_type === 'das_mei' && item.status === 'overdue');
    const pending = obligations.filter(item => item.obligation_type === 'das_mei' && ['pending', 'scheduled'].includes(item.status));
    const hasAlert = overdue.length > 0 || pending.length > 0;
    const months = [...overdue, ...pending].slice(0, 3).map(item => new Date(`${item.reference_year}-${String(item.reference_month).padStart(2, '0')}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' }));

    return (
        <div aria-live="polite" className={`p-4 rounded-lg shadow-sm border-l-4 ${hasAlert ? 'bg-red-50 dark:bg-red-900/20 border-red-500' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start min-w-0">
                    <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                        {hasAlert ? <AlertTriangleIcon className="h-5 w-5 text-red-500" /> : <CheckCircleIcon className="h-5 w-5 text-blue-500" />}
                    </div>
                    <div className="ml-3 min-w-0">
                        <h3 className={`text-sm font-medium ${hasAlert ? 'text-red-800 dark:text-red-200' : 'text-blue-800 dark:text-blue-200'}`}>
                            {loading ? 'Atualizando monitoramento MEI…' : hasAlert ? 'Atenção: obrigações DAS pendentes' : 'Monitoramento MEI'}
                        </h3>
                        <p className={`mt-1 text-sm ${hasAlert ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}`}>
                            {hasError ? 'Não foi possível consultar as obrigações. Tente atualizar novamente.' : loading ? 'Consultando competências persistidas…' : hasAlert ? `${overdue.length} atrasada(s) e ${pending.length} pendente(s). ${months.join(', ')}.` : 'Suas obrigações fiscais estão em dia.'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-8 md:pl-0">
                    <a href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao" target="_blank" rel="noopener noreferrer" aria-label="Abrir Portal PGMEI em nova aba" className={`min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${hasAlert ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-100' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-700'}`}>
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" aria-hidden="true" /> Portal PGMEI
                    </a>
                    <a href="https://www.nfse.gov.br/EmissorNacional" target="_blank" rel="noopener noreferrer" aria-label="Abrir Emissor Nacional NFS-e em nova aba" className={`min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${hasAlert ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-100' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-700'}`}>
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" aria-hidden="true" /> Emissor NFS-e
                    </a>
                </div>
            </div>
        </div>
    );
};
