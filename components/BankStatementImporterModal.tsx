import React, { useState, useRef } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import { formatCurrency } from '../utils/formatters';
import { 
    ParsedStatementItem, 
    parseOFXContent, 
    parseCSVContent, 
    flagDuplicates 
} from '../utils/bankStatementParser';
import { UploadIcon } from './icons';

interface BankStatementImporterModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultAccountId?: string;
}

export const BankStatementImporterModal: React.FC<BankStatementImporterModalProps> = ({
    isOpen,
    onClose,
    defaultAccountId
}) => {
    const { accounts, categories, transactions, addTransactionsBatch, addTransaction } = useFinancialData();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
        if (defaultAccountId && defaultAccountId !== 'all') return defaultAccountId;
        return accounts[0]?.id || '';
    });

    const [fileName, setFileName] = useState<string | null>(null);
    const [fileType, setFileType] = useState<'ofx' | 'csv' | null>(null);
    const [parsedItems, setParsedItems] = useState<ParsedStatementItem[]>([]);
    const [duplicateCount, setDuplicateCount] = useState<number>(0);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDuplicate, setFilterDuplicate] = useState<'all' | 'valid_only' | 'duplicates_only'>('all');

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        processFile(file);
    };

    const processFile = (file: File) => {
        setErrorMsg(null);
        setIsLoadingFile(true);
        setFileName(file.name);

        const lowerName = file.name.toLowerCase();
        const isOfx = lowerName.endsWith('.ofx');
        const isCsv = lowerName.endsWith('.csv') || lowerName.endsWith('.txt');

        if (!isOfx && !isCsv) {
            setErrorMsg('Formato não suportado. Por favor, envie um arquivo .OFX ou planilha .CSV.');
            setIsLoadingFile(false);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                if (!text || !text.trim()) {
                    setErrorMsg('O arquivo selecionado está vazio.');
                    setIsLoadingFile(false);
                    return;
                }

                let result;
                if (isOfx) {
                    setFileType('ofx');
                    result = parseOFXContent(text, categories);
                } else {
                    setFileType('csv');
                    result = parseCSVContent(text, categories);
                }

                if (!result.success || result.items.length === 0) {
                    setErrorMsg(result.error || 'Nenhum lançamento válido foi identificado no arquivo.');
                    setIsLoadingFile(false);
                    return;
                }

                // Run duplicate detection against existing transactions
                const checked = flagDuplicates(result.items, transactions, selectedAccountId);
                setParsedItems(checked.items);
                setDuplicateCount(checked.duplicateCount);
            } catch (err: any) {
                setErrorMsg(`Erro ao ler arquivo: ${err.message}`);
            } finally {
                setIsLoadingFile(false);
            }
        };

        reader.onerror = () => {
            setErrorMsg('Erro na leitura do arquivo pelo navegador.');
            setIsLoadingFile(false);
        };

        reader.readAsText(file);
    };

    // Re-evaluate duplicates when account changes
    const handleAccountChange = (newAccId: string) => {
        setSelectedAccountId(newAccId);
        if (parsedItems.length > 0) {
            const rechecked = flagDuplicates(parsedItems, transactions, newAccId);
            setParsedItems(rechecked.items);
            setDuplicateCount(rechecked.duplicateCount);
        }
    };

    const toggleItemSelection = (id: string) => {
        setParsedItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    };

    const toggleSelectAll = (select: boolean) => {
        setParsedItems(prev => prev.map(item => ({
            ...item,
            selected: select ? !item.isDuplicate : false
        })));
    };

    const updateItemCategory = (id: string, newCategory: string) => {
        setParsedItems(prev => prev.map(item => item.id === id ? { ...item, category: newCategory } : item));
    };

    const updateItemDescription = (id: string, newDesc: string) => {
        setParsedItems(prev => prev.map(item => item.id === id ? { ...item, description: newDesc } : item));
    };

    const selectedItems = parsedItems.filter(i => i.selected);
    const selectedInflow = selectedItems.filter(i => i.transactionType === TransactionType.INCOME).reduce((acc, i) => acc + i.amount, 0);
    const selectedOutflow = selectedItems.filter(i => i.transactionType === TransactionType.EXPENSE).reduce((acc, i) => acc + i.amount, 0);
    const selectedNet = selectedInflow - selectedOutflow;

    const filteredItems = parsedItems.filter(item => {
        if (filterDuplicate === 'valid_only' && item.isDuplicate) return false;
        if (filterDuplicate === 'duplicates_only' && !item.isDuplicate) return false;
        if (searchTerm) {
            const st = searchTerm.toLowerCase();
            return item.description.toLowerCase().includes(st) || item.category.toLowerCase().includes(st) || item.amount.toString().includes(st);
        }
        return true;
    });

    const handleConfirmImport = async () => {
        if (!selectedAccountId) {
            setErrorMsg('Por favor, selecione uma conta bancária de destino.');
            return;
        }

        if (selectedItems.length === 0) {
            setErrorMsg('Nenhum lançamento foi selecionado para importação.');
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            const txsToImport = selectedItems.map(item => ({
                date: item.date,
                accountId: selectedAccountId,
                transactionType: item.transactionType,
                category: item.category || (item.transactionType === TransactionType.INCOME ? 'Outras Receitas' : 'Outras Despesas'),
                description: item.description,
                amount: item.amount,
                paymentMethod: item.paymentMethod || 'Outro',
                costCenterId: undefined,
                isBusinessRevenue: false,
                isBusinessExpense: false
            }));

            if (addTransactionsBatch) {
                await addTransactionsBatch(txsToImport);
            } else {
                for (const tx of txsToImport) {
                    await addTransaction(tx);
                }
            }

            onClose();
        } catch (err: any) {
            setErrorMsg(`Erro ao salvar lançamentos: ${err.message || 'Falha na comunicação'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetImporter = () => {
        setFileName(null);
        setFileType(null);
        setParsedItems([]);
        setDuplicateCount(0);
        setErrorMsg(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-[#0D9488] dark:text-teal-400 flex items-center justify-center ring-1 ring-[#0D9488]/20">
                            <UploadIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none">
                                Importador Universal de Extratos
                            </h2>
                            <p className="text-[11px] font-semibold text-slate-400 mt-1">
                                Suporte nativo a arquivos <strong className="text-slate-600 dark:text-slate-300">.OFX</strong> e planilhas <strong className="text-slate-600 dark:text-slate-300">.CSV</strong> com conciliação automática
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
                        title="Fechar"
                    >
                        ✕
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in">
                            <div className="flex items-center gap-2">
                                <span className="text-base">⚠️</span>
                                <span>{errorMsg}</span>
                            </div>
                            <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:underline text-[11px] font-bold">Dispensar</button>
                        </div>
                    )}

                    {/* Step 1: File selection or Dropzone */}
                    {!fileName && (
                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0D9488] dark:hover:border-[#0D9488] rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-slate-50/40 dark:bg-slate-950/20 group hover:bg-[#0D9488]/5"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".ofx,.csv,.txt"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <div className="w-16 h-16 rounded-3xl bg-teal-500/10 text-[#0D9488] dark:text-teal-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                <UploadIcon className="w-8 h-8" />
                            </div>
                            <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                Arraste ou selecione seu extrato bancário
                            </h3>
                            <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
                                Compatível com todos os bancos brasileiros: Itaú, Nubank, Bradesco, Santander, Inter, BTG, BB, C6, Caixa (.OFX ou .CSV)
                            </p>
                            <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold group-hover:bg-[#0D9488] group-hover:text-white transition-colors">
                                <span>Procurar arquivo no computador</span>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Parsed State & Review Controls */}
                    {fileName && (
                        <div className="space-y-5">
                            {/* File and Account Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Arquivo Carregado</label>
                                    <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
                                        <div className="flex items-center gap-2 truncate">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-teal-500/15 text-[#0D9488] dark:text-teal-300">
                                                {fileType?.toUpperCase()}
                                            </span>
                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={fileName}>
                                                {fileName}
                                            </span>
                                        </div>
                                        <button
                                            onClick={resetImporter}
                                            className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-wider"
                                            title="Trocar arquivo"
                                        >
                                            Trocar
                                        </button>
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Conta Bancária de Destino</label>
                                    <select
                                        value={selectedAccountId}
                                        onChange={(e) => handleAccountChange(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#0D9488]/30 focus:border-[#0D9488]"
                                    >
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.name} ({acc.bank}) — Saldo Atual: {formatCurrency(acc.balance ?? acc.initialBalance)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Summary Metrics Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selecionados</span>
                                    <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                                        {selectedItems.length} <span className="text-xs font-semibold text-slate-400">/ {parsedItems.length}</span>
                                    </p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Total Entradas</span>
                                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        +{formatCurrency(selectedInflow)}
                                    </p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Total Saídas</span>
                                    <p className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                                        -{formatCurrency(selectedOutflow)}
                                    </p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Líquido</span>
                                    <p className={`text-lg font-black mt-0.5 ${selectedNet >= 0 ? 'text-[#0D9488] dark:text-teal-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {formatCurrency(selectedNet)}
                                    </p>
                                </div>
                            </div>

                            {/* Duplicate Protection Warning Alert */}
                            {duplicateCount > 0 && (
                                <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
                                        <span className="text-lg">🛡️</span>
                                        <div>
                                            <strong className="font-black">{duplicateCount} lançamento(s) duplicado(s) detectado(s).</strong>
                                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                                Identificamos transações com o mesmo valor, data e conta já existentes no sistema. Elas foram desmarcadas automaticamente para evitar duplicidade.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => setFilterDuplicate(filterDuplicate === 'duplicates_only' ? 'all' : 'duplicates_only')}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-200/60 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-300/60 transition-colors"
                                        >
                                            {filterDuplicate === 'duplicates_only' ? 'Ver Todos' : 'Ver Apenas Duplicados'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Table Filters & Batch Operations Toolbar */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => toggleSelectAll(true)}
                                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                                    >
                                        Selecionar Válidos
                                    </button>
                                    <button
                                        onClick={() => toggleSelectAll(false)}
                                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors"
                                    >
                                        Desmarcar Todos
                                    </button>
                                </div>
                                <div className="w-full sm:w-64">
                                    <input
                                        type="text"
                                        placeholder="Filtrar por texto ou categoria..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            {/* Staging Review Table */}
                            <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm max-h-72 overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90 backdrop-blur-sm text-[10px] uppercase font-black tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800 z-10">
                                        <tr>
                                            <th className="py-2.5 px-3 w-10 text-center">Sel.</th>
                                            <th className="py-2.5 px-3 w-28">Data</th>
                                            <th className="py-2.5 px-3">Descrição Extrato</th>
                                            <th className="py-2.5 px-3 w-40">Categoria Sugerida</th>
                                            <th className="py-2.5 px-3 w-24 text-right">Valor</th>
                                            <th className="py-2.5 px-3 w-28 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {filteredItems.map(item => (
                                            <tr
                                                key={item.id}
                                                className={`transition-colors ${item.selected ? 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-slate-50/50 dark:bg-slate-950/40 opacity-60'}`}
                                            >
                                                <td className="py-2.5 px-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.selected}
                                                        onChange={() => toggleItemSelection(item.id)}
                                                        className="w-4 h-4 text-[#0D9488] rounded border-slate-300 dark:border-slate-700 focus:ring-[#0D9488]"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {item.date}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="text"
                                                        value={item.description}
                                                        onChange={(e) => updateItemDescription(item.id, e.target.value)}
                                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-[#0D9488] focus:outline-none text-xs font-bold text-slate-800 dark:text-slate-100 py-0.5"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <select
                                                        value={item.category}
                                                        onChange={(e) => updateItemCategory(item.id, e.target.value)}
                                                        className="w-full bg-slate-100/60 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-[#0D9488]"
                                                    >
                                                        {categories.map(c => (
                                                            <option key={c.id} value={c.name}>
                                                                {c.icon || '🏷️'} {c.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-black tabular-nums">
                                                    <span className={item.transactionType === TransactionType.INCOME ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}>
                                                        {item.transactionType === TransactionType.INCOME ? '+' : '-'} {formatCurrency(item.amount)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    {item.isDuplicate ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50" title={item.duplicateReason}>
                                                            ⚠️ Duplicata
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                                                            ✅ Pronto
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 font-medium">
                        {fileName ? (
                            <span>Total para importar: <strong className="text-slate-900 dark:text-white font-bold">{selectedItems.length} lançamentos</strong> vinculados à conta selecionada.</span>
                        ) : (
                            <span>Nenhum arquivo processado ainda.</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={onClose}
                            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={!fileName || selectedItems.length === 0 || isSubmitting}
                            className="w-full sm:w-auto px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Importando...</span>
                                </>
                            ) : (
                                <span>Confirmar e Importar {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}</span>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
