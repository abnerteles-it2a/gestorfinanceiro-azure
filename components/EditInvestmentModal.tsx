import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { AssetType } from '../types';
import type { Investment, FixedIncomeInvestment, AnyInvestment } from '../types';
import { Modal } from './shared/Modal';
import { formatInputMoney, toNumberPtBr, formatCurrencyForInput } from '../utils/formatters';

interface EditInvestmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    investment: AnyInvestment;
}

export const EditInvestmentModal: React.FC<EditInvestmentModalProps> = ({ isOpen, onClose, investment }) => {
    const { updateInvestment, updateFixedIncomeInvestment } = useFinancialData();
    
    // State for form fields
    const [type, setType] = useState<AssetType>(investment.type);
    
    // Variable Asset State
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [purchasePrice, setPurchasePrice] = useState('');
    
    // Fixed Income State
    const [name, setName] = useState('');
    const [issuer, setIssuer] = useState('');
    const [amountInvested, setAmountInvested] = useState('');
    const [yieldRate, setYieldRate] = useState('');
    const [maturityDate, setMaturityDate] = useState('');

    // Common State
    const [purchaseDate, setPurchaseDate] = useState('');

    useEffect(() => {
        if (investment) {
            setType(investment.type);
            setPurchaseDate(new Date(investment.purchaseDate).toISOString().split('T')[0]);
            
            if (investment.type === AssetType.FIXED_INCOME) {
                const fi = investment as FixedIncomeInvestment;
                setName(fi.name);
                setIssuer(fi.issuer);
                setAmountInvested(formatCurrencyForInput(fi.amountInvested));
                setYieldRate(fi.yieldRate);
                setMaturityDate(new Date(fi.maturityDate).toISOString().split('T')[0]);
            } else {
                const v = investment as Investment;
                setTicker(v.ticker);
                setQuantity(String(v.quantity));
                setPurchasePrice(formatCurrencyForInput(v.purchasePrice));
            }
        }
    }, [investment, isOpen]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (type === AssetType.FIXED_INCOME) {
            const updatedInvestment: Partial<FixedIncomeInvestment> = {
                name,
                issuer,
                amountInvested: toNumberPtBr(amountInvested),
                yieldRate,
                purchaseDate: new Date(purchaseDate).toISOString(),
                maturityDate: new Date(maturityDate).toISOString(),
            };
            updateFixedIncomeInvestment(investment.id, updatedInvestment);
        } else {
            const updatedInvestment: Partial<Investment> = {
                ticker: ticker.toUpperCase(),
                quantity: parseFloat(quantity),
                purchasePrice: toNumberPtBr(purchasePrice),
                purchaseDate: new Date(purchaseDate).toISOString(),
            };
            updateInvestment(investment.id, updatedInvestment);
        }
        onClose();
    };
    
    const inputClasses = "w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    const footer = (
        <div className="flex justify-end gap-2 w-full">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md">Cancelar</button>
            <button type="submit" form="edit-investment-form" className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md">Salvar Alterações</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Investimento" footer={footer}>
            <form id="edit-investment-form" onSubmit={handleSubmit} className="space-y-4">
                 <div>
                    <label className={labelClasses}>Tipo de Ativo</label>
                    <select value={type} className={inputClasses + " bg-gray-200 dark:bg-gray-600"} disabled>
                        <option>{type}</option>
                    </select>
                </div>

                {type === AssetType.FIXED_INCOME ? (
                    <>
                        <div>
                            <label className={labelClasses}>Nome do Ativo</label>
                            <input type="text" placeholder="Ex: CDB Liquidez Diária" value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
                        </div>
                         <div>
                            <label className={labelClasses}>Emissor</label>
                            <input type="text" placeholder="Ex: Banco Inter" value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inputClasses} required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className={labelClasses}>Valor Investido</label>
                                <input type="text" value={amountInvested} onChange={(e) => setAmountInvested(formatInputMoney(e.target.value))} className={inputClasses} required />
                            </div>
                             <div>
                                <label className={labelClasses}>Rentabilidade</label>
                                <input type="text" placeholder="Ex: 110% CDI" value={yieldRate} onChange={(e) => setYieldRate(e.target.value)} className={inputClasses} required />
                            </div>
                        </div>
                        <div>
                            <label className={labelClasses}>Data de Vencimento</label>
                            <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={inputClasses} required />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className={labelClasses}>Código / Ticker</label>
                            <input type="text" placeholder="Ex: PETR4, AAPL, BTC" value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputClasses} required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClasses}>Quantidade</label>
                                <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClasses} required />
                            </div>
                            <div>
                                <label className={labelClasses}>Preço de Compra (Unit.)</label>
                                <input type="text" value={purchasePrice} onChange={(e) => setPurchasePrice(formatInputMoney(e.target.value))} className={inputClasses} required />
                            </div>
                        </div>
                    </>
                )}
                
                <div>
                    <label className={labelClasses}>Data da Compra</label>
                    <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClasses} required />
                </div>
            </form>
        </Modal>
    );
};
