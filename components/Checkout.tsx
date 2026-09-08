import React, { useState } from 'react';
import { 
    XMarkIcon, 
    CheckCircleIcon, 
    CreditCardIcon, 
    QrCodeIcon,
    ShieldCheckIcon,
    ArrowLeftIcon,
    CalendarIcon,
    SparklesIcon
} from './icons';
import { useFinancialData } from '../context/FinancialDataContext';
import { useToast } from '../context/ToastContext';

interface CheckoutProps {
    isOpen: boolean;
    onClose: () => void;
    tier: string;
}

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        description: 'Ideal para quem está começando a organizar as finanças.',
        monthly: 30,
        annually: 25,
        features: [
            '2 Contas Bancárias',
            '1 Centro de Custo',
            '100 Lançamentos / mês',
            '100 MB de Armazenamento',
            'IA Consultoria Básica',
            'Suporte por E-mail'
        ]
    },
    {
        id: 'plus',
        name: 'Plus',
        description: 'Perfeito para famílias e pequenos investidores.',
        monthly: 79,
        annually: 67,
        features: [
            '10 Contas Bancárias',
            '5 Centros de Custo',
            '500 Lançamentos / mês',
            '1 GB de Armazenamento',
            'Investimentos (Módulo)',
            'IA Completa & Insights',
            'Relatórios de Performance',
            'Painel MEI Completo (se ativado)'
        ],
        popular: true
    },
    {
        id: 'pro',
        name: 'Pro',
        description: 'Controle total, multi-contas e inteligência avançada.',
        monthly: 149,
        annually: 126,
        features: [
            '100 Contas Bancárias',
            '50 Centros de Custo',
            '3.000 Lançamentos / mês',
            '10 GB de Armazenamento',
            'Investimentos (Módulo)',
            'Pró-labore Integrado',
            'Multiusuário (2 Assentos)',
            'Suporte por E-mail'
        ],
        premium: true
    }
];

const PixIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12 text-indigo-500 animate-pulse" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 12L12 22L20 12L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 6L8 12L12 18L16 12L12 6Z" fill="currentColor" opacity="0.3"/>
    </svg>
);

export const Checkout: React.FC<CheckoutProps> = ({ isOpen, onClose, tier: initialTier }) => {
    const { organizationInfo, refreshData } = useFinancialData();
    const { showToast } = useToast();
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('annually');
    const [method, setMethod] = useState<'card' | 'pix'>('pix');
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<'plans' | 'data' | 'success'>('plans');
    const [selectedTier, setSelectedTier] = useState(initialTier || 'starter');
    const [pixInfo, setPixInfo] = useState<{ encoded: string, payload: string } | null>(null);
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [cardData, setCardData] = useState({
        number: '',
        expiry: '',
        cvv: '',
        holderName: ''
    });

    if (!isOpen) return null;

    const getPrice = (t: string) => {
        const p = PLANS.find(pl => pl.id === t) || PLANS[0];
        return billingPeriod === 'monthly' ? p.monthly : (p.annually * 12);
    };

    const handleConfirm = async () => {
        if (!cpfCnpj) {
            showToast('Informe seu CPF ou CNPJ', 'error');
            return;
        }

        if (method === 'card' && (!cardData.number || !cardData.expiry || !cardData.cvv)) {
            showToast('Preencha os dados do cartão', 'error');
            return;
        }

        setIsProcessing(true);
        setInvoiceUrl(null);
        setPixInfo(null);
        
        try {
            const token = window.localStorage.getItem('gestor_financeiro_app_token') || '';
            const res = await fetch('/api/subscription/checkout', {
                method: 'POST',
                headers: { 
                    'content-type': 'application/json',
                    'authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    tier: selectedTier,
                    billingPeriod,
                    method,
                    cpfCnpj,
                    creditCard: method === 'card' ? cardData : null,
                    orgId: organizationInfo?.id
                })
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.invoiceUrl) setInvoiceUrl(data.invoiceUrl);
                throw new Error(data.description || data.error || 'Falha no processamento');
            }

            if (data.pix) {
                setPixInfo(data.pix);
                setIsProcessing(false);
                showToast('Pix gerado! Pague para ativar.', 'success');
            } else if (method === 'card') {
                setIsProcessing(false);
                setStep('success');
                showToast('Assinatura processada!', 'success');
                refreshData();
            } else if (method === 'pix') {
                setIsProcessing(false);
                setInvoiceUrl(data.invoiceUrl);
                showToast('Clique abaixo para concluir o pagamento.', 'info');
            }
        } catch (e: any) {
            setIsProcessing(false);
            showToast(e.message || 'Erro ao processar assinatura.', 'error');
        }
    };

    if (step === 'success') {
        return (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto space-y-8 animate-fade-in py-20">
                <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-950/40 rounded-full flex items-center justify-center text-indigo-600 animate-pulse">
                    <CheckCircleIcon className="h-12 w-12" />
                </div>
                <div className="text-center space-y-3 px-6">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight text-center uppercase italic">Assinatura Processada!</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px] text-center italic">
                        Após o pagamento, faça refresh da página (F5) ou saia e entre novamente no sistema para ativar seu novo plano.
                    </p>
                </div>
                <button onClick={onClose} className="px-10 py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-500/20">
                    Ir para Dashboard
                </button>
            </div>
        );
    }

    if (step === 'plans') {
        return (
            <div className="max-w-6xl mx-auto h-full flex flex-col pt-8 pb-12 animate-fade-in overflow-y-auto pr-2 items-center">
                <div className="flex flex-col items-center text-center space-y-6 mb-12 w-full px-4 mt-2">
                    <h2 className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase italic">
                        Escolha seu plano
                    </h2>

                    <div className="p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center gap-1 border border-slate-200 dark:border-slate-800 shadow-xl">
                        <button 
                            onClick={() => setBillingPeriod('monthly')} 
                            className={`px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${billingPeriod === 'monthly' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-xl' : 'text-slate-400'}`}
                        >
                            Mensal
                        </button>
                        <button 
                            onClick={() => setBillingPeriod('annually')} 
                            className={`px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${billingPeriod === 'annually' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'text-slate-400'}`}
                        >
                            Anual <span className="px-1.5 py-0.5 bg-emerald-500 text-white rounded text-[8px] font-black uppercase tracking-tighter">-15% OFF</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full px-4 mb-20 max-w-6xl items-stretch">
                    {PLANS.map((p) => (
                        <div 
                            key={p.id} 
                            className={`p-10 rounded-[32px] border-2 transition-all relative flex flex-col items-start text-left bg-white dark:bg-slate-900 group ${p.popular ? 'border-indigo-600/50 shadow-2xl shadow-indigo-500/10' : 'border-slate-100 dark:border-slate-800'}`}
                        >
                            {p.popular && (
                                <div className="absolute -top-4 right-8 px-4 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-indigo-500/30">
                                    Popular
                                </div>
                            )}
                            
                            <div className="mb-8 w-full">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">{p.name}</h3>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase">R$</span>
                                    <span className="text-4xl font-black text-slate-900 dark:text-white">{billingPeriod === 'monthly' ? p.monthly : p.annually}</span>
                                    <span className="text-slate-500 font-bold text-[9px] uppercase tracking-widest ml-1">/ Mês</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-10 flex-1 w-full">
                                {p.features.map((f, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-[0.02em] italic">
                                        <CheckCircleIcon className="h-4 w-4 text-indigo-500" />
                                        {f}
                                    </div>
                                ))}
                            </div>

                            <button 
                                onClick={() => { setSelectedTier(p.id); setStep('data'); }}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all transform hover:-translate-y-1 active:scale-95 ${p.popular ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white hover:bg-slate-200'}`}
                            >
                                Selecionar Plano
                            </button>
                        </div>
                    ))}
                </div>

                <div className="w-full max-w-2xl text-center py-12 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase italic tracking-[0.2em] leading-loose opacity-60">
                        "Focada em gestão financeira pura. Sem burocracia, apenas o controle real do seu dinheiro."
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col pt-4 pb-20 animate-fade-in overflow-y-auto pr-2">
            <button onClick={() => setStep('plans')} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-8 group w-fit">
                <ArrowLeftIcon className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Escolher Outro Plano</span>
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-2">
                <div className="lg:col-span-4 flex flex-col space-y-6">
                    <div className="p-6 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
                        <div className="space-y-4">
                            <button onClick={() => setMethod('pix')} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${method === 'pix' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'}`}>
                                <div className="flex items-center gap-4">
                                    <QrCodeIcon className={`h-6 w-6 ${method === 'pix' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    <div className="text-left">
                                        <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">Pagar via Pix</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Ativação instantânea</p>
                                    </div>
                                </div>
                                {method === 'pix' && <CheckCircleIcon className="h-6 w-6 text-indigo-600" />}
                            </button>
                            <button onClick={() => setMethod('card')} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${method === 'card' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'}`}>
                                <div className="flex items-center gap-4">
                                    <CreditCardIcon className={`h-6 w-6 ${method === 'card' ? 'text-indigo-600' : 'text-slate-400'}`} />
                                    <div className="text-left">
                                        <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">Cartão de Crédito</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Automático mensal</p>
                                    </div>
                                </div>
                                {method === 'card' && <CheckCircleIcon className="h-6 w-6 text-indigo-600" />}
                            </button>
                        </div>
                        <div className="space-y-2 pt-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF ou CNPJ para Nota Fiscal</label>
                             <input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition-all" />
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-8 flex flex-col space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col flex-1">
                        <div className="p-8 md:p-12 flex-1 flex flex-col">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 flex-1">
                                <div className="space-y-8">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] italic">Você selecionou</p>
                                        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">{PLANS.find(p => p.id === selectedTier)?.name}</h3>
                                        
                                        <div className="pt-6 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1 px-2 border border-slate-200 dark:border-slate-800 rounded-lg text-[8px] font-black uppercase text-slate-400">Plano {billingPeriod === 'monthly' ? 'Mensal' : 'Anual'}</div>
                                            </div>
                                            <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                                <CheckCircleIcon className="h-4 w-4 text-indigo-600" />
                                                O que está incluído
                                            </h4>
                                            <div className="space-y-2.5 pl-6">
                                                {PLANS.find(p => p.id === selectedTier)?.features.map((f, i) => (
                                                    <div key={i} className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight italic">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                                                        {f}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-10 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-slate-500 font-black text-[9px] uppercase tracking-[0.2em]">Total Hoje</span>
                                            <span className="text-4xl font-black text-slate-900 dark:text-white italic tracking-tighter">R$ {getPrice(selectedTier)},00</span>
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">Cobrança única via {method === 'pix' ? 'Pix' : 'Cartão'}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col justify-center border-l border-slate-100 dark:border-slate-800 md:pl-12">
                                    {method === 'pix' ? (
                                        <div className="w-full space-y-8 animate-fade-in flex flex-col items-center">
                                            {pixInfo ? (
                                                <>
                                                    <div className="w-48 h-48 bg-white p-2 rounded-2xl border border-slate-200 shadow-lg">
                                                        <img src={`data:image/png;base64,${pixInfo.encoded}`} alt="Pix QR Code" className="w-full h-full" />
                                                    </div>
                                                    <button onClick={() => { navigator.clipboard.writeText(pixInfo.payload); showToast('Código Pix copiado!', 'success'); }} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">Copiar Código Copia-e-Cola</button>
                                                </>
                                            ) : invoiceUrl ? (
                                                <div className="w-full flex flex-col items-center justify-center space-y-6 text-center py-8">
                                                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
                                                        <PixIcon />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase italic tracking-tight">Cobrança Gerada!</h4>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                                                            Para sua segurança, a página de pagamento seguro do Asaas foi criada. <br/>Clique no botão abaixo para abrir.
                                                        </p>
                                                    </div>
                                                    <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-3">
                                                        <SparklesIcon className="h-4 w-4" />
                                                        Abrir página de pagamento PIX
                                                    </a>
                                                    <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200/30 rounded-xl">
                                                        <p className="text-[8px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-widest leading-relaxed">
                                                            IMPORTANTE: Após concluir o pagamento, faça refresh da página (F5) ou saia e entre novamente no sistema para que seu novo plano seja ativado corretamente.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 opacity-50 flex flex-col items-center">
                                                    <PixIcon />
                                                    <p className="text-[10px] font-black mt-4 uppercase tracking-[0.2em] text-slate-400">Pronto para gerar o Pix</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                         <div className="space-y-4 animate-fade-in">
                                             <div className="space-y-1">
                                                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Número do Cartão</label>
                                                 <input value={cardData.number} onChange={e => setCardData({...cardData, number: e.target.value})} placeholder="0000 0000 0000 0000" className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-black tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white" />
                                             </div>
                                             <div className="grid grid-cols-2 gap-3">
                                                 <div className="space-y-1">
                                                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Mês/Ano</label>
                                                     <input value={cardData.expiry} onChange={e => setCardData({...cardData, expiry: e.target.value})} placeholder="MM/YY" className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white" />
                                                 </div>
                                                 <div className="space-y-1">
                                                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">CVC</label>
                                                     <input value={cardData.cvv} onChange={e => setCardData({...cardData, cvv: e.target.value})} placeholder="123" maxLength={3} className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white" />
                                                 </div>
                                             </div>
                                             <div className="space-y-1">
                                                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Nome Completo</label>
                                                 <input value={cardData.holderName} onChange={e => setCardData({...cardData, holderName: e.target.value})} placeholder="NOME COMO NO CARTÃO" className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white uppercase" />
                                             </div>
                                         </div>
                                    )}
                                </div>
                            </div>

                            <button onClick={handleConfirm} disabled={isProcessing || (method === 'pix' && !!invoiceUrl)} className="w-full h-16 bg-slate-900 dark:bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-500/10 disabled:opacity-50 mt-12 flex items-center justify-center gap-3">
                                {isProcessing ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : (method === 'pix' ? (invoiceUrl ? 'FATURA GERADA' : 'CONFIRMAR E GERAR PIX') : 'CONCLUIR ASSINATURA')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
