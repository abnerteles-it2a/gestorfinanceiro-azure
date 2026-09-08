import React, { useState, useMemo } from 'react';
import { Modal } from './shared/Modal';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';
import { calculateMeiFiscal } from '../utils/meiFiscalCalculator';
import { DownloadIcon, ArrowTopRightOnSquareIcon } from './icons';

interface MeiReportsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const MeiReportsModal: React.FC<MeiReportsModalProps> = ({ isOpen, onClose }) => {
    const { transactions, categories, addTransaction, accounts, meiOpeningDate, viewMode } = useFinancialData();
    const [activeTab, setActiveTab] = useState<'dasn' | 'irpf' | 'das' | 'dre'>('das');
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [obligations, setObligations] = useState<any[]>([]);
    const [obligationsLoading, setObligationsLoading] = useState(false);
    const [obligationsError, setObligationsError] = useState(false);

    React.useEffect(() => {
        if (!isOpen) return;
        setObligationsLoading(true);
        setObligationsError(false);
        const token = window.localStorage.getItem('gestor_financeiro_app_token');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) headers.authorization = `Bearer ${token}`;
        if (viewMode) headers['x-view-mode'] = viewMode;
        fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'mei_obligations_list', data: {} }) })
            .then(async response => {
                if (!response.ok) throw new Error('mei_obligations_unavailable');
                return response.json();
            })
            .then(data => setObligations(Array.isArray(data.rows) ? data.rows : []))
            .catch(() => { setObligations([]); setObligationsError(true); })
            .finally(() => setObligationsLoading(false));
    }, [isOpen, viewMode]);

    const fiscal = useMemo(
        () => calculateMeiFiscal({ transactions, categories, year, openingDate: meiOpeningDate }),
        [transactions, categories, year, meiOpeningDate],
    );
    const limitStatus = {
        limit: fiscal.effectiveAnnualLimit,
        used: fiscal.annualRevenue,
        percentage: Math.min(100, fiscal.limitUsagePercent),
        remaining: fiscal.remainingLimit,
        isProportional: fiscal.effectiveAnnualLimit < 81000,
    };

    // DAS Management Logic: persisted obligations are authoritative; missing months remain unconfigured.
    const dasStatus = useMemo(() => Array.from({ length: 12 }, (_, i) => {
        const obligation = obligations.find(item => Number(item.reference_year) === year && Number(item.reference_month) === i + 1 && item.obligation_type === 'das_mei');
        const dueDate = obligation?.due_date ? new Date(`${obligation.due_date}T12:00:00`) : null;
        const today = new Date();
        const status = obligation?.status || 'not_configured';
        const computedStatus = status === 'paid' ? 'Pago' : status === 'cancelled' ? 'Cancelado' : status === 'scheduled' ? 'Agendado' : (dueDate && dueDate < today ? 'Atrasado' : status === 'pending' ? 'A Vencer' : 'Não configurado');
        return { month: i, dueDate: dueDate || new Date(year, i + 1, 20), isPaid: status === 'paid', amount: Number(obligation?.total_amount || 0), status: computedStatus, obligation };
    }), [obligations, year]);

    const handleQuickPay = async (month: number) => {
        const obligation = dasStatus.find(item => item.month === month)?.obligation;
        if (!obligation) { alert('Cadastre a obrigação DAS desta competência antes de registrar o pagamento.'); return; }
        if (!confirm(`Confirmar pagamento do DAS desta competência? Será lançado um débito de ${formatCurrency(Number(obligation.total_amount || 0))}.`)) return;
        
        const mainAccount = accounts[0];
        if (!mainAccount) {
            alert('Cadastre uma conta bancária primeiro.');
            return;
        }

        const paymentDate = new Date();
        const token = window.localStorage.getItem('gestor_financeiro_app_token');
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) headers.authorization = `Bearer ${token}`;
        if (viewMode) headers['x-view-mode'] = viewMode;
        const paymentResponse = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'mei_obligation_mark_paid', data: { id: obligation.id, accountId: mainAccount.id, paymentDate: paymentDate.toISOString().slice(0, 10), paymentMethod: 'Boleto' } }) });
        if (!paymentResponse.ok) { alert('Não foi possível registrar o pagamento da obrigação.'); return; }
    };

    const handleSchedulePay = async (month: number) => {
        const date = new Date(year, month, 20);
        const monthName = date.toLocaleString('pt-BR', { month: 'long' });
        
        try {
            const token = window.localStorage.getItem('gestor_financeiro_app_token');
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (token) headers['authorization'] = `Bearer ${token}`;
            if (viewMode) headers['x-view-mode'] = viewMode;

            const obligationResponse = await fetch('/api/query', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    type: 'mei_obligation_upsert',
                    data: {
                        referenceYear: year,
                        referenceMonth: month + 1,
                        dueDate: date.toISOString().slice(0, 10),
                        principalAmount: Number(dasStatus.find(item => item.month === month)?.amount || 0),
                        totalAmount: Number(dasStatus.find(item => item.month === month)?.amount || 0),
                        status: 'scheduled',
                        source: 'manual',
                        rulesVersion: 'phase2-estimate-v1',
                        notes: 'Agendado pelo Módulo MEI'
                    }
                })
            });
            if (!obligationResponse.ok) throw new Error('obligation_schedule_failed');
            alert('Agendado no Contas a Pagar com sucesso!');
        } catch (e) {
            alert('Erro ao agendar.');
        }
    };

    const monthlyData = useMemo(() => fiscal.monthlyRevenue.map((item, month) => ({
        month,
        commerce: item.commerce,
        industry: item.industry,
        service: item.service,
        others: item.unclassified,
        total: item.total,
    })), [fiscal]);

    const totals = useMemo(() => ({
        commerce: fiscal.revenueByActivity.commerce,
        industry: fiscal.revenueByActivity.industry,
        service: fiscal.revenueByActivity.service,
        others: fiscal.revenueByActivity.unclassified,
        total: fiscal.annualRevenue,
    }), [fiscal]);

    const irpfCalculations = useMemo(() => ({
        totalRevenue: fiscal.annualRevenue,
        exemptCommerce: fiscal.revenueByActivity.commerce * 0.08,
        exemptIndustry: fiscal.revenueByActivity.industry * 0.08,
        exemptService: fiscal.revenueByActivity.service * 0.32,
        totalExempt: fiscal.irpfExemptAmount,
        businessExpenses: fiscal.businessExpenses,
        taxes: 0,
        accountingProfit: fiscal.grossBusinessProfit,
        taxableProfit: fiscal.estimatedTaxableAmount,
    }), [fiscal]);

    const downloadCsv = () => {
        const headers = ['Mês', 'Comércio', 'Indústria', 'Serviços', 'Outros', 'Total'];
        const rows = monthlyData.map(d => [
            new Date(year, d.month, 1).toLocaleDateString('pt-BR', { month: 'long' }),
            formatCurrency(d.commerce),
            formatCurrency(d.industry),
            formatCurrency(d.service),
            formatCurrency((d as any).others || 0),
            formatCurrency(d.total)
        ]);
        
        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `relatorio_mei_${year}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const footerContent = (
        <div className="flex justify-end gap-3 w-full">
            {activeTab === 'dasn' && (
                <button 
                    onClick={downloadCsv}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <DownloadIcon className="h-4 w-4" />
                    Baixar CSV
                </button>
            )}
            <button 
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg text-sm font-medium transition-colors"
            >
                Fechar
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Relatórios MEI" size="lg" footer={footerContent}>
            <div className="flex flex-col h-[70vh]">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto">
                        <button 
                            onClick={() => setActiveTab('das')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'das' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            Obrigações (DAS)
                        </button>
                        <button 
                            onClick={() => setActiveTab('dasn')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'dasn' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            Relatório Mensal
                        </button>
                        <button 
                            onClick={() => setActiveTab('irpf')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'irpf' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            Calc. IRPF
                        </button>
                        <button 
                            onClick={() => setActiveTab('dre')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'dre' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                        >
                            DRE (Gerencial)
                        </button>
                    </div>
                    <label htmlFor="mei-report-year" className="sr-only">Ano do relatório MEI</label>
                    <select
                        id="mei-report-year"
                        name="mei-report-year"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm px-2 py-1"
                    >
                        <option value={currentYear}>{currentYear}</option>
                        <option value={currentYear - 1}>{currentYear - 1}</option>
                    </select>
                </div>

                <div className="flex-1 overflow-auto pr-2">
                    {activeTab === 'das' && (
                        <div className="space-y-4" aria-live="polite">
                            {obligationsLoading && <p className="text-sm text-slate-500">Carregando obrigações DAS…</p>}
                            {obligationsError && <p role="alert" className="text-sm text-red-600">Não foi possível carregar as obrigações DAS. Tente fechar e abrir o relatório novamente.</p>}
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg text-sm text-indigo-800 dark:text-indigo-200 mb-4 flex justify-between items-center gap-4 flex-wrap">
                                <div>
                                    <p className="font-semibold">Guia DAS-MEI (Mensal)</p>
                                    <p className="opacity-80">Acesse o portal do governo para gerar o boleto e marque como pago aqui.</p>
                                </div>
                                <div className="flex gap-2">
                                    <a 
                                        href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                        Portal PGMEI
                                    </a>
                                    <a 
                                        href="https://www.nfse.gov.br/EmissorNacional" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                        Emissor de NFS-e
                                    </a>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {dasStatus.map((item) => (
                                    <div key={item.month} className={`flex justify-between items-center p-3 rounded-lg border ${item.isPaid ? 'bg-green-50 border-green-100 dark:bg-green-900/10 dark:border-green-800' : item.status === 'Atrasado' ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800' : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 text-center">
                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">{new Date(year, item.month, 1).toLocaleDateString('pt-BR', { month: 'short' })}</div>
                                                <div className="text-lg font-bold text-gray-800 dark:text-white">{year}</div>
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">Vencimento: {item.dueDate.toLocaleDateString('pt-BR')}</div>
                                                <div className={`text-sm ${item.isPaid ? 'text-green-600' : item.status === 'Atrasado' ? 'text-red-600' : 'text-gray-500'}`}>
                                                    Status: {item.status}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{item.amount > 0 ? 'Valor informado' : 'Valor não informado'}</div>
                                                <div className="font-medium text-gray-800 dark:text-white">{formatCurrency(item.amount)}</div>
                                            </div>
                                            {item.isPaid ? (
                                                <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-sm font-medium">
                                                    Pago
                                                </span>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleSchedulePay(item.month)}
                                                        className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm transition-colors shadow-sm"
                                                    >
                                                        Agendar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleQuickPay(item.month)}
                                                        className="px-3 py-1.5 bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm transition-colors shadow-sm"
                                                    >
                                                        Pagar Agora
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'dasn' && (
                        <div className="space-y-4">
                            {/* Limit Monitor Widget */}
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                <div className="flex justify-between items-end mb-2">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Limite de Faturamento {limitStatus.isProportional ? '(Proporcional)' : 'Anual'}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Utilizado: {formatCurrency(limitStatus.used)} de {formatCurrency(limitStatus.limit)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-sm font-bold ${limitStatus.percentage > 80 ? 'text-red-600' : limitStatus.percentage > 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                                            {limitStatus.percentage.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                    <div 
                                        className={`h-2.5 rounded-full ${limitStatus.percentage > 80 ? 'bg-red-600' : limitStatus.percentage > 60 ? 'bg-yellow-400' : 'bg-green-600'}`} 
                                        style={{ width: `${limitStatus.percentage}%` }}
                                    ></div>
                                </div>
                                {limitStatus.remaining < 0 ? (
                                    <p className="mt-2 text-xs text-red-600 font-medium">Limite excedido em {formatCurrency(Math.abs(limitStatus.remaining))}. Consulte um contador para desenquadramento.</p>
                                ) : (
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Restante: {formatCurrency(limitStatus.remaining)}</p>
                                )}
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200 mb-4">
                                <p>Este relatório auxilia no preenchimento da Declaração Anual (DASN-SIMEI). Os valores são baseados nas categorias das transações.</p>
                                <p className="mt-1 font-semibold">Dica: Categorize suas receitas como 'Comércio', 'Indústria' ou 'Serviços' nas Configurações.</p>
                            </div>

                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold">
                                    <tr>
                                        <th className="p-2 rounded-tl-lg">Mês</th>
                                        <th className="p-2 text-right">Comércio</th>
                                        <th className="p-2 text-right">Indústria</th>
                                        <th className="p-2 text-right">Serviços</th>
                                        <th className="p-2 text-right">Outros</th>
                                        <th className="p-2 text-right rounded-tr-lg">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {monthlyData.map((row) => (
                                        <tr key={row.month} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="p-2 text-gray-800 dark:text-gray-200">
                                                {new Date(year, row.month, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                                            </td>
                                            <td className="p-2 text-right font-mono text-gray-600 dark:text-gray-400">{row.commerce > 0 ? formatCurrency(row.commerce) : '-'}</td>
                                            <td className="p-2 text-right font-mono text-gray-600 dark:text-gray-400">{row.industry > 0 ? formatCurrency(row.industry) : '-'}</td>
                                            <td className="p-2 text-right font-mono text-gray-600 dark:text-gray-400">{row.service > 0 ? formatCurrency(row.service) : '-'}</td>
                                            <td className="p-2 text-right font-mono text-gray-400 dark:text-gray-500">{(row as any).others > 0 ? formatCurrency((row as any).others) : '-'}</td>
                                            <td className="p-2 text-right font-bold text-gray-800 dark:text-white">{row.total > 0 ? formatCurrency(row.total) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-100 dark:bg-gray-800 font-bold text-gray-800 dark:text-white border-t-2 border-gray-200 dark:border-gray-600">
                                    <tr>
                                        <td className="p-2">TOTAL</td>
                                        <td className="p-2 text-right">{formatCurrency(totals.commerce)}</td>
                                        <td className="p-2 text-right">{formatCurrency(totals.industry)}</td>
                                        <td className="p-2 text-right">{formatCurrency(totals.service)}</td>
                                        <td className="p-2 text-right">{formatCurrency(totals.others)}</td>
                                        <td className="p-2 text-right">{formatCurrency(totals.total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {activeTab === 'irpf' && (
                        <div className="space-y-6">
                             <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                                <p>Cálculo estimativo de isenção de Imposto de Renda para MEI sem escrituração contábil (apenas Livro Caixa).</p>
                                <p className="mt-1 font-bold">Atenção: Consulte sempre um contador. Esta ferramenta fornece apenas uma estimativa.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">Receita Bruta Anual</h4>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">Comércio/Indústria (8% isento)</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(totals.commerce + totals.industry)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">Serviços (32% isento)</span>
                                        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(totals.service + totals.others)}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100 dark:border-gray-700">
                                        <span className="text-gray-800 dark:text-white">Total Faturamento</span>
                                        <span className="text-indigo-600 dark:text-indigo-400">{formatCurrency(irpfCalculations.totalRevenue)}</span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">Parcela Isenta do Lucro</h4>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">Isenção Comércio/Ind.</span>
                                        <span className="font-medium text-green-600">{formatCurrency(irpfCalculations.exemptCommerce + irpfCalculations.exemptIndustry)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">Isenção Serviços</span>
                                        <span className="font-medium text-green-600">{formatCurrency(irpfCalculations.exemptService)}</span>
                                    </div>
                                    <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg border border-green-100 dark:border-green-800 mt-2">
                                        <div className="flex justify-between text-base font-bold">
                                            <span className="text-green-800 dark:text-green-300">Total Isento (IRPF)</span>
                                            <span className="text-green-700 dark:text-green-400">{formatCurrency(irpfCalculations.totalExempt)}</span>
                                        </div>
                                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                            Valor que você pode transferir para sua pessoa física sem pagar imposto.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Resultado Operacional (Estimado)</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Faturamento</div>
                                        <div className="text-lg font-bold text-gray-800 dark:text-white mt-1">{formatCurrency(irpfCalculations.totalRevenue)}</div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Despesas Totais</div>
                                        <div className="text-lg font-bold text-red-600 mt-1">-{formatCurrency(irpfCalculations.businessExpenses + irpfCalculations.taxes)}</div>
                                        <p className="text-[10px] text-gray-400 mt-1">*Considere apenas despesas do negócio</p>
                                    </div>
                                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg text-center border border-indigo-100 dark:border-indigo-800">
                                        <div className="text-xs text-indigo-600 dark:text-indigo-300 uppercase tracking-wide">Lucro Contábil</div>
                                        <div className="text-lg font-bold text-indigo-700 dark:text-indigo-400 mt-1">
                                            {formatCurrency(irpfCalculations.accountingProfit)}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className={`mt-4 p-4 rounded-lg border ${irpfCalculations.taxableProfit > 30639.90 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Lucro Tributável (Sujeito a IRPF)</span>
                                        <span className={`text-lg font-bold ${irpfCalculations.taxableProfit > 30639.90 ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                                            {formatCurrency(irpfCalculations.taxableProfit)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Cálculo: (Lucro Contábil - Parcela Isenta). Se este valor for superior a R$ 30.639,90 (base 2024), você provavelmente precisa declarar Imposto de Renda Pessoa Física.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'dre' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">DRE Gerencial Simplificado ({year})</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-700">
                                        <span className="font-medium text-gray-700 dark:text-gray-300"> (+) Receita Bruta</span>
                                        <span className="font-bold text-green-600">{formatCurrency(irpfCalculations.totalRevenue)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 dark:text-gray-400 pl-4">Comércio</span>
                                        <span className="text-gray-600 dark:text-gray-300">{formatCurrency(totals.commerce)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 dark:text-gray-400 pl-4">Indústria</span>
                                        <span className="text-gray-600 dark:text-gray-300">{formatCurrency(totals.industry)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm pb-2 border-b border-gray-100 dark:border-gray-700">
                                        <span className="text-gray-500 dark:text-gray-400 pl-4">Serviços/Outros</span>
                                        <span className="text-gray-600 dark:text-gray-300">{formatCurrency(totals.service + totals.others)}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                        <span className="font-medium text-gray-700 dark:text-gray-300"> (-) Impostos (DAS)</span>
                                        <span className="font-bold text-red-500">-{formatCurrency(irpfCalculations.taxes)}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-2 bg-gray-50 dark:bg-gray-900/30 px-2 rounded font-semibold">
                                        <span className="text-gray-800 dark:text-gray-200"> (=) Receita Líquida</span>
                                        <span className="text-gray-900 dark:text-white">{formatCurrency(irpfCalculations.totalRevenue - irpfCalculations.taxes)}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                                        <span className="font-medium text-gray-700 dark:text-gray-300"> (-) Despesas Operacionais</span>
                                        <span className="font-bold text-red-500">-{formatCurrency(irpfCalculations.businessExpenses)}</span>
                                    </div>

                                    <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-gray-200 dark:border-gray-600">
                                        <span className="text-lg font-bold text-gray-900 dark:text-white"> (=) Lucro Líquido (Resultado)</span>
                                        <span className={`text-lg font-bold ${irpfCalculations.accountingProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(irpfCalculations.accountingProfit)}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 italic bg-yellow-50 dark:bg-yellow-900/10 p-2 rounded">
                                    * Este é um relatório gerencial para auxiliar na visão de lucratividade do seu negócio. O lucro líquido pode ser usado para fins pessoais (distribuição de lucros), respeitando as regras de isenção.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
