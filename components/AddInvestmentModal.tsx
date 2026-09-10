

import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { AssetType, TransactionType } from '../types';
import type { Investment, FixedIncomeInvestment } from '../types';
import { Modal } from './shared/Modal';
import { formatInputMoney, toNumberPtBr } from '../utils/formatters';
import { FormField } from './ui/Forms/FormField';
import { Input } from './ui/Forms/Input';
import { Select } from './ui/Forms/Select';
import { VoiceRecordButton } from './ui/VoiceRecordButton';
import { SparklesIcon } from './icons';

interface AddInvestmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    initial?: {
        type?: AssetType;
        ticker?: string;
        quantity?: number;
        purchasePrice?: number;
        purchaseDate?: string;
        name?: string;
        issuer?: string;
        amountInvested?: number;
        yieldRate?: string;
        maturityDate?: string;
        op?: 'buy' | 'sell' | 'dividend';
        assetId?: string;
    };
}

export const AddInvestmentModal: React.FC<AddInvestmentModalProps> = ({ isOpen, onClose, initial }) => {
    const { addInvestment, addFixedIncomeInvestment, accounts, addTransaction, categories, investments, updateInvestment, deleteInvestment, costCenters, fixedIncomeInvestments, updateFixedIncomeInvestment, deleteFixedIncomeInvestment, addCategory } = useFinancialData();
    const paymentMethodSuggestions = ['PIX', 'Saldo Conta', 'Saldo Conta Investimentos', 'Saldo Corretora', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Transferência Bancária', 'Débito Automático'];
    const [type, setType] = useState<AssetType>(AssetType.STOCK);
    const [op, setOp] = useState<'buy'|'sell'|'dividend'>('buy');
    
    // Variable Asset State
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [purchasePrice, setPurchasePrice] = useState('0,00');
    
    // Fixed Income State
    const [name, setName] = useState('');
    const [issuer, setIssuer] = useState('');
    const [amountInvested, setAmountInvested] = useState('0,00');
    const [yieldRate, setYieldRate] = useState('');
    const [maturityDate, setMaturityDate] = useState('');

    // Common State
    const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [linkAccountId, setLinkAccountId] = useState<string>('');
    const [createCashTransaction, setCreateCashTransaction] = useState<boolean>(true);
    const [txCategory, setTxCategory] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<string>('Transferência Bancária');
    const [costCenterId, setCostCenterId] = useState<string>('');

    const resetForm = () => {
        setType(AssetType.STOCK);
        setOp('buy');
        setTicker('');
        setQuantity('');
        setPurchasePrice('');
        setName('');
        setIssuer('');
        setAmountInvested('');
        setYieldRate('');
        setMaturityDate('');
        setPurchaseDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`);
        setLinkAccountId('');
        setCreateCashTransaction(true);
        setTxCategory('');
        setPaymentMethod('Transferência Bancária');
        setCostCenterId('');
    };

    const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);

    const handleVoiceInvestment = async (speechText: string) => {
        if (!speechText || speechText.trim().length < 2) return;
        setIsVoiceProcessing(true);
        try {
            const res = await fetch('/api/ai/advice', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kind: 'investment_transaction',
                    question: speechText,
                    context: {
                        today: new Date().toISOString().split('T')[0],
                        accounts: accounts.map(a => ({ id: a.id, name: a.name }))
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                const inv = data?.investment;
                if (inv) {
                    if (inv.assetType) {
                        const matchedType = Object.values(AssetType).find(
                            t => t.toLowerCase() === String(inv.assetType).toLowerCase()
                        );
                        if (matchedType) setType(matchedType);
                        else if (/fii|imobili/i.test(inv.assetType)) setType(AssetType.REAL_ESTATE_FUND);
                        else if (/cripto/i.test(inv.assetType)) setType(AssetType.CRYPTO);
                        else if (/renda fixa|cdb|lci|lca|tesouro/i.test(inv.assetType)) setType(AssetType.FIXED_INCOME);
                        else setType(AssetType.STOCK);
                    }

                    if (inv.operation) {
                        setOp(inv.operation as any);
                    }

                    if (inv.ticker) setTicker(inv.ticker);
                    if (inv.name) setName(inv.name);
                    if (inv.issuer) setIssuer(inv.issuer);
                    if (inv.quantity) setQuantity(String(inv.quantity));
                    if (inv.purchasePrice) setPurchasePrice(formatInputMoney(String(Math.round(inv.purchasePrice * 100))));
                    if (inv.amountInvested) setAmountInvested(formatInputMoney(String(Math.round(inv.amountInvested * 100))));
                    if (inv.yieldRate) setYieldRate(inv.yieldRate);
                    if (inv.maturityDate) setMaturityDate(inv.maturityDate);
                    if (inv.date) setPurchaseDate(inv.date);
                    if (inv.paymentMethod) setPaymentMethod(inv.paymentMethod);
                }
            }
        } catch (err) {
            console.error("Voice investment parse error:", err);
        } finally {
            setIsVoiceProcessing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const dateIso = new Date(purchaseDate + 'T12:00:00').toISOString();
        if (op === 'dividend') {
            if (createCashTransaction && linkAccountId) {
                {
                    const catName = txCategory || 'Dividendos';
                    const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (!exists) {
                        try { await addCategory({ name: catName, type: 'Entrada', icon: '' }); } catch {}
                    }
                }
                addTransaction({
                    accountId: linkAccountId,
                    transactionType: TransactionType.INCOME,
                    amount: toNumberPtBr(amountInvested) || 0,
                    description: type === AssetType.FIXED_INCOME ? `Dividendos ${name}` : `Dividendos ${ticker.toUpperCase()}`,
                    category: txCategory || 'Dividendos',
                    paymentMethod,
                    date: dateIso,
                    costCenterId: costCenterId || undefined
                });
            }
        } else if (type === AssetType.FIXED_INCOME) {
            if (op === 'buy') {
                const newInvestment: Omit<FixedIncomeInvestment, 'id'> = {
                    type,
                    name,
                    issuer,
                    amountInvested: toNumberPtBr(amountInvested),
                    yieldRate,
                    purchaseDate: dateIso,
                    maturityDate: new Date(maturityDate + 'T12:00:00').toISOString(),
                };
                addFixedIncomeInvestment(newInvestment);
                if (createCashTransaction && linkAccountId && parseFloat(amountInvested) > 0) {
                    {
                        const catName = txCategory || 'Investimentos';
                        const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
                        if (!exists) {
                            try { await addCategory({ name: catName, type: 'Saída', icon: '' }); } catch {}
                        }
                    }
                    addTransaction({
                        accountId: linkAccountId,
                        transactionType: TransactionType.EXPENSE,
                        amount: parseFloat(amountInvested),
                        description: `Aplicação ${name}`,
                        category: txCategory || 'Investimentos',
                        paymentMethod,
                        date: dateIso,
                        costCenterId: costCenterId || undefined
                    });
                }
            } else if (op === 'sell') {
                const amt = toNumberPtBr(amountInvested) || 0;
                if (createCashTransaction && linkAccountId && amt > 0) {
                    {
                        const catName = txCategory || 'Investimentos';
                        const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
                        if (!exists) {
                            try { await addCategory({ name: catName, type: 'Entrada', icon: '' }); } catch {}
                        }
                    }
                    addTransaction({
                        accountId: linkAccountId,
                        transactionType: TransactionType.INCOME,
                        amount: amt,
                        description: `Resgate ${name}`,
                        category: txCategory || 'Investimentos',
                        paymentMethod,
                        date: dateIso,
                        costCenterId: costCenterId || undefined
                    });
                }
                const targetId = initial?.assetId;
                const targetFi = targetId ? fixedIncomeInvestments.find(fi => fi.id === targetId) : fixedIncomeInvestments.find(fi => fi.name === name);
                if (targetFi && amt > 0) {
                    const newAmt = Math.max(0, (targetFi.amountInvested || 0) - amt);
                    if (newAmt > 0) {
                        updateFixedIncomeInvestment(targetFi.id, { amountInvested: newAmt });
                    } else {
                        deleteFixedIncomeInvestment(targetFi.id);
                    }
                }
            }
        } else {
            if (op === 'buy') {
                let q = parseFloat(quantity);
                let p = toNumberPtBr(purchasePrice);
                if (type === AssetType.CRYPTO && amountInvested) {
                    p = toNumberPtBr(purchasePrice);
                    const invested = toNumberPtBr(amountInvested);
                    q = p > 0 ? (invested / p) : 0;
                }
                const newInvestment: Omit<Investment, 'id'> = {
                    type: type as Exclude<AssetType, AssetType.FIXED_INCOME>,
                    ticker: ticker.toUpperCase(),
                    quantity: q,
                    purchasePrice: p,
                    purchaseDate: dateIso,
                };
                addInvestment(newInvestment);
                const total = (q || 0) * (p || 0);
                if (createCashTransaction && linkAccountId && total > 0) {
                    {
                        const catName = txCategory || 'Investimentos';
                        const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
                        if (!exists) {
                            try { await addCategory({ name: catName, type: 'Saída', icon: '' }); } catch {}
                        }
                    }
                    addTransaction({
                        accountId: linkAccountId,
                        transactionType: TransactionType.EXPENSE,
                        amount: total,
                        description: `Compra ${ticker.toUpperCase()} ${q}@${p}`,
                        category: txCategory || 'Investimentos',
                        paymentMethod,
                        date: dateIso,
                        costCenterId: costCenterId || undefined
                    });
                }
            } else if (op === 'sell') {
                let total = 0;
                const p = toNumberPtBr(purchasePrice) || 0;
                const soldQty = (type === AssetType.CRYPTO)
                    ? ((toNumberPtBr(amountInvested) || 0) / (p > 0 ? p : 1))
                    : (parseFloat(quantity) || 0);
                total = (type === AssetType.CRYPTO)
                    ? (toNumberPtBr(amountInvested) || 0)
                    : (soldQty * p);
                if (createCashTransaction && linkAccountId && total > 0) {
                    {
                        const catName = txCategory || 'Investimentos';
                        const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
                        if (!exists) {
                            try { await addCategory({ name: catName, type: 'Entrada', icon: '' }); } catch {}
                        }
                    }
                    addTransaction({
                        accountId: linkAccountId,
                        transactionType: TransactionType.INCOME,
                        amount: total,
                        description: `Venda ${ticker.toUpperCase()}`,
                        category: txCategory || 'Investimentos',
                        paymentMethod,
                        date: dateIso,
                        costCenterId: costCenterId || undefined
                    });
                }
                const targetId = initial?.assetId;
                const target = targetId ? investments.find(i => i.id === targetId) : investments.find(i => i.ticker.toUpperCase() === ticker.toUpperCase());
                if (target) {
                    const newQty = Math.max(0, (target.quantity || 0) - soldQty);
                    if (newQty > 0) {
                        updateInvestment(target.id, { quantity: newQty });
                    } else {
                        deleteInvestment(target.id);
                    }
                }
            }
        }
        onClose();
    };
    
    useEffect(() => {
        if (!isOpen) {
           resetForm();
        } else if (initial) {
            if (typeof initial.type !== 'undefined') setType(initial.type);
            if (typeof initial.ticker !== 'undefined') setTicker(initial.ticker || '');
            if (typeof initial.quantity !== 'undefined') setQuantity(String(initial.quantity));
            if (typeof initial.purchasePrice !== 'undefined') setPurchasePrice(String(initial.purchasePrice));
            if (typeof initial.purchaseDate !== 'undefined') setPurchaseDate(initial.purchaseDate || new Date().toISOString().split('T')[0]);
            if (typeof initial.name !== 'undefined') setName(initial.name || '');
            if (typeof initial.issuer !== 'undefined') setIssuer(initial.issuer || '');
            if (typeof initial.amountInvested !== 'undefined') setAmountInvested(String(initial.amountInvested));
            if (typeof initial.yieldRate !== 'undefined') setYieldRate(initial.yieldRate || '');
            if (typeof initial.maturityDate !== 'undefined') setMaturityDate(initial.maturityDate || '');
            if (typeof initial.op !== 'undefined') setOp(initial.op);
        }
    }, [isOpen, initial]);

    useEffect(() => {
        if (isOpen) {
            if (accounts.length > 0 && !linkAccountId) setLinkAccountId(accounts[0].id);
            if (costCenters.length > 0 && !costCenterId) setCostCenterId(costCenters[0].id);
        }
    }, [isOpen, accounts, linkAccountId, costCenters, costCenterId]);

    const inputClasses = "w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    const confidence = () => {
        let score = 0;
        if (type === AssetType.FIXED_INCOME) {
            if (name && name.length >= 3) score += 25;
            if (issuer && issuer.length >= 2) score += 20;
            if (amountInvested && parseFloat(amountInvested) > 0) score += 20;
            if (yieldRate && /(cdi|ipca|%)/i.test(yieldRate)) score += 20;
            if (maturityDate && maturityDate.length >= 8) score += 15;
        } else {
            if (ticker && /^[A-Za-z]{2,6}[0-9]{0,2}$/.test(ticker.toUpperCase())) score += 30;
            if (quantity && parseFloat(quantity) > 0) score += 25;
            if (purchasePrice && parseFloat(purchasePrice) > 0) score += 25;
            if (purchaseDate && purchaseDate.length >= 8) score += 10;
            if (/^([A-Z]{3,5}11)$/.test(ticker.toUpperCase())) score += 5;
        }
        const label = score >= 75 ? 'Certeza alta' : score >= 45 ? 'Certeza média' : 'Certeza baixa';
        const color = score >= 75 ? 'bg-green-100 text-green-800 dark:bg-green-600/30 dark:text-green-300' : score >= 45 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-600/30 dark:text-yellow-300' : 'bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-300';
        return { score, label, color };
    };

    const footer = (
        <div className="flex justify-end gap-3 w-full border-t border-slate-100 dark:border-slate-800 pt-4">
            <button type="button" onClick={onClose} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
            <button type="submit" form="add-investment-form" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none">Salvar</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo Investimento" size="lg" footer={footer}>
            <div className="flex items-center justify-between mb-4">
                {/* Lançamento por Voz com IA */}
                <div className="flex-1 flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 mr-3">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                            <SparklesIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            Comando de Investimento por Voz
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Fale a operação (ex: "Comprei 10 cotas de MXRF11 a 10,25")
                        </span>
                    </div>
                    <VoiceRecordButton
                        onSpeechResult={handleVoiceInvestment}
                        isProcessing={isVoiceProcessing}
                        label="Ditar Operação"
                        size="sm"
                    />
                </div>

                {(() => { const c = confidence(); return (
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded shrink-0 ${c.color}`}>{c.label}</span>
                ); })()}
            </div>
            <form id="add-investment-form" onSubmit={handleSubmit} className="space-y-6 p-2">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField label="Tipo de Ativo">
                        <Select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
                            {Object.values(AssetType).map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                    </FormField>
                    <FormField label="Operação">
                        <Select value={op} onChange={(e)=>setOp(e.target.value as any)}>
                            <option value="buy">Compra</option>
                            <option value="sell">Venda</option>
                            <option value="dividend">Dividendo</option>
                        </Select>
                    </FormField>
                </div>

                {type === AssetType.FIXED_INCOME ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <FormField label="Nome do Ativo">
                                <Input type="text" placeholder="Ex: CDB Liquidez Diária" value={name} onChange={(e) => setName(e.target.value)} required />
                            </FormField>
                             <FormField label="Emissor">
                                <Input type="text" placeholder="Ex: Banco Inter" value={issuer} onChange={(e) => setIssuer(e.target.value)} required />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <FormField label="Valor Investido">
                                <Input type="text" value={amountInvested} onChange={(e) => setAmountInvested(formatInputMoney(e.target.value))} required placeholder="0,00" />
                            </FormField>
                             <FormField label="Rentabilidade">
                                <Input type="text" placeholder="Ex: 110% CDI" value={yieldRate} onChange={(e) => setYieldRate(e.target.value)} required />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <FormField label="Data de Vencimento">
                                <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} required />
                            </FormField>
                            <FormField label="Data da Compra">
                                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
                            </FormField>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <FormField label="Código / Ticker">
                                <Input type="text" placeholder="Ex: PETR4, AAPL, BTC" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
                            </FormField>
                            <FormField label="Data da Compra">
                                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
                            </FormField>
                        </div>

                        {type === AssetType.CRYPTO ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <FormField label="Valor">
                                    <Input type="text" value={amountInvested} onChange={(e) => setAmountInvested(formatInputMoney(e.target.value))} required placeholder="0,00" />
                                </FormField>
                                <FormField label="Preço do Ativo">
                                    <Input type="text" value={purchasePrice} onChange={(e) => setPurchasePrice(formatInputMoney(e.target.value))} required placeholder="0,00" />
                                </FormField>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <FormField label="Quantidade">
                                    <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                                </FormField>
                                <FormField label="Preço (Unit.)">
                                    <Input type="text" value={purchasePrice} onChange={(e) => setPurchasePrice(formatInputMoney(e.target.value))} required placeholder="0,00" />
                                </FormField>
                            </div>
                        )}
                    </>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <FormField label="Conta para registrar impacto de Fluxo de Caixa">
                        <Select value={linkAccountId} onChange={(e)=>setLinkAccountId(e.target.value)}>
                            <option value="">Selecionar...</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                    </FormField>
                    <div className="flex items-center gap-3 mt-0 md:mt-8">
                        <input id="createCash" type="checkbox" checked={createCashTransaction} onChange={e=>setCreateCashTransaction(e.target.checked)} className="h-5 w-5 text-indigo-600 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 rounded transition-colors" />
                        <label htmlFor="createCash" className="text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer select-none">Registrar impacto no Fluxo de Caixa</label>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <FormField label="Mapeamento DRE (Categoria)">
                        <Select value={txCategory} onChange={e=>setTxCategory(e.target.value)}>
                            <option value="">Selecionar...</option>
                            {(op === 'buy' ? categories.filter(c=>c.type==='Saída') : categories.filter(c=>c.type==='Entrada')).map(c=> (<option key={c.id} value={c.name}>{c.name}</option>))}
                        </Select>
                    </FormField>
                    <FormField label="Método de Pagamento">
                        <Select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
                            <option value="">Selecionar...</option>
                            {paymentMethodSuggestions.map(p => (<option key={p} value={p}>{p}</option>))}
                        </Select>
                    </FormField>
                    <FormField label="Centro de Custo">
                        <Select value={costCenterId} onChange={e=>setCostCenterId(e.target.value)}>
                            <option value="">Selecionar...</option>
                            {costCenters.map(cc => (<option key={cc.id} value={cc.id}>{cc.name}</option>))}
                        </Select>
                    </FormField>
                </div>
            </form>
        </Modal>
    );
};
