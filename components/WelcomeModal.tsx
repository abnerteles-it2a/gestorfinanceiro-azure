import React, { useState } from 'react';
import { Modal } from './shared/Modal';
import { BoltIcon, ChatBubbleLeftRightIcon, SettingsIcon, SparklesIcon, CheckCircleIcon } from './icons';
import { useFinancialData } from '../context/FinancialDataContext';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
    const { updateUserPreferences } = useFinancialData();
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const handleClose = async () => {
        if (dontShowAgain) {
            await updateUserPreferences({ welcome_dismissed: true });
        }
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Bem-vindo ao Gestor Financeiro! 🚀"
            size="lg"
        >
            <div className="space-y-6">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/40">
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
                        Estamos felizes em tê-lo aqui! Para garantir que você aproveite ao máximo nossa plataforma, preparamos este guia rápido para o seu setup inicial.
                    </p>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-3 italic">
                        <SparklesIcon className="h-5 w-5 animate-pulse" />
                        Acesso Total PRO (14 Dias)
                    </h3>
                    <div className="pl-8 space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            Você está em modo <strong>Pessoal (PF)</strong> por padrão. Quer testar o <strong>Painel MEI</strong> ou a <strong>Gestão Corporativa</strong>?
                        </p>
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/40">
                           <p className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
                               💡 Vá em CONFIGURAÇÕES &gt; PERFIL e experimente trocar de perfil para ver como o sistema se adapta ao seu negócio!
                           </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-black">1</span>
                        Os Três Pilares Essenciais
                    </h3>
                    <div className="pl-10 space-y-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            Para começar a lançar suas finanças com precisão, você precisará cadastrar:
                        </p>
                        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <li className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="text-indigo-500">🏦</span> Contas
                            </li>
                            <li className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="text-indigo-500">📁</span> Categorias
                            </li>
                            <li className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span className="text-indigo-500">🏷️</span> Centros de Custo
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 text-xs font-black">2</span>
                        Onde Configurar?
                    </h3>
                    <div className="pl-10 space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            Tudo é gerido no menu de <strong>Configurações</strong> localizado no topo do sistema (ícone da engrenagem <SettingsIcon className="inline h-4 w-4 mb-0.5" />).
                        </p>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                                <SettingsIcon className="h-4 w-4 text-slate-400" />
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                                Abra as configurações e navegue pelas abas para cadastrar suas contas bancárias, categorias e centros de custo.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs font-black">3</span>
                        O Atalho Inteligente
                    </h3>
                    <div className="pl-10 space-y-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            No canto inferior direito, você tem o <strong>Concierge IA</strong>. Em vez de navegar por menus, você pode:
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center gap-4 p-4 bg-slate-900 text-white rounded-2xl shadow-lg border border-slate-800">
                                <div className="p-2 bg-indigo-500 rounded-lg">
                                    <SparklesIcon className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-indigo-400 tracking-widest">Concierge IA</p>
                                    <p className="text-[11px] font-medium leading-relaxed">"Abra o chat e use os <strong>Comandos Rápidos</strong> para criar itens instantaneamente."</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <input 
                                type="checkbox" 
                                checked={dontShowAgain}
                                onChange={(e) => setDontShowAgain(e.target.checked)}
                                className="peer h-5 w-5 opacity-0 absolute cursor-pointer"
                            />
                            <div className="h-5 w-5 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-md peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center">
                                <CheckCircleIcon className="h-3.5 w-3.5 text-white scale-0 peer-checked:scale-100 transition-transform" />
                            </div>
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 transition-colors">
                            Concluí meu setup, não mostrar mais.
                        </span>
                    </label>

                    <button
                        onClick={handleClose}
                        className="w-full sm:w-auto px-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-indigo-200 dark:shadow-none hover:-translate-y-0.5 active:scale-95"
                    >
                        Entendido, vamos lá!
                    </button>
                </div>
            </div>
        </Modal>
    );
};
