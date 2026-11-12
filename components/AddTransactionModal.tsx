
import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { useAuth } from '../context/AuthContext';
import { getCreditCardCycle } from '../utils/creditCard';
import { TransactionType } from '../types';
import type { Transaction } from '../types';
import { Modal } from './shared/Modal';
import { suggestCategoryAndType, parseTransactionFromText } from '../services/marketDataService';
import { recordCategoryPreference, recordAccountPreference, recordPaymentPreference } from '../services/marketDataService';
import { toIsoLocalDate, formatInputMoney, formatCurrencyForInput, parseCurrencyInput } from '../utils/formatters';
import { SparklesIcon, PlusIcon } from './icons';
import { DEFAULT_CATEGORY_EMOJIS } from './SettingsModal';
import { useToast } from '../context/ToastContext';
import { FormField } from './ui/Forms/FormField';
import { Input } from './ui/Forms/Input';
import { Select } from './ui/Forms/Select';
import { VoiceRecordButton } from './ui/VoiceRecordButton';
import { createTransactionSubmission, hasPotentialTransactionDuplicate } from '../utils/transactionSubmission';

interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddAccount: () => void;
    aiInfo?: { provider?: string; model?: string } | null;
     initial?: {
         transactionType?: TransactionType;
         accountId?: string;
         toAccountId?: string;
         amount?: number;
         description?: string;
         category?: string;
         paymentMethod?: string;
         date?: string; // YYYY-MM-DD
         costCenterId?: string;
         inferredCostCenter?: boolean;
         inferredCostCenterReason?: string;
         inferredCategory?: boolean;
         inferredPayment?: boolean;
         inferredAccount?: boolean;
         inferredCategoryReason?: string;
         inferredPaymentReason?: string;
         inferredAccountReason?: string;
     };
}

const paymentMethodSuggestions = ['Boleto','PIX', 'Saldo Conta', 'Saldo Conta Investimentos', 'Saldo Corretora', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Transferência Bancária', 'Débito Automático'];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, onAddAccount, aiInfo, initial }) => {
    const { accounts, addTransaction, categories, transactions, costCenters, addCategory, addAccount, addCostCenter, isMei, viewMode, organizationInfo, refreshData } = useFinancialData();
    const { getToken, user } = useAuth();
    const { showToast } = useToast();
    const [transactionType, setTransactionType] = useState<TransactionType>(TransactionType.EXPENSE);
    const [accountId, setAccountId] = useState<string>('');
    const [toAccountId, setToAccountId] = useState<string>('');
    const [amount, setAmount] = useState<string>('0,00');
    const [description, setDescription] = useState<string>('');
    const [category, setCategory] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<string>('');
    const [date, setDate] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`);
    const [costCenterId, setCostCenterId] = useState<string>('');
    const [isBusinessRevenue, setIsBusinessRevenue] = useState<boolean>(false);
    const [isBusinessExpense, setIsBusinessExpense] = useState<boolean>(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
    const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
    const [isNewCostCenterOpen, setIsNewCostCenterOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryType, setNewCategoryType] = useState<'Entrada'|'Saída'>(TransactionType.INCOME);
    const [newCategoryIcon, setNewCategoryIcon] = useState('');
    const [emojiFilter, setEmojiFilter] = useState('');
    const [newAccountName, setNewAccountName] = useState('');
    const [newAccountBank, setNewAccountBank] = useState('');
    const [newAccountInitialBalance, setNewAccountInitialBalance] = useState('0');
    const [newCostCenterName, setNewCostCenterName] = useState('');
    const [isDupConfirmOpen, setIsDupConfirmOpen] = useState(false);
    const pendingSubmission = React.useRef<ReturnType<typeof createTransactionSubmission> | null>(null);
    const submitting = React.useRef(false);
    const [loading, setLoading] = useState(false);
    const [submissionLocked, setSubmissionLocked] = useState(false);
    const [submissionMessage, setSubmissionMessage] = useState('');
    const [retryBlocked, setRetryBlocked] = useState(false);
    const scopeKey = JSON.stringify([user?.id, viewMode, organizationInfo?.id]);
    const currentScope = React.useRef({ key: scopeKey, isOpen });
    currentScope.current = { key: scopeKey, isOpen };
    useEffect(() => {
        currentScope.current.isOpen = isOpen;
        return () => { currentScope.current.isOpen = false; };
    }, [isOpen]);
    
    // Recurrence State
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<'monthly' | 'weekly'>('monthly');
    const [recurrenceCount, setRecurrenceCount] = useState<number>(1);

    // Credit Card Cycle State
    const [cardClosingDay, setCardClosingDay] = useState<number>(25);
    const [cardDueDay, setCardDueDay] = useState<number>(5);
    
    const availableCategories = categories.filter(c => c.type === transactionType || transactionType === TransactionType.TRANSFER);

    React.useEffect(() => {
        if (!isOpen) return;
        if (transactionType === TransactionType.TRANSFER) {
            setCategory('Transferência');
            return;
        }
        const hasCurrent = availableCategories.some(c => c.name === category);
        if (!hasCurrent) {
            const next = availableCategories[0]?.name || '';
            setCategory(next);
        }
    }, [isOpen, transactionType, categories]);

    useEffect(() => {
        if (isOpen) {
            setIsBusinessRevenue(false);
            setIsBusinessExpense(false);
            if (initial) {
                if (typeof initial.transactionType !== 'undefined') setTransactionType(initial.transactionType);
                if (typeof initial.accountId !== 'undefined') setAccountId(initial.accountId);
                if (typeof initial.toAccountId !== 'undefined') setToAccountId(initial.toAccountId);
                if (typeof initial.amount !== 'undefined') setAmount(formatCurrencyForInput(initial.amount));
                if (typeof initial.description !== 'undefined') setDescription(initial.description || '');
                if (typeof initial.category !== 'undefined') setCategory(initial.category || '');
                if (typeof initial.paymentMethod !== 'undefined') setPaymentMethod(initial.paymentMethod || '');
                if (typeof initial.date !== 'undefined') {
                    setDate(initial.date || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`);
                }
                if (typeof initial.costCenterId !== 'undefined') setCostCenterId(initial.costCenterId || '');
            }
            if (accounts.length > 0 && !accountId) {
                setAccountId(accounts[0].id);
            }
            if (costCenters.length > 0 && !costCenterId) {
                setCostCenterId(costCenters[0].id);
            }
            if (transactionType === TransactionType.TRANSFER) {
                 setCategory('Transferência');
            } else if (!initial?.category && availableCategories.length > 0) {
                setCategory(availableCategories[0].name);
            }
            if (transactionType === TransactionType.EXPENSE && !paymentMethod) {
                setPaymentMethod('Boleto');
            }
        }
    }, [isOpen, transactionType, accounts, categories, initial]);
    
    const handleSmartFill = async () => {
        if (!description || description.length < 3) {
            showToast("Digite uma descrição para usar o preenchimento inteligente.", "error");
            return;
        }
        setIsSuggesting(true);
        const allCategoryNames = categories.map(c => c.name);
        const suggestion = await suggestCategoryAndType(description, allCategoryNames);
        
        if (suggestion) {
            if (suggestion.type === 'Entrada') setTransactionType(TransactionType.INCOME);
            if (suggestion.type === 'Saída') setTransactionType(TransactionType.EXPENSE);
            
            if (suggestion.category) {
                const exists = categories.some(c => c.name.toLowerCase() === suggestion.category.toLowerCase());
                if (!exists && suggestion.type) {
                    try {
                        await addCategory({ name: suggestion.category, type: suggestion.type, icon: '' });
                    } catch {}
                }
                setCategory(suggestion.category);
                showToast(`Categoria definida como: ${suggestion.category}`, exists ? "success" : "info");
            }
        } else {
             showToast("Não consegui sugerir uma categoria.", "error");
        }
        setIsSuggesting(false);
    };

    const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);

    const handleVoiceTransaction = async (speechText: string) => {
        if (!speechText || speechText.trim().length < 2) return;
        setIsVoiceProcessing(true);
        try {
            const categoryNames = categories.map(c => c.name);
            const accountList = accounts.map(a => ({ id: a.id, name: a.name }));
            const costCenterList = costCenters.map(c => ({ id: c.id, name: c.name }));

            const payload = {
                kind: 'transaction',
                context: {
                    text: speechText,
                    today: new Date().toISOString().split('T')[0],
                    categories: categoryNames,
                    accounts: accountList,
                    costCenters: costCenterList
                }
            };

            const res = await fetch('/api/ai/advice', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });

            let tx: any = null;
            if (res.ok) {
                const data = await res.json();
                tx = data?.transaction;
            }

            // Fallback para parser léxico local se a IA não responder
            if (!tx) {
                const local = await parseTransactionFromText(speechText, categoryNames, accountList);
                if (local) {
                    tx = {
                        type: local.type,
                        amount: local.amount,
                        description: local.description,
                        date: local.date,
                        accountId: local.accountId,
                        paymentMethod: local.paymentMethod,
                        category: local.category
                    };
                }
            }

            if (tx) {
                if (tx.type === 'Entrada') setTransactionType(TransactionType.INCOME);
                else if (tx.type === 'Saída') setTransactionType(TransactionType.EXPENSE);
                else if (tx.type === 'Transferência') {
                    setTransactionType(TransactionType.TRANSFER);
                    if (tx.toAccountId) setToAccountId(tx.toAccountId);
                }

                if (tx.amount) setAmount(formatCurrencyForInput(tx.amount));
                if (tx.description) setDescription(tx.description);
                if (tx.date) setDate(tx.date);
                if (tx.accountId) setAccountId(tx.accountId);
                if (tx.paymentMethod) setPaymentMethod(tx.paymentMethod);
                if (tx.costCenterId) setCostCenterId(tx.costCenterId);
                if (tx.installments && tx.installments > 1) {
                    setIsRecurring(true);
                    setRecurrenceCount(tx.installments);
                }

                if (tx.category) {
                    const exists = categories.some(c => c.name.toLowerCase() === tx.category.toLowerCase());
                    if (!exists && tx.category !== 'Outros' && tx.category !== 'Transferência') {
                        try {
                            await addCategory({
                                name: tx.category,
                                type: tx.type === 'Entrada' ? 'Entrada' : 'Saída',
                                icon: ''
                            });
                        } catch {}
                    }
                    setCategory(tx.category);
                }

                showToast("Lançamento preenchido por voz com sucesso!", "success");
                return;
            }
            showToast("Não foi possível extrair os dados da fala. Tente novamente.", "error");
        } catch (err) {
            console.error("Voice parse error:", err);
            // Fallback de emergência local
            try {
                const categoryNames = categories.map(c => c.name);
                const accountList = accounts.map(a => ({ id: a.id, name: a.name }));
                const local = await parseTransactionFromText(speechText, categoryNames, accountList);
                if (local) {
                    if (local.type === 'Entrada') setTransactionType(TransactionType.INCOME);
                    else setTransactionType(TransactionType.EXPENSE);
                    if (local.amount) setAmount(formatCurrencyForInput(local.amount));
                    if (local.description) setDescription(local.description);
                    if (local.date) setDate(local.date);
                    if (local.accountId) setAccountId(local.accountId);
                    if (local.category) setCategory(local.category);
                    showToast("Lançamento preenchido por voz!", "success");
                    return;
                }
            } catch {}
            showToast("Erro ao processar áudio com IA.", "error");
            console.error("Voice parse error:", err);
            showToast("Erro ao processar áudio com IA.", "error");
        } finally {
            setIsVoiceProcessing(false);
        }
    };

    const clearSubmission = () => {
        pendingSubmission.current = null;
        setSubmissionLocked(false);
        setSubmissionMessage('');
        setRetryBlocked(false);
        setIsDupConfirmOpen(false);
    };

    const handleClose = () => {
        if (submitting.current) return;
        if (submissionMessage && !window.confirm('O lote não é atômico. Itens confirmados não serão desfeitos. Fechar descarta os identificadores de retry; confira os registros antes de recadastrar. Deseja fechar?')) return;
        clearSubmission();
        onClose();
    };

    const cancelDuplicate = () => {
        if (submitting.current) return;
        clearSubmission();
    };

    // Both normal submission and duplicate confirmation execute the SAME frozen plan.
    const executeSubmission = async (confirmDuplicate = false) => {
        if (submitting.current || !pendingSubmission.current) return;
        submitting.current = true;
        setLoading(true);
        try {
            const result = await pendingSubmission.current.submit(confirmDuplicate);
            if (result.status === 'duplicate_confirmation') {
                setIsDupConfirmOpen(true);
                return;
            }
            setIsDupConfirmOpen(false);
            if (result.status !== 'success') {
                const message = `${result.confirmed}/${result.total} itens confirmados. ${result.message} O lote não é atômico; itens confirmados não serão repetidos neste modal.`;
                setSubmissionMessage(message);
                setRetryBlocked(result.retryBlocked);
                showToast(message, 'error');
                return;
            }
            try {
                recordCategoryPreference(description, category);
                recordAccountPreference(description, accountId);
                recordPaymentPreference(description, paymentMethod);
            } catch {}
            refreshData();
            showToast(`${result.total} registro(s) confirmado(s). Compras no cartão ficam como obrigações, sem débito bancário.`, 'success');
            clearSubmission();
            setAmount('0,00');
            setDescription('');
            setPaymentMethod('');
            setIsRecurring(false);
            setRecurrenceCount(1);
            onClose();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao cadastrar lançamento.';
            setSubmissionMessage(message);
            showToast(message, 'error');
        } finally {
            submitting.current = false;
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting.current || retryBlocked || isDupConfirmOpen) return;
        if (!pendingSubmission.current) {
            const transactionData: Omit<Transaction, 'id'> = {
                accountId, transactionType, amount: parseCurrencyInput(amount), description,
                category, paymentMethod: paymentMethod || 'Boleto', date: toIsoLocalDate(date), costCenterId,
                isBusinessRevenue: transactionType === TransactionType.INCOME && isBusinessRevenue,
                isBusinessExpense: transactionType === TransactionType.EXPENSE && isBusinessExpense,
                ...(transactionType === TransactionType.TRANSFER && { toAccountId })
            };
            try {
                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                pendingSubmission.current = createTransactionSubmission({
                    transaction: transactionData, purchaseDate: date, today,
                    count: isRecurring && transactionType !== TransactionType.TRANSFER ? recurrenceCount : 1,
                    frequency: recurrenceFrequency, closingDay: cardClosingDay, dueDay: cardDueDay, viewMode,
                }, {
                    duplicate: hasPotentialTransactionDuplicate(transactionData, transactions),
                    isCurrent: () => currentScope.current.isOpen && currentScope.current.key === scopeKey,
                    getToken,
                    addTransaction: async tx => {
                        if (tx.transactionType !== TransactionType.TRANSFER && !categories.some(c => c.name.toLowerCase() === tx.category.toLowerCase())) {
                            await addCategory({ name: tx.category, type: tx.transactionType === TransactionType.INCOME ? 'Entrada' : 'Saída', icon: '' });
                        }
                        if (!currentScope.current.isOpen || currentScope.current.key !== scopeKey) {
                            throw new Error('Escopo alterado antes de registrar o movimento.');
                        }
                        await addTransaction(tx);
                    },
                });
                setSubmissionLocked(true);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Dados inválidos.', 'error');
                return;
            }
        }
        await executeSubmission();
    };

    const handleConfirmDup = () => executeSubmission(true);

    const footer = (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            {accounts.length === 0 && (
                <div className="text-center sm:text-left text-yellow-500 text-xs sm:text-sm">
                    Necessário conta.
                    <button type="button" onClick={onAddAccount} className="ml-1 text-indigo-500 hover:underline">Cadastrar</button>    
                </div>
            )}
            <div className="flex justify-end gap-3 ml-auto border-slate-100 dark:border-slate-800 pt-1">
                <button type="button" onClick={handleClose} disabled={loading} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
                <button type="submit" form="add-transaction-form" className="px-8 py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-[#0D9488]/25 dark:shadow-none disabled:opacity-50 flex items-center gap-2" disabled={accounts.length === 0 || loading || retryBlocked || isDupConfirmOpen}>
                    {loading && <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {submissionMessage ? 'Retomar cadastro' : isRecurring ? 'Lançar Recorrência' : 'Lançar'}
                </button>
            </div>
        </div>
    );

    return (
        <>
        <Modal isOpen={isOpen} onClose={handleClose} title="Novo Lançamento" size="lg" footer={footer}>
            {aiInfo?.provider && aiInfo?.model && (
                <div className="mb-2 text-right text-[11px] text-gray-500 dark:text-gray-400">
                    {aiInfo.provider === 'vertex_ai' ? 'Vertex AI' : aiInfo.provider} • {aiInfo.model}
                </div>
            )}
            
            {submissionMessage && <p role="alert" className="mb-3 text-sm text-amber-700 dark:text-amber-300">{submissionMessage} O retry não é preservado após recarregar a página.</p>}
            <form id="add-transaction-form" onSubmit={handleSubmit} className="p-2">
                <fieldset disabled={loading || submissionLocked} className="space-y-6 min-w-0">
                
                {/* Lançamento por Voz com IA */}
                <div className="flex items-center justify-between bg-teal-500/5 dark:bg-teal-500/10 p-3 rounded-xl border border-teal-500/20">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                            <SparklesIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            Preenchimento Rápido por Voz
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Fale o lançamento (ex: "Almoço 45 reais no cartão de débito hoje")
                        </span>
                    </div>
                    <VoiceRecordButton
                        onSpeechResult={handleVoiceTransaction}
                        isProcessing={isVoiceProcessing}
                        label="Ditar Lançamento"
                        size="sm"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Natureza da Transação</label>
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        {Object.values(TransactionType).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTransactionType(t)}
                                className={`flex-1 px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${
                                    transactionType === t && t === TransactionType.EXPENSE ? 'bg-rose-500 text-white shadow-md' :
                                    transactionType === t && t === TransactionType.INCOME ? 'bg-emerald-500 text-white shadow-md' :
                                    transactionType === t && t === TransactionType.TRANSFER ? 'bg-amber-500 text-white shadow-md' :
                                    'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField label="Descrição da Transação">
                        <div className="relative">
                            <Input 
                                type="text" 
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)} 
                                required 
                                placeholder="Ex: Conta de Luz, Mercado..."
                            />
                            <button
                                type="button"
                                onClick={handleSmartFill}
                                disabled={isSuggesting || !description}
                                className="absolute inset-y-0 right-0 px-4 flex items-center text-[#0D9488] hover:text-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Preenchimento Mágico com IA"
                            >
                                {isSuggesting ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : <SparklesIcon className="h-5 w-5" />}
                            </button>
                        </div>
                    </FormField>
                    
                    <FormField label="Valor Financeiro (R$)">
                        <Input type="text" value={amount} onChange={(e) => setAmount(formatInputMoney(e.target.value))} required placeholder="0,00" />
                    </FormField>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField label="Data do Lançamento">
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                    </FormField>
                    <FormField 
                        label={<>Categoria {initial?.inferredCategory && (<span title={initial?.inferredCategoryReason || ''} className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/15 dark:text-[#0D9488] font-bold uppercase">IA Sugeriu</span>)}</>}
                    >
                        <div className="flex gap-2">
                            <Select
                                value={category}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '__new_category__') {
                                        setNewCategoryType(transactionType === TransactionType.INCOME ? 'Entrada' : 'Saída');
                                        setIsNewCategoryOpen(true);
                                        return;
                                    }
                                    setCategory(v);
                                }}
                                disabled={transactionType === TransactionType.TRANSFER}
                            >
                               {transactionType === TransactionType.TRANSFER 
                                    ? <option>Transferência</option>
                                    : (
                                        <>
                                            <option value="__new_category__">+ Nova categoria...</option>
                                            {availableCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </>
                                    )}
                            </Select>
                            {transactionType !== TransactionType.TRANSFER && (
                                <button type="button" onClick={() => { setNewCategoryType(transactionType === TransactionType.INCOME ? 'Entrada' : 'Saída'); setIsNewCategoryOpen(true); }} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors" title="Nova Categoria">
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                            )}
                        </div>
                    </FormField>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField 
                        label={<>Conta {transactionType === TransactionType.TRANSFER ? 'de Origem' : ''} {initial?.inferredAccount && (<span title={initial?.inferredAccountReason || ''} className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/15 dark:text-[#0D9488] font-bold uppercase">IA Sugeriu</span>)}</>}
                    >
                        <div className="flex gap-2">
                            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                               {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </Select>
                            <button type="button" onClick={() => setIsNewAccountOpen(true)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors" title="Nova Conta">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </FormField>

                    {transactionType === TransactionType.TRANSFER ? (
                        <FormField label="Conta de Destino">
                            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                                 <option value="">Selecione...</option>
                               {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </Select>
                        </FormField>
                    ) : (
                        <FormField label={<>Método de Pagamento {initial?.inferredPayment && (<span title={initial?.inferredPaymentReason || ''} className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/15 dark:text-[#0D9488] font-bold uppercase">IA Sugeriu</span>)}</>}>
                            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required>
                                <option value="">Selecione...</option>
                                {paymentMethodSuggestions.map(p => (<option key={p} value={p}>{p}</option>))}
                            </Select>
                        </FormField>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField 
                        label={<>Centro de Custo {initial?.inferredCostCenter && (<span title={initial?.inferredCostCenterReason || ''} className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/15 dark:text-[#0D9488] font-bold uppercase">IA Sugeriu</span>)}</>}
                    >
                        <div className="flex gap-2">
                            <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                               {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            <button type="button" onClick={() => setIsNewCostCenterOpen(true)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors" title="Novo Centro">
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </FormField>

                    {isMei && transactionType === TransactionType.INCOME ? (
                        <div className="flex items-center gap-3 pt-6">
                            <input
                                type="checkbox"
                                id="isBusinessRevenue"
                                checked={isBusinessRevenue}
                                onChange={(e) => setIsBusinessRevenue(e.target.checked)}
                                className="h-5 w-5 text-[#0D9488] bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded transition-colors focus:ring-[#0D9488]/20"
                            />
                            <label htmlFor="isBusinessRevenue" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                Receita empresarial (compõe faturamento MEI)
                            </label>
                        </div>
                    ) : isMei && transactionType === TransactionType.EXPENSE ? (
                        <div className="flex items-center gap-3 pt-6">
                            <input
                                type="checkbox"
                                id="isBusinessExpense"
                                checked={isBusinessExpense}
                                onChange={(e) => setIsBusinessExpense(e.target.checked)}
                                className="h-5 w-5 text-[#0D9488] bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded transition-colors focus:ring-[#0D9488]/20"
                            />
                            <label htmlFor="isBusinessExpense" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                Despesa empresarial (considerar no resultado MEI)
                            </label>
                        </div>
                    ) : <div />}
                </div>

                {/* Credit Card Cycle Section */}
                {paymentMethod === 'Cartão de Crédito' && transactionType === TransactionType.EXPENSE && (
                    <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/60 flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-xs font-black text-teal-800 dark:text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
                                💳 Ciclo da Fatura do Cartão (Competência & Caixa)
                            </span>
                            {(() => {
                                try {
                                    const cycle = getCreditCardCycle(date, { id: accountId || 'card', closingDay: cardClosingDay, dueDay: cardDueDay });
                                    return (
                                        <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">
                                            Fatura fecha: <strong>{cycle.closesOn}</strong> • Vence: <strong>{cycle.dueOn}</strong>
                                        </span>
                                    );
                                } catch {
                                    return null;
                                }
                            })()}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Dia de Fechamento da Fatura">
                                <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={cardClosingDay}
                                    onChange={(e) => setCardClosingDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                                />
                            </FormField>
                            <FormField label="Dia de Vencimento da Fatura">
                                <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={cardDueDay}
                                    onChange={(e) => setCardDueDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                                />
                            </FormField>
                        </div>
                        <p className="text-[10px] text-teal-600/90 dark:text-teal-400/80 font-medium">
                            A compra será cadastrada como obrigação com data de origem {date}, mesmo se já vencida. Nenhum débito bancário será lançado aqui; registre o pagamento separadamente. Não há conciliação automática de fatura neste cadastro.
                        </p>
                    </div>
                )}

                {/* Recurrence Section */}
                {transactionType !== TransactionType.TRANSFER && (
                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isRecurring ? 'bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/15' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">Configurar Recorrência</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Repetir automaticamente este lançamento</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsRecurring(!isRecurring)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-[#0D9488] ${isRecurring ? 'bg-[#0D9488]' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        {isRecurring && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-1 duration-200">
                                <FormField label="Frequência">
                                    <Select value={paymentMethod === 'Cartão de Crédito' ? 'monthly' : recurrenceFrequency} disabled={paymentMethod === 'Cartão de Crédito'} onChange={(e) => setRecurrenceFrequency(e.target.value as any)}>
                                        <option value="monthly">Mensal (Fixo)</option>
                                        <option value="weekly">Semanal</option>
                                    </Select>
                                </FormField>
                                <FormField label="Quantidade de Repetições">
                                    <div className="flex items-center gap-3">
                                        <Input 
                                            type="number" 
                                            min={2} 
                                            max={60} 
                                            value={recurrenceCount} 
                                            onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 2)} 
                                        />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Meses/Semanas</span>
                                    </div>
                                </FormField>
                            </div>
                        )}
                    </div>
                )}
                </fieldset>
            </form>
        </Modal>
        <Modal isOpen={isDupConfirmOpen} onClose={cancelDuplicate} title="Possível duplicidade" size="sm">
            <div className="text-sm text-gray-800 dark:text-gray-100">
                Possível duplicidade detectada para este lançamento. Deseja salvar mesmo assim?
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={cancelDuplicate} disabled={loading} className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white">Cancelar</button>
                <button type="button" onClick={handleConfirmDup} disabled={loading} className="px-3 py-2 rounded-md bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase text-[10px] tracking-wider transition-colors shadow-md shadow-[#0D9488]/15">Salvar</button>
            </div>
        </Modal>
        {/* Inline Create Modals rendered outside the main form to avoid nested form issues */}
        <Modal isOpen={isNewCategoryOpen} onClose={() => setIsNewCategoryOpen(false)} title="Nova Categoria" size="md">
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newCategoryName.trim();
                    if (!name) return;
                    const type = newCategoryType;
                    const existing = categories.find(c => c.type === type && c.name.toLowerCase() === name.toLowerCase());
                    if (existing) {
                        setCategory(existing.name);
                        setIsNewCategoryOpen(false);
                        setNewCategoryName('');
                        setNewCategoryIcon('');
                        setEmojiFilter('');
                        showToast('Categoria já existe. Selecionada no lançamento.', 'info');
                        return;
                    }
                    try {
                        await addCategory({ name, type, icon: newCategoryIcon });
                        setCategory(name);
                        setIsNewCategoryOpen(false);
                        setNewCategoryName('');
                        setNewCategoryIcon('');
                        setEmojiFilter('');
                    } catch {
                        showToast('Falha ao criar categoria.', 'error');
                    }
                }}
                className="space-y-3"
            >
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome</label>
                    <input type="text" value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Emoji</label>
                        <select value={newCategoryIcon} onChange={(e)=>setNewCategoryIcon(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all">
                            <option value="">Sem emoji</option>
                            {DEFAULT_CATEGORY_EMOJIS.filter(opt => {
                                const q = emojiFilter.trim().toLowerCase();
                                if (!q) return true;
                                return opt.label.toLowerCase().includes(q) || opt.emoji.toLowerCase().includes(q);
                            }).map(opt => (
                                <option key={opt.emoji} value={opt.emoji}>{opt.emoji} {opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Buscar emoji</label>
                        <input type="text" value={emojiFilter} onChange={(e)=>setEmojiFilter(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" placeholder="Ex: Restaurante" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Tipo</label>
                    <select value={newCategoryType} onChange={(e)=>setNewCategoryType(e.target.value as any)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all">
                        <option value="Entrada">Receita</option>
                        <option value="Saída">Despesa</option>
                    </select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={()=>setIsNewCategoryOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors">Cancelar</button>
                    <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-[#0D9488]/15">Salvar</button>
                </div>
            </form>
        </Modal>

        <Modal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} title="Nova Conta" size="md">
            <form onSubmit={async (e)=>{e.preventDefault(); const name = newAccountName.trim(); const bank = newAccountBank.trim(); const bal = parseFloat(newAccountInitialBalance||'0'); if (!name || !bank) return; await addAccount({ name, bank, initialBalance: bal }); setTimeout(()=>{ try { const last = [...accounts].reverse().find(a=>a.name===name && a.bank===bank); if (last) setAccountId(last.id); } catch {} }, 0); setIsNewAccountOpen(false); setNewAccountName(''); setNewAccountBank(''); setNewAccountInitialBalance('0'); }} className="space-y-3">
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome</label>
                    <input type="text" value={newAccountName} onChange={(e)=>setNewAccountName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all" required />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Banco</label>
                    <input type="text" value={newAccountBank} onChange={(e)=>setNewAccountBank(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all" required />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Saldo Inicial</label>
                    <input type="number" step="0.01" value={newAccountInitialBalance} onChange={(e)=>setNewAccountInitialBalance(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all" />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={()=>setIsNewAccountOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors">Cancelar</button>
                    <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-[#0D9488]/15">Salvar</button>
                </div>
            </form>
        </Modal>

        <Modal isOpen={isNewCostCenterOpen} onClose={() => setIsNewCostCenterOpen(false)} title="Novo Centro de Custo" size="md">
            <form onSubmit={async (e)=>{e.preventDefault(); const name = newCostCenterName.trim(); if (!name) return; await addCostCenter({ name }); setTimeout(()=>{ try { const last = [...costCenters].reverse().find(c=>c.name===name); if (last) setCostCenterId(last.id); } catch {} }, 0); setIsNewCostCenterOpen(false); setNewCostCenterName(''); }} className="space-y-3">
                <div>
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome</label>
                    <input type="text" value={newCostCenterName} onChange={(e)=>setNewCostCenterName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#0D9488]/20 outline-none transition-all" required />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={()=>setIsNewCostCenterOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors">Cancelar</button>
                    <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-[#0D9488]/15">Salvar</button>
                </div>
            </form>
        </Modal>
        </>
    );
};
