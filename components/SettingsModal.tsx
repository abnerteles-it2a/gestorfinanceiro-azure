import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Modal } from './shared/Modal';
import { 
    EditIcon, TrashIcon, PlusIcon, BankIcon, ArrowDownIcon, 
    UploadIcon, DatabaseIcon, FolderIcon, SettingsIcon,
    CalendarIcon, UsersIcon, CheckCircleIcon
} from './icons';
import type { Category, BankAccount, CostCenter, Recurrence } from '../types';
import { useToast } from '../context/ToastContext';
import { formatInputMoney, toNumberPtBr, formatCurrency } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { Input } from './ui/Forms/Input';
import { Select } from './ui/Forms/Select';
import { FormField } from './ui/Forms/FormField';
import { FormSection } from './ui/Forms/FormSection';

export const DEFAULT_CATEGORY_EMOJIS: { emoji: string; label: string }[] = [
    { emoji: '🛒', label: 'Supermercado' }, { emoji: '🍽️', label: 'Restaurante / Alimentação' },
    { emoji: '☕', label: 'Café / Padaria' }, { emoji: '🍕', label: 'Delivery' },
    { emoji: '🥗', label: 'Comida Saudável' }, { emoji: '🚗', label: 'Transporte' },
    { emoji: '🚌', label: 'Transporte Público' }, { emoji: '⛽', label: 'Combustível' },
    { emoji: '🅿️', label: 'Estacionamento' }, { emoji: '🚙', label: 'Carro' },
    { emoji: '🔧', label: 'Manutenção' }, { emoji: '🏠', label: 'Moradia' },
    { emoji: '🏢', label: 'Condomínio' }, { emoji: '🧾', label: 'Aluguel' },
    { emoji: '⚡', label: 'Energia' }, { emoji: '💧', label: 'Água' },
    { emoji: '🔥', label: 'Gás' }, { emoji: '🌐', label: 'Internet' },
    { emoji: '📱', label: 'Telefonia / Celular' }, { emoji: '💊', label: 'Farmácia' },
    { emoji: '🩺', label: 'Saúde' }, { emoji: '🦷', label: 'Dentista' },
    { emoji: '🧪', label: 'Exames' }, { emoji: '🎓', label: 'Educação' },
    { emoji: '📚', label: 'Livros / Material' }, { emoji: '💻', label: 'Tecnologia' },
    { emoji: '🖥️', label: 'Eletrônicos' }, { emoji: '🧰', label: 'Ferramentas' },
    { emoji: '📺', label: 'Assinaturas' }, { emoji: '🎮', label: 'Jogos' },
    { emoji: '🎵', label: 'Música' }, { emoji: '🎬', label: 'Cinema / Streaming' },
    { emoji: '🎉', label: 'Lazer' }, { emoji: '🏋️', label: 'Academia' },
    { emoji: '⚽', label: 'Esportes' }, { emoji: '🏖️', label: 'Viagens' },
    { emoji: '✈️', label: 'Passagens' }, { emoji: '🏨', label: 'Hotel' },
    { emoji: '🐾', label: 'Pet' }, { emoji: '👶', label: 'Crianças' },
    { emoji: '👗', label: 'Roupas' }, { emoji: '👟', label: 'Calçados' },
    { emoji: '💄', label: 'Beleza' }, { emoji: '🧴', label: 'Cuidados Pessoais' },
    { emoji: '💇', label: 'Barbearia / Salão' }, { emoji: '🎁', label: 'Presentes' },
    { emoji: '🙏', label: 'Doações' }, { emoji: '💸', label: 'Impostos / Taxas' },
    { emoji: '🏦', label: 'Tarifas Bancárias' }, { emoji: '⚖️', label: 'Serviços / Jurídico' },
    { emoji: '🧼', label: 'Limpeza' }, { emoji: '🛠️', label: 'Reformas' },
    { emoji: '🌿', label: 'Jardinagem' }, { emoji: '🗂️', label: 'Escritório / Trabalho' },
    { emoji: '🏡', label: 'Home Office' }, { emoji: '💼', label: 'Salário / Receita' },
    { emoji: '💰', label: 'Renda Extra' }, { emoji: '📈', label: 'Investimentos' },
    { emoji: '🔁', label: 'Transferência' }
];

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpgrade?: (tier?: string) => void;
    initialTab?: 'categories' | 'accounts' | 'costCenters' | 'preferences' | 'backup' | 'auth';
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    variant?: 'overlay' | 'inline';
}

// --- Sub-components ---

const CategoryRow: React.FC<{ category: Category, onUpdate: (id: string, data: Partial<Category>) => void, onDelete: (id: string) => void }> = ({ category, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(category.name);
    const [budget, setBudget] = useState(category.budget?.toString() || '');
    const [meiCategory, setMeiCategory] = useState<Category['meiCategory']>(category.meiCategory);
    const [delOpen, setDelOpen] = useState(false);

    const handleSave = () => {
        onUpdate(category.id, { 
            name: name.trim(),
            budget: budget ? parseFloat(budget) : undefined,
            meiCategory: isIncome ? meiCategory : undefined
        });
        setIsEditing(false);
    };

    const isIncome = category.type === 'Entrada';

    return (
        <>
            <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-all group">
                <div className="flex items-center gap-4 flex-1">
                    <div className={`w-10 h-10 flex items-center justify-center text-lg rounded-xl shadow-sm border ${
                        isIncome 
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800/40 text-emerald-600' 
                        : 'bg-[#0D9488]/10 dark:bg-[#0D9488]/15 border-[#0D9488]/20 dark:border-[#0D9488]/10 text-[#0D9488]'
                    }`}>
                        {category.icon || (isIncome ? '💰' : '📁')}
                    </div>
                    {isEditing ? (
                        <div className="flex items-center gap-3 flex-1 max-w-md animate-fade-in">
                            <input value={name} onChange={e=>setName(e.target.value)} className="flex-1 h-9 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#0D9488]/20" autoFocus />
                            <input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="Meta R$" className="w-24 h-9 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#0D9488]/20" />
                            {isIncome && (
                                <select value={meiCategory || ''} onChange={e => setMeiCategory((e.target.value || undefined) as Category['meiCategory'])} className="h-9 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#0D9488]/20">
                                    <option value="">Atividade MEI</option>
                                    <option value="commerce">Comércio</option>
                                    <option value="industry">Indústria</option>
                                    <option value="service">Serviços</option>
                                    <option value="transport">Transporte</option>
                                </select>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">{category.name}</span>
                            {category.budget ? (
                                <span className={`text-[10px] font-black uppercase tracking-wider ${isIncome ? 'text-emerald-500' : 'text-[#0D9488]'}`}>
                                    Meta: {formatCurrency(category.budget)}
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">Sem meta definida</span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                    {isEditing ? (
                        <button onClick={handleSave} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-xl transition-colors"><CheckCircleIcon className="h-4 w-4" /></button>
                    ) : (
                        <button onClick={()=>setIsEditing(true)} className="p-2 text-slate-400 hover:text-[#0D9488] hover:bg-[#0D9488]/10 dark:hover:bg-[#0D9488]/15 rounded-xl transition-colors"><EditIcon className="h-4 w-4" /></button>
                    )}
                    <button onClick={()=>setDelOpen(true)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
            <Modal isOpen={delOpen} onClose={()=>setDelOpen(false)} title="Confirmar Exclusão" size="sm">
                <div className="space-y-6 text-center p-2">
                    <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/30 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        <TrashIcon className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">Excluir "{category.name}"?</p>
                        <p className="text-xs text-slate-500 mt-1">Esta ação não pode ser desfeita e afetará lançamentos existentes.</p>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                        <button onClick={()=>{onDelete(category.id); setDelOpen(false);}} className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-rose-600 text-white shadow-lg shadow-rose-200 dark:shadow-none hover:bg-rose-700 transition-all">Excluir Permanentemente</button>
                        <button onClick={()=>setDelOpen(false)} className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-all">Manter Categoria</button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

const AccountRow: React.FC<{ account: BankAccount, onUpdate: (id: string, data: Partial<BankAccount>) => void, onDelete: (id: string) => void }> = ({ account, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(account.name);
    const [bank, setBank] = useState(account.bank);
    const [delOpen, setDelOpen] = useState(false);

    const handleSave = () => {
        onUpdate(account.id, { name: name.trim(), bank: bank.trim() });
        setIsEditing(false);
    };

    return (
        <>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group">
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 flex items-center justify-center bg-[#0D9488]/10 dark:bg-[#0D9488]/15 rounded-xl border border-[#0D9488]/20 dark:border-[#0D9488]/10 shadow-sm">
                        <BankIcon className="h-5 w-5 text-[#0D9488]" />
                    </div>
                    {isEditing ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                            <input value={name} onChange={e=>setName(e.target.value)} className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold" />
                            <input value={bank} onChange={e=>setBank(e.target.value)} className="w-32 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold" />
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{account.name}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{account.bank}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isEditing ? (
                        <button onClick={handleSave} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><PlusIcon className="h-4 w-4 rotate-45" /></button>
                    ) : (
                        <button onClick={()=>setIsEditing(true)} className="p-2 text-slate-400 hover:text-[#0D9488] rounded-lg"><EditIcon className="h-4 w-4" /></button>
                    )}
                    <button onClick={()=>setDelOpen(true)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg"><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
            <Modal isOpen={delOpen} onClose={()=>setDelOpen(false)} title="Excluir Conta" size="sm">
                <div className="space-y-4 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Deseja excluir a conta **{account.name}**?</p>
                    <div className="flex justify-center gap-3">
                        <button onClick={()=>setDelOpen(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 text-slate-600">Cancelar</button>
                        <button onClick={()=>{onDelete(account.id); setDelOpen(false);}} className="px-4 py-2 rounded-xl font-bold bg-red-600 text-white shadow-lg shadow-red-200/20">Excluir</button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

const CostCenterRow: React.FC<{ center: CostCenter, onUpdate: (id: string, data: Partial<CostCenter>) => void, onDelete: (id: string) => void }> = ({ center, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(center.name);
    const [delOpen, setDelOpen] = useState(false);

    const handleSave = () => {
        onUpdate(center.id, { name: name.trim() });
        setIsEditing(false);
    };

    return (
        <>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors group">
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <DatabaseIcon className="h-5 w-5 text-slate-500" />
                    </div>
                    {isEditing ? (
                        <input value={name} onChange={e=>setName(e.target.value)} className="flex-1 max-w-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold" autoFocus />
                    ) : (
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{center.name}</span>
                    )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isEditing ? (
                        <button onClick={handleSave} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><PlusIcon className="h-4 w-4 rotate-45" /></button>
                    ) : (
                        <button onClick={()=>setIsEditing(true)} className="p-2 text-slate-400 hover:text-[#0D9488] rounded-lg"><EditIcon className="h-4 w-4" /></button>
                    )}
                    <button onClick={()=>setDelOpen(true)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg"><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
            <Modal isOpen={delOpen} onClose={()=>setDelOpen(false)} title="Excluir Centro de Custo" size="sm">
                <div className="space-y-4 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Deseja excluir o centro de custo **{center.name}**?</p>
                    <div className="flex justify-center gap-3">
                        <button onClick={()=>setDelOpen(false)} className="px-4 py-2 rounded-xl font-bold bg-slate-100 text-slate-600">Cancelar</button>
                        <button onClick={()=>{onDelete(center.id); setDelOpen(false);}} className="px-4 py-2 rounded-xl font-bold bg-red-600 text-white shadow-lg shadow-red-200/20">Excluir</button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

const PreferencesPanel: React.FC<{ categories: Category[]; accounts: BankAccount[] }> = ({ categories, accounts }) => {
    const { isMei, toggleMei, meiOpeningDate, setMeiOpeningDate, userPreferences, updateUserPreferences, planInfo, subscriptionInfo } = useFinancialData() as any;
    const [filter, setFilter] = useState('');

    const updatePref = (key: string, val: any) => {
        updateUserPreferences({ [key]: val });
    };

    // MEI toggle is only available for Plus or Trial users
    const planTier = String(planInfo?.tier || 'starter').toLowerCase();
    const isTrial = subscriptionInfo?.billing_period === 'trial' || subscriptionInfo?.isTrial;
    const canToggleMei = planTier === 'plus' || isTrial;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Search Header */}
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <Input 
                    type="text" 
                    placeholder="Buscar configuração..." 
                    value={filter}
                    onChange={e=>setFilter(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Professional Profile Selection - Only show for Plus/Trial */}
                {canToggleMei && (
                <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Perfil Profissional</h4>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tight">Habilite recursos especializados para Microempreendedor Individual</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${isMei ? 'text-emerald-500' : 'text-slate-400'}`}>
                                {isMei ? 'Modo MEI Ativado' : 'Perfil Pessoal'}
                            </span>
                            <button 
                                onClick={() => toggleMei()} 
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isMei ? 'bg-[#0D9488]' : 'bg-slate-200 dark:bg-slate-800'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMei ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>
                )}

                {/* MEI Section - Note: Managed via profile (PF vs MEI) */}
                {isMei && (
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Configurações MEI</h4>
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white uppercase tracking-tighter">Ativo</span>
                        </div>
                        <div className="space-y-3 animate-fade-in">
                            <FormField label="Data de Abertura">
                                <Input 
                                    type="date" 
                                    value={meiOpeningDate || ''} 
                                    onChange={e=>setMeiOpeningDate(e.target.value)}
                                />
                            </FormField>
                        </div>
                    </div>
                )}

                {/* Climate Section */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Clima e Localização</h4>
                    <div className="space-y-3">
                        <Select 
                            value={userPreferences?.weatherMode || 'auto'} 
                            onChange={e=>updatePref('weatherMode', e.target.value)}
                        >
                            <option value="auto">Automático (IP)</option>
                            <option value="geo">Geolocalização (Navegador)</option>
                            <option value="fixed">Cidade Fixa</option>
                        </Select>
                        {userPreferences?.weatherMode === 'fixed' && (
                            <Input 
                                type="text" 
                                placeholder="Nome da Cidade" 
                                value={userPreferences?.weatherCity || ''} 
                                onChange={e=>updatePref('weatherCity', e.target.value)}
                            />
                        )}
                    </div>
                </div>

                {/* Smart Prefs */}
                <div className="md:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Preferências Inteligentes (Lançamento Rápido)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <FormField label="Categoria Padrão">
                            <Select 
                                value={userPreferences?.smartCategoryPrefs?.Default || ''} 
                                onChange={e=>updatePref('smartCategoryPrefs', { ...userPreferences?.smartCategoryPrefs, Default: e.target.value })}
                            >
                                <option value="">Nenhuma</option>
                                {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                            </Select>
                        </FormField>
                        <FormField label="Conta Padrão">
                            <Select 
                                value={userPreferences?.smartAccountPrefs?.Default || ''} 
                                onChange={e=>updatePref('smartAccountPrefs', { ...userPreferences?.smartAccountPrefs, Default: e.target.value })}
                            >
                                <option value="">Nenhuma</option>
                                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                            </Select>
                        </FormField>
                        <FormField label="Método Padrão">
                            <Select 
                                value={userPreferences?.smartPaymentPrefs?.Default || 'Pix'} 
                                onChange={e=>updatePref('smartPaymentPrefs', { ...userPreferences?.smartPaymentPrefs, Default: e.target.value })}
                            >
                                <option value="Pix">Pix</option>
                                <option value="Crédito">Crédito</option>
                                <option value="Débito">Débito</option>
                                <option value="Espécie">Dinheiro</option>
                            </Select>
                        </FormField>
                    </div>
                </div>

                {/* Report Profile Section */}
                <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dados do Relatório</h4>
                        <span className="text-[9px] font-bold text-indigo-500 uppercase italic">Aparecem no cabeçalho de impressão</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-8">
                            <FormField label="Razão Social / Nome Completo">
                                <Input 
                                    value={userPreferences?.reportProfile?.companyName || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, companyName: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-4">
                            <FormField label="CNPJ / CPF">
                                <Input 
                                    value={userPreferences?.reportProfile?.cnpj || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, cnpj: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-6">
                            <FormField label="E-mail de Contato">
                                <Input 
                                    value={userPreferences?.reportProfile?.email || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, email: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-6">
                            <FormField label="Telefone">
                                <Input 
                                    value={userPreferences?.reportProfile?.phone || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, phone: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-12">
                            <FormField label="Endereço">
                                <Input 
                                    value={userPreferences?.reportProfile?.addressLine1 || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, addressLine1: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-6">
                            <FormField label="Cidade">
                                <Input 
                                    value={userPreferences?.reportProfile?.city || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, city: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-3">
                            <FormField label="UF">
                                <Input 
                                    value={userPreferences?.reportProfile?.state || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, state: e.target.value })}
                                />
                            </FormField>
                        </div>
                        <div className="md:col-span-3">
                            <FormField label="CEP">
                                <Input 
                                    value={userPreferences?.reportProfile?.zip || ''} 
                                    onChange={e=>updatePref('reportProfile', { ...userPreferences?.reportProfile, zip: e.target.value })}
                                />
                            </FormField>
                        </div>
                    </div>
                </div>

                {/* Alerts Section */}
                <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Alertas e Limiares</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField label="Atenção nas Metas (%)" helperText="Padrão: 90%. Alerta quando o progresso atinge este valor.">
                            <Input 
                                type="number"
                                min="10"
                                max="100"
                                value={userPreferences?.goalThreshold || 90} 
                                onChange={e=>updatePref('goalThreshold', Number(e.target.value))}
                            />
                        </FormField>
                        <FormField label="Alerta de Orçamento (%)" helperText="Padrão: 90%. Alerta quando o gasto da categoria atinge o limite.">
                            <Input 
                                type="number"
                                min="10"
                                max="100"
                                value={userPreferences?.budgetThreshold || 90} 
                                onChange={e=>updatePref('budgetThreshold', Number(e.target.value))}
                            />
                        </FormField>
                    </div>
                </div>
            </div>
        </div>
    );
};



export const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    onUpgrade,
    initialTab = 'categories', 
    title = 'Configurações',
    size = 'xl',
    variant = 'overlay'
}) => {
    const { 
        categories, addCategory, updateCategory, deleteCategory,
        accounts, addAccount, updateAccount, deleteAccount,
        costCenters, addCostCenter, updateCostCenter, deleteCostCenter,
        exportData, importData,
        viewMode, organizationInfo, planInfo, subscriptionInfo, usage, entitlements, isMei
    } = useFinancialData();
    const { user, updateProfile, signOut } = useAuth();
    const { showToast } = useToast();
    
    const [activeTab, setActiveTab] = useState(initialTab || 'account');
    const [newCat, setNewCat] = useState<{ name: string; type: 'Entrada' | 'Saída'; icon: string; budget: string; meiCategory?: Category['meiCategory'] }>({ name: '', type: 'Saída', icon: '', budget: '', meiCategory: undefined });
    const [emojiFilter, setEmojiFilter] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
    const [restoreContent, setRestoreContent] = useState<string | null>(null);
    const [logoutBusy, setLogoutBusy] = useState(false);

    // Profile Edit State
    const [profName, setProfName] = useState(user?.fullName || '');
    const [profDoc, setProfDoc] = useState(user?.document || '');
    const [profType, setProfType] = useState(user?.businessProfile || 'pf');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setProfName(user.fullName || '');
            setProfDoc(user.document || '');
            setProfType(user.businessProfile || 'pf');
        }
    }, [user, isOpen]);

    const handleSaveProfile = async () => {
        try {
            setIsSaving(true);
            await updateProfile({ fullName: profName, document: profDoc, businessProfile: profType });
            showToast('Perfil atualizado com sucesso!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Erro ao atualizar perfil', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Form States
    const [newAcc, setNewAcc] = useState({ name: '', bank: '', balance: '' });
    const [newCC, setNewCC] = useState({ name: '', scope: viewMode === 'organization' ? 'org' : 'personal' });

    useEffect(() => { if (isOpen) setActiveTab(initialTab); }, [isOpen, initialTab]);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                setRestoreContent(re.target?.result as string);
                setRestoreConfirmOpen(true);
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

    const sections = [
        { 
            group: 'Sua Conta', 
            items: [
                { id: 'account', label: 'Minha Conta', icon: <UsersIcon className="h-4 w-4" /> },
            ]
        },
        {
            group: 'Financeiro',
            items: [
                { id: 'accounts', label: 'Contas Bancárias', icon: <BankIcon className="h-4 w-4" /> },
                { id: 'costCenters', label: 'Centros de Custo', icon: <FolderIcon className="h-4 w-4" /> },
            ]
        },
        {
            group: 'Taxonomia',
            items: [
                { id: 'categories', label: 'Categorias', icon: <PlusIcon className="h-4 w-4" /> },
            ]
        },
        {
            group: 'Preferências',
            items: [
                { id: 'preferences', label: 'Configurações de UI', icon: <SettingsIcon className="h-4 w-4" /> },
                { id: 'backup', label: 'Dados e Backup', icon: <ArrowDownIcon className="h-4 w-4" /> },
            ]
        }
    ];

    const currentItem = useMemo(() => {
        for (const s of sections) {
            const match = s.items.find(i => i.id === activeTab);
            if (match) return match;
        }
        return sections[0].items[0];
    }, [activeTab, sections]);

    const content = (
        <div className={`flex ${variant === 'inline' ? 'h-full' : 'h-[80vh] min-h-[600px] max-h-[850px] overflow-hidden'}`}>
            {/* Left Sidebar Navigation */}
            <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/40 flex flex-col pt-4 overflow-y-auto no-scrollbar">
                <div className="px-4 mb-6">
                    <h2 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-4">Central de Controle</h2>
                    <div className="space-y-6">
                        {sections.map((section) => (
                            <div key={section.group}>
                                <div className="px-2 mb-2">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">{section.group}</span>
                                </div>
                                <div className="space-y-1">
                                    {section.items.map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all ${
                                                activeTab === tab.id 
                                                    ? 'bg-[#0D9488] text-white shadow-lg shadow-[#0D9488]/20' 
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-[#0D9488] dark:hover:text-[#0D9488]/80 hover:bg-white dark:hover:bg-slate-900 shadow-none'
                                            }`}
                                        >
                                            <div className={`${activeTab === tab.id ? 'text-white' : 'text-slate-400 group-hover:text-[#0D9488]'}`}>
                                                {tab.icon}
                                            </div>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-900">
                    <button 
                        onClick={async () => { setLogoutBusy(true); await signOut(); setLogoutBusy(false); }}
                        disabled={logoutBusy}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all disabled:opacity-50"
                    >
                        <TrashIcon className="h-4 w-4" />
                        {logoutBusy ? 'Saindo...' : 'Encerrar Sessão'}
                    </button>
                </div>
            </div>

            {/* Right Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-transparent">
                <div className="p-4 lg:p-8 w-full space-y-10">
                    {/* Panel Header */}
                    <div className="flex flex-col gap-1 border-b border-slate-100 dark:border-slate-800 pb-6">
                        <div className="flex items-center gap-3 text-[#0D9488]">
                            {currentItem.icon}
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">{currentItem.label}</h3>
                        </div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Gerencie suas definições de {currentItem.label.toLowerCase()} do sistema.</p>
                    </div>

                    <div className="animate-fade-in-up">
                        {activeTab === 'categories' && (
                            <div className="space-y-8 w-full">
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none">
                                    <div className="flex items-center justify-between mb-6 px-1">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-[#0D9488] animate-pulse"></div>
                                            <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Configurar Nova Categoria</h3>
                                        </div>
                                        <div className="h-px flex-1 bg-slate-100/60 dark:bg-slate-800/60 mx-6"></div>
                                    </div>
                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        if (newCat.name.trim()) {
                                            addCategory({ 
                                                name: newCat.name.trim(), 
                                                type: newCat.type, 
                                                icon: newCat.icon,
                                                budget: newCat.budget ? toNumberPtBr(newCat.budget) : undefined,
                                                meiCategory: newCat.type === 'Entrada' ? newCat.meiCategory : undefined
                                            });
                                            setNewCat({ name: '', type: 'Saída', icon: '', budget: '', meiCategory: undefined });
                                        }
                                    }} className="flex flex-col md:flex-row gap-3">
                                        <div className="flex-[0.8] relative group">
                                            <input type="text" value={emojiFilter} onChange={e=>setEmojiFilter(e.target.value)} placeholder="🔍" className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-1 text-center text-lg focus:ring-4 focus:ring-[#0D9488]/10 outline-none transition-all group-hover:border-[#0D9488] dark:group-hover:border-[#0D9488]/40" />
                                        </div>
                                        <div className="flex-[1.5]">
                                            <select value={newCat.icon} onChange={e=>setNewCat({...newCat, icon: e.target.value})} className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 text-xs font-bold focus:ring-4 focus:ring-[#0D9488]/10 outline-none appearance-none transition-all cursor-pointer">
                                                <option value="">Emoji...</option>
                                                {DEFAULT_CATEGORY_EMOJIS.filter(opt => !emojiFilter || opt.label.toLowerCase().includes(emojiFilter.toLowerCase()) || opt.emoji.includes(emojiFilter)).map(opt => (
                                                    <option key={opt.emoji} value={opt.emoji}>{opt.emoji} {opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex-[4]">
                                            <input type="text" value={newCat.name} onChange={e=>setNewCat({...newCat, name: e.target.value})} placeholder="Nome da Categoria (Ex: Alimentação)" className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 text-xs font-bold focus:ring-4 focus:ring-[#0D9488]/10 outline-none transition-all" required />
                                        </div>
                                        <div className="flex-[3]">
                                            <select value={newCat.type} onChange={e=>setNewCat({...newCat, type: e.target.value as 'Entrada' | 'Saída', meiCategory: e.target.value === 'Entrada' ? newCat.meiCategory : undefined})} className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-[#0D9488]/10 outline-none appearance-none transition-all cursor-pointer">
                                                <option value="Saída">↘ Despesa</option>
                                                <option value="Entrada">↗ Receita</option>
                                            </select>
                                        </div>
                                        {isMei && newCat.type === 'Entrada' && (
                                            <div className="flex-[3]">
                                                <select value={newCat.meiCategory || ''} onChange={e=>setNewCat({...newCat, meiCategory: (e.target.value || undefined) as Category['meiCategory']})} className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-[#0D9488]/10 outline-none appearance-none transition-all cursor-pointer">
                                                    <option value="">Atividade MEI (opcional)</option>
                                                    <option value="commerce">Comércio</option>
                                                    <option value="industry">Indústria</option>
                                                    <option value="service">Serviços</option>
                                                    <option value="transport">Transporte</option>
                                                </select>
                                            </div>
                                        )}
                                        <button type="submit" className="h-12 px-8 bg-[#0D9488] text-white rounded-2xl hover:bg-[#0F766E] shadow-lg shadow-[#0D9488]/20 dark:shadow-none active:scale-95 transition-all text-[10px] font-black uppercase tracking-[0.2em] flex-none">Cadastrar</button>
                                    </form>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex flex-col h-[480px]">
                                        <div className="flex items-center justify-between mb-2 px-2">
                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Receitas ({categories.filter(c => c.type === 'Entrada').length})</span>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm overflow-hidden flex flex-col">
                                            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/40">
                                                {categories.filter(c => c.type === 'Entrada').length > 0 ? (
                                                    categories.filter(c => c.type === 'Entrada').map(cat => <CategoryRow key={cat.id} category={cat} onUpdate={updateCategory} onDelete={deleteCategory} />)
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-700 space-y-2">
                                                        <PlusIcon className="h-8 w-8 opacity-20" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">Vazio</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-[480px]">
                                        <div className="flex items-center justify-between mb-2 px-2">
                                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Despesas ({categories.filter(c => c.type === 'Saída').length})</span>
                                        </div>
                                        <div className="flex-1 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm overflow-hidden flex flex-col">
                                            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/40">
                                                {categories.filter(c => c.type === 'Saída').length > 0 ? (
                                                    categories.filter(c => c.type === 'Saída').map(cat => <CategoryRow key={cat.id} category={cat} onUpdate={updateCategory} onDelete={deleteCategory} />)
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-700 space-y-2">
                                                        <PlusIcon className="h-8 w-8 opacity-20" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest">Vazio</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'accounts' && (
                            <div className="space-y-10">
                                <FormSection title="Contas e Carteiras" description="Adicione suas contas bancárias, caixas em espécie ou carteiras de corretora.">
                                    <div className="bg-white dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Nova Conta Bancária</h3>
                                        <form onSubmit={(e) => {
                                            e.preventDefault();
                                            if (newAcc.name && newAcc.bank && newAcc.balance) {
                                                addAccount({ name: newAcc.name.trim(), bank: newAcc.bank.trim(), initialBalance: toNumberPtBr(newAcc.balance) });
                                                setNewAcc({ name: '', bank: '', balance: '' });
                                            }
                                        }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <input value={newAcc.name} onChange={e=>setNewAcc({...newAcc, name: e.target.value})} placeholder="Nome (Ex: Principal)" className="h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" required />
                                            <input value={newAcc.bank} onChange={e=>setNewAcc({...newAcc, bank: e.target.value})} placeholder="Banco (Ex: Nubank)" className="h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" required />
                                            <div className="flex gap-2">
                                                <input value={newAcc.balance} onChange={e=>setNewAcc({...newAcc, balance: formatInputMoney(e.target.value)})} placeholder="Saldo Inicial" className="h-11 flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-black text-emerald-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" required />
                                                <button type="submit" className="h-11 w-11 flex items-center justify-center bg-[#0D9488] text-white rounded-xl hover:bg-[#0F766E] shadow-lg shadow-[#0D9488]/20 dark:shadow-none transition-all"><PlusIcon className="h-5 w-5" /></button>
                                            </div>
                                        </form>
                                    </div>
                                </FormSection>
                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {accounts.map(acc => <AccountRow key={acc.id} account={acc} onUpdate={updateAccount} onDelete={deleteAccount} />)}
                                </div>
                            </div>
                        )}

                        {activeTab === 'costCenters' && (
                            <div className="space-y-10">
                                <FormSection title="Centros de Custo" description="Ideal para separar despesas Fixas de Variáveis ou projetos específicos.">
                                    <div className="bg-white dark:bg-slate-900/40 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Novo Centro de Custo</h3>
                                        <form onSubmit={(e) => {
                                            e.preventDefault();
                                            if (newCC.name.trim()) {
                                                addCostCenter({ name: newCC.name.trim(), scope: newCC.scope as any });
                                                setNewCC({ ...newCC, name: '' });
                                            }
                                        }} className="flex gap-3">
                                            <input value={newCC.name} onChange={e=>setNewCC({...newCC, name: e.target.value})} placeholder="Nome (Ex: Marketing, Infraestrutura...)" className="h-11 flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" required />
                                            <select value={newCC.scope} onChange={e=>setNewCC({...newCC, scope: e.target.value as any})} className="h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white outline-none">
                                                <option value="personal">Pessoal</option>
                                                <option value="org">Empresa</option>
                                            </select>
                                            <button type="submit" className="h-11 w-11 flex items-center justify-center bg-[#0D9488] text-white rounded-xl hover:bg-[#0F766E] shadow-lg shadow-[#0D9488]/20 dark:shadow-none transition-all"><PlusIcon className="h-5 w-5" /></button>
                                        </form>
                                    </div>
                                </FormSection>
                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {costCenters.map(cc => <CostCenterRow key={cc.id} center={cc} onUpdate={updateCostCenter} onDelete={deleteCostCenter} />)}
                                </div>
                            </div>
                        )}

                        {activeTab === 'preferences' && <PreferencesPanel categories={categories} accounts={accounts} />}

                        {activeTab === 'backup' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-6">
                                    <div className="w-20 h-20 bg-[#0D9488]/10 dark:bg-[#0D9488]/15 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-[#0D9488]/25">
                                        <ArrowDownIcon className="h-10 w-10 text-[#0D9488]" />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Exportar Backup</h4>
                                        <p className="text-xs font-medium text-slate-500 mt-2">Baixe todos os seus dados em formato JSON para portabilidade.</p>
                                    </div>
                                    <button onClick={exportData} className="w-full py-4 bg-[#0D9488] text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-[#0F766E] shadow-lg shadow-[#0D9488]/20 active:scale-95 transition-all">Baixar Arquivo .JSON</button>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-6">
                                    <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-emerald-500/10">
                                        <UploadIcon className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Importar Backup</h4>
                                        <p className="text-xs font-medium text-slate-500 mt-2">Restaure sua conta a partir de um arquivo gerado anteriormente.</p>
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
                                    <button onClick={()=>fileInputRef.current?.click()} className="w-full py-4 bg-slate-900 dark:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-black dark:hover:bg-emerald-700 transition-all active:scale-95">Selecionar Arquivo</button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'account' && (
                            <div className="space-y-8 animate-fade-in-up">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                    {/* Profile Info - Left Side */}
                                    <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-4xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
                                        <div className="flex items-center gap-6 mb-8 border-b border-slate-100 dark:border-slate-800 pb-8">
                                            <div className="w-20 h-20 bg-[#0D9488] rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-[#0D9488]/40 dark:shadow-none">
                                                {user?.email?.[0].toUpperCase() || 'U'}
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{user?.email || 'Usuário'}</h4>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-md">Verificado</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{user?.businessProfile || 'PF'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                                                <input type="text" value={profName} onChange={e=>setProfName(e.target.value)} placeholder="Seu nome..." className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                                                <input type="text" value={profDoc} onChange={e=>setProfDoc(e.target.value)} placeholder="000.000.000-00" className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-[#0D9488]/20 outline-none" />
                                            </div>
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Perfil de Uso (Configura a Interface)</label>
                                                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl">
                                                    {[
                                                        { id: 'pf', label: 'Pessoal (PF)', visible: true },
                                                        { id: 'mei', label: 'Dashboard MEI', visible: planInfo?.tier === 'plus' || (subscriptionInfo?.billing_period === 'trial' || subscriptionInfo?.isTrial) },
                                                        { id: 'empresa', label: 'Gestão Business', visible: planInfo?.tier === 'pro' || (subscriptionInfo?.billing_period === 'trial' || subscriptionInfo?.isTrial) }
                                                    ].filter(opt => opt.visible).map(type => (
                                                        <button
                                                            key={type.id}
                                                            type="button"
                                                            onClick={() => setProfType(type.id)}
                                                            className={`py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${
                                                                profType === type.id 
                                                                ? 'bg-[#0D9488] text-white shadow-lg shadow-[#0D9488]/40 dark:shadow-none' 
                                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                            }`}
                                                        >
                                                            {type.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 ml-1">* Mudar o perfil altera quais módulos e relatórios ficam visíveis no menu lateral.</p>
                                            </div>

                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Email Principal (Não Alterável)</label>
                                                <input type="email" value={user?.email || ''} readOnly className="w-full h-11 bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm font-bold text-slate-400 cursor-not-allowed outline-none" />
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleSaveProfile}
                                            disabled={isSaving}
                                            className="mt-8 px-6 py-3 bg-[#0D9488] text-white font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-[#0F766E] transition-all active:scale-95 shadow-lg shadow-[#0D9488]/20 disabled:opacity-50"
                                        >
                                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                        </button>
                                    </div>

                                    {/* Subscription Status - Right Side */}
                                    <div className="lg:col-span-5 space-y-6">
                                        <div className={`p-8 rounded-4xl text-white shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[320px] transition-all ${
                                            subscriptionInfo?.isTrial ? 'bg-gradient-to-br from-[#0D9488] to-[#0F766E]' :
                                            subscriptionInfo?.isInsideGrace ? 'bg-amber-600' :
                                            subscriptionInfo?.isTotalBlocked ? 'bg-red-600' : 'bg-slate-900 border border-slate-700'
                                        }`}>
                                            <div className="absolute top-0 right-0 p-4">
                                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                                    <CalendarIcon className="h-5 w-5" />
                                                </div>
                                            </div>
                                            <div className="relative z-10">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">
                                                    {subscriptionInfo?.isTrial ? 'Período de Testes' : 'Plano Atual'}
                                                </h4>
                                                <div className="text-4xl font-black tracking-tight uppercase">
                                                    {subscriptionInfo?.isTrial ? 'Trial PRO' : (planInfo?.name || 'Starter')}
                                                </div>
                                            </div>
                                            
                                            <div className="relative z-10 space-y-4">
                                                <div className="flex items-center justify-between text-xs font-bold border-b border-white/10 pb-4">
                                                    <span className="opacity-60">Status</span>
                                                    <span className={`px-2 py-0.5 rounded uppercase text-[10px] font-black ${
                                                        subscriptionInfo?.isTrial ? 'bg-emerald-400 text-slate-900' :
                                                        subscriptionInfo?.isInsideGrace ? 'bg-white text-amber-700' :
                                                        subscriptionInfo?.isTotalBlocked ? 'bg-white text-red-700' : 'bg-emerald-400 text-slate-900'
                                                    }`}>
                                                        {subscriptionInfo?.isTrial ? 'Experimental' : 
                                                         subscriptionInfo?.isInsideGrace ? 'Período de Graça' :
                                                         subscriptionInfo?.isTotalBlocked ? 'Bloqueado' : 'Ativo'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-bold border-b border-white/10 pb-4">
                                                    <span className="opacity-60">
                                                        {subscriptionInfo?.isExpired ? 'Expirou em' : 'Expira em'}
                                                    </span>
                                                    <span>
                                                        {subscriptionInfo?.periodEnd ? new Date(subscriptionInfo.periodEnd).toLocaleDateString('pt-BR') : 'Sem data'}
                                                    </span>
                                                </div>
                                                {subscriptionInfo?.isInsideGrace && (
                                                    <div className="flex items-center justify-between text-xs font-bold border-b border-white/10 pb-4 text-white">
                                                        <span className="opacity-60">Fim da Graça</span>
                                                        <span className="animate-pulse">{subscriptionInfo?.gracePeriodDays} dias restantes</span>
                                                    </div>
                                                )}
                                            </div>

                                            <button 
                                                onClick={() => onUpgrade?.('pro')}
                                                className="relative z-10 w-full py-4 bg-white text-[#0D9488] font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-50 transition-all active:scale-95"
                                            >
                                                {subscriptionInfo?.isExpired ? 'Assinar Agora' : 'Alterar Plano'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Usage Section */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estatísticas de Uso e Limites</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 transition-all hover:border-[#0D9488]/40 dark:hover:border-[#0D9488]/30 shadow-sm hover:shadow-xl hover:shadow-[#0D9488]/10 dark:shadow-none translate-y-0 hover:-translate-y-1">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Usuários (Seats)</div>
                                            <div className="text-3xl font-black text-slate-900 dark:text-white">
                                                {/* usedSeats = membros ativos; seats = total contratado */}
                                                {String(organizationInfo?.usedSeats ?? 0).padStart(2, '0')}
                                                <span className="text-sm font-bold text-slate-400"> / {String(organizationInfo?.seats || entitlements?.limits?.users || 1).padStart(2, '0')} contratados</span>
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                                {(() => {
                                                    const used = organizationInfo?.usedSeats ?? 0;
                                                    const total = organizationInfo?.seats || entitlements?.limits?.users || 1;
                                                    const free = total - used;
                                                    return free > 0 ? `${free} assento(s) livre(s)` : 'Todos os assentos ocupados';
                                                })()}
                                            </div>
                                            <div className="mt-3 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-50 dark:border-slate-950">
                                                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(100, ((organizationInfo?.usedSeats ?? 0) / Math.max(1, organizationInfo?.seats || entitlements?.limits?.users || 1)) * 100)}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 transition-all hover:border-[#0D9488]/40 dark:hover:border-[#0D9488]/30 shadow-sm hover:shadow-xl hover:shadow-[#0D9488]/10 dark:shadow-none translate-y-0 hover:-translate-y-1">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Lançamentos / Mês</div>
                                            <div className="text-3xl font-black text-slate-900 dark:text-white">
                                                {usage?.transactionsUsed || 0} 
                                                <span className="text-sm font-bold text-slate-400"> / {entitlements?.limits?.transactionsPerMonth >= 1000000 ? '∞' : (entitlements?.limits?.transactionsPerMonth || 0)}</span>
                                            </div>
                                            <div className="mt-4 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-50 dark:border-slate-950">
                                                <div className={`h-full transition-all duration-1000 ${((usage?.transactionsUsed || 0) / (entitlements?.limits?.transactionsPerMonth || 1) > 0.9) ? 'bg-rose-500 animate-pulse' : 'bg-[#0D9488]'}`} style={{ width: `${Math.min(100, ((usage?.transactionsUsed || 0) / (entitlements?.limits?.transactionsPerMonth || 1)) * 100)}%` }}></div>
                                            </div>
                                        </div>
                                        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 transition-all hover:border-[#0D9488]/40 dark:hover:border-[#0D9488]/30 shadow-sm hover:shadow-xl hover:shadow-[#0D9488]/10 dark:shadow-none translate-y-0 hover:-translate-y-1">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Cofre (DocsVault)</div>
                                            <div className="text-3xl font-black text-slate-900 dark:text-white">
                                                {usage?.storageUsed > 1024 * 1024 * 1024 
                                                    ? `${(usage.storageUsed / (1024 * 1024 * 1024)).toFixed(1)} GB`
                                                    : `${(usage?.storageUsed / (1024 * 1024)).toFixed(1)} MB`
                                                }
                                                <span className="text-sm font-bold text-slate-400"> / 
                                                    {(entitlements?.limits?.storageLimit ?? 0) >= 1024 * 1024 * 1024
                                                        ? ` ${((entitlements?.limits?.storageLimit ?? 0) / (1024 * 1024 * 1024)).toFixed(0)} GB`
                                                        : ` ${((entitlements?.limits?.storageLimit ?? 0) / (1024 * 1024)).toFixed(0)} MB`
                                                    }
                                                </span>
                                            </div>
                                            <div className="mt-4 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-50 dark:border-slate-950">
                                                <div className={`h-full transition-all duration-1000 ${((usage?.storageUsed || 0) / (entitlements?.limits?.storageLimit || 1) > 0.9) ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, ((usage?.storageUsed || 0) / (entitlements?.limits?.storageLimit || 1)) * 100)}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                                    <p className="text-xs font-bold text-slate-400 italic">Deseja encerrar sua conta permanentemente? <button className="text-rose-500 hover:underline">Clique aqui</button></p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            {variant === 'inline' ? (
                <div className="w-full h-full bg-transparent">
                    {content}
                </div>
            ) : (
                <Modal isOpen={isOpen} onClose={onClose} title={title} size={size}>
                    {content}
                </Modal>
            )}

            {/* Global Modals for Confirmation */}
            <Modal isOpen={restoreConfirmOpen} onClose={() => setRestoreConfirmOpen(false)} title="Confirmar Restauração" size="sm">
                <div className="space-y-4 text-center p-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">Esta ação substituirá **TODOS** os seus dados atuais. Esta operação é irreversível.</p>
                    <div className="flex flex-col gap-2 pt-2">
                        <button onClick={async () => {
                            if (restoreContent) {
                                await importData(restoreContent);
                                showToast('Sincronização concluída com sucesso', 'success');
                                setRestoreConfirmOpen(false);
                            }
                        }} className="w-full py-3 rounded-xl font-bold bg-[#0D9488] text-white shadow-lg shadow-[#0D9488]/20">Restaurar Agora</button>
                        <button onClick={() => setRestoreConfirmOpen(false)} className="w-full py-3 rounded-xl font-bold bg-slate-100 text-slate-600">Cancelar</button>
                    </div>
                </div>
            </Modal>
        </>
    );
};
