
import React, { useEffect, useState } from 'react';
import { SettingsIcon, SunIcon, MoonIcon, EyeIcon, EyeSlashIcon, SparklesIcon } from './icons';
import { useTheme } from '../context/ThemeContext';
import { useFinancialData } from '../context/FinancialDataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { HelpChatbot } from './HelpChatbot';
import { InviteReceiver } from './InviteReceiver';

type ActiveView = 'home' | 'dashboard' | 'cashflow' | 'investments' | 'admin' | 'orgAdmin' | 'financeAccounting' | 'docsVault' | 'reports' | 'settings' | 'checkout' | 'support';

interface HeaderProps {
    activeView: ActiveView;
    setActiveView: (view: ActiveView) => void;
    onOpenSettings: () => void;
    onUpgrade?: (tier?: string) => void;
    hideBar?: boolean; // When true, hides the top action bar but keeps subscription banners
    moduleTitle?: string;
}

const VIEW_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    cashflow: 'Fluxo de Caixa',
    investments: 'Investimentos',
    financeAccounting: 'Financeiro / Contábil',
    docsVault: 'Cofre de Documentos',
    reports: 'Relatórios',
    admin: 'Painel Administrativo',
    orgAdmin: 'Gestão da Organização',
    settings: 'Configurações',
    checkout: 'Finalizar Assinatura',
    support: 'Suporte & Feedback'
};

export const Header: React.FC<HeaderProps> = ({ activeView, setActiveView, onOpenSettings, onUpgrade, hideBar = false, moduleTitle }) => {
    const { theme, toggleTheme } = useTheme();
    const { 
        isPrivacyMode, togglePrivacyMode, marketDataTs, isMarketLoading, 
        planInfo, orgRole, viewMode, toggleViewMode, organizationInfo, 
        entitlements, usage, userPreferences, isMei, subscriptionInfo 
    } = useFinancialData();
    const { user, isAdmin } = useAuth();
    const { showToast } = useToast();
    
    const showTrialBanner = !!(subscriptionInfo?.isTrial && !subscriptionInfo?.isExpired);
    const showGraceBanner = !!(subscriptionInfo?.isInsideGrace);
    const showExpiredBanner = !!(subscriptionInfo?.isTotalBlocked || (subscriptionInfo?.isExpired && !subscriptionInfo?.isInsideGrace));
    const showOverQuotaBanner = !!(subscriptionInfo?.isOverQuota && !subscriptionInfo?.isExpired);

    const [showLogo, setShowLogo] = useState(true);
    const [logoSrc, setLogoSrc] = useState<string>('/logo.png');
    const [logoErr, setLogoErr] = useState<number>(0);
    const env: any = (import.meta as any)?.env || {};
    const isDev = !!env?.DEV;

    useEffect(() => {
        try { setLogoSrc(theme === 'dark' ? '/logo_white.png' : '/logo.png'); } catch {}
    }, [theme]);

    return (
        <>
            <InviteReceiver />

            {showTrialBanner && (
                <div className="bg-[#0D9488] text-white py-1.5 px-4 text-center text-xs font-bold tracking-wide animate-in slide-in-from-top duration-300">
                    <span className="uppercase">Acesso Total Trial:</span> Você tem {subscriptionInfo?.trialDaysRemaining ?? subscriptionInfo?.gracePeriodDays ?? 14} dias restantes para testar todas as funcionalidades PRO!
                </div>
            )}
            {showGraceBanner && (
                <div className="bg-amber-500 text-white py-1.5 px-4 text-center text-xs font-bold tracking-wide animate-pulse">
                    <span className="uppercase">Assinatura Expirada:</span> Seu período de graça termina em {subscriptionInfo?.gracePeriodDays} dias. <button onClick={() => setActiveView('checkout')} className="underline ml-2">Renovar agora</button>
                </div>
            )}
            {showExpiredBanner && (
                <div className="bg-rose-500 text-white py-1.5 px-4 text-center text-xs font-bold tracking-wide">
                    <span className="uppercase">Assinatura Expirada:</span> Suas funcionalidades foram congeladas. <button onClick={() => setActiveView('checkout')} className="underline ml-2">Regularizar Assinatura</button>
                </div>
            )}
            {showOverQuotaBanner && (
                <div className="bg-orange-500 text-white py-1.5 px-4 text-center text-xs font-bold tracking-wide">
                    <span className="uppercase">Cofre Cheio:</span> Você ultrapassou o limite de armazenamento do seu plano. <button onClick={() => setActiveView('checkout')} className="underline ml-2">Fazer Upgrade</button>
                </div>
            )}

            {!hideBar && (
            <header className="app-topbar no-print bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-30 w-full transition-all duration-300 shadow-xs">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-11 sm:h-12">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {moduleTitle && (
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-slate-700/60 shadow-xs whitespace-nowrap">
                                    {moduleTitle}
                                </span>
                                <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                            </div>
                        )}

                        <div className="hidden sm:flex items-center gap-2 min-w-0">
                            {(() => {
                                const tier = String(planInfo?.tier || '').toLowerCase();
                                if (!tier) return null as any;
                                const map: Record<string, string> = {
                                    starter: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                                    plus: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                                    pro: 'bg-[#0D9488]/10 text-[#0D9488] dark:bg-[#0D9488]/10 dark:text-[#0D9488]',
                                };
                                const cls = map[tier] || map.starter;
                                const label = subscriptionInfo?.isTrial ? 'Trial PRO' : (tier === 'starter' ? 'Starter' : tier === 'plus' ? 'Plus' : 'Pro');
                                return (<span className={`text-[9px] uppercase px-2 py-0.5 rounded font-bold tracking-wider border border-transparent shrink-0 ${cls}`}>{label}</span>);
                            })()}

                            {(() => {
                                const used = Number(usage?.transactionsUsed ?? NaN);
                                const lim = Number(entitlements?.limits?.transactionsPerMonth ?? NaN);
                                if (!Number.isFinite(used) || !Number.isFinite(lim) || lim <= 0) return null as any;
                                const isUnlimited = lim >= 1_000_000;
                                return (
                                  <div className="hidden xl:flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200 dark:border-slate-800 shrink-0" title="Uso de lançamentos no mês">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">LANÇAMENTOS:</span>
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        {used.toLocaleString('pt-BR')} / {isUnlimited ? '∞' : lim.toLocaleString('pt-BR')}
                                    </span>
                                  </div>
                                );
                            })()}
                        </div>
                    </div>


                    <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
                        {(() => {
                            const tier = String(planInfo?.tier || '').toLowerCase();
                            const isTrial = !!subscriptionInfo?.isTrial;
                            if (!organizationInfo) return null;
                            if (tier !== 'pro' && !isTrial) return null;
                            const isOrg = viewMode === 'organization';
                            
                            return (
                                <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-900/60 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                                    <div className="flex p-0.5 gap-1">
                                        <button
                                            onClick={() => viewMode !== 'personal' && toggleViewMode()}
                                            className={`px-3 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all ${
                                                !isOrg 
                                                ? 'bg-white dark:bg-slate-800 shadow-xs text-[#0D9488] dark:text-[#0D9488] ring-1 ring-slate-200/50 dark:ring-white/10' 
                                                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                            }`}
                                        >
                                            Pessoal
                                        </button>
                                        <button
                                            onClick={() => viewMode !== 'organization' && toggleViewMode()}
                                            className={`px-3 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all ${
                                                isOrg 
                                                ? 'bg-white dark:bg-slate-800 shadow-xs text-[#0D9488] dark:text-[#0D9488] ring-1 ring-slate-200/50 dark:ring-white/10' 
                                                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                            }`}
                                            title={organizationInfo.name}
                                        >
                                            Corporativo
                                        </button>
                                    </div>
                                    {isTrial && (
                                        <span className="hidden 2xl:inline text-[8.5px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                            Trial PRO
                                        </span>
                                    )}
                                </div>
                            );
                        })()}


                        {(orgRole === 'owner' || orgRole === 'admin') && organizationInfo && (
                            <button onClick={() => setActiveView('orgAdmin')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 text-xs font-medium md:hidden" aria-label="Organização" title="Painel da Organização">
                                Organização
                            </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => setActiveView('admin')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 text-xs font-medium" aria-label="Admin" title="Admin">
                            Admin
                          </button>
                        )}
                        {activeView === 'investments' && (
                            <span className="hidden lg:inline text-xs text-gray-600 dark:text-slate-400">
                                {isMarketLoading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 dark:border-slate-500 border-t-transparent" />
                                        Atualizando cotações...
                                    </span>
                                ) : (
                                    marketDataTs ? `Atualizado: ${new Date(marketDataTs).toLocaleTimeString()}` : 'Sem atualização'
                                )}
                            </span>
                        )}

                        {(planInfo?.tier === 'plus' || subscriptionInfo?.isTrial) && (
                            <div className="hidden md:flex items-center gap-2 bg-[#0D9488]/10 dark:bg-slate-900/40 px-3 py-1.5 rounded-xl border border-[#0D9488]/20 dark:border-slate-800" title="Ative para habilitar o Painel MEI e Controle de DAS">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#0D9488] dark:text-[#0D9488]">Modo MEI</span>
                                <button 
                                    onClick={async () => {
                                        try {
                                            const newProf = isMei ? 'pf' : 'mei';
                                            const token = window.localStorage.getItem('gestor_financeiro_app_token') || '';
                                            const res = await fetch('/api/neon-auth/update-profile', {
                                                method: 'POST',
                                                headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
                                                body: JSON.stringify({ businessProfile: newProf })
                                            });
                                            if (res.ok) {
                                                showToast(newProf === 'mei' ? 'Painel MEI ativado!' : 'Modo Pessoal ativado!', 'success');
                                                setTimeout(() => window.location.reload(), 600);
                                            } else {
                                                throw new Error('Falha ao atualizar');
                                            }
                                        } catch (e: any) {
                                            showToast('Erro ao alterar modo.', 'error');
                                        }
                                    }}
                                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shadow-inner ${isMei ? 'bg-[#0D9488]' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm ${isMei ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        )}

                        {planInfo?.tier !== 'pro' && !subscriptionInfo?.isTrial && (
                            <button 
                                onClick={() => onUpgrade?.('pro')}
                                className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0D9488] text-white text-[11px] font-black uppercase tracking-wider hover:bg-[#0F766E] hover:shadow-lg hover:shadow-[#0D9488]/20 transition-all hover:-translate-y-0.5 active:scale-95"
                            >
                               <SparklesIcon className="h-3.5 w-3.5" />
                               Upgrade PRO
                            </button>
                        )}
                        {user && (
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('open_command_palette'))}
                                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 transition-all text-xs font-medium active:scale-95"
                                title="Buscar ou executar comando (Ctrl + K)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <span className="hidden sm:inline text-[11px] font-semibold">Comandos</span>
                                <kbd className="hidden lg:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400">
                                    Ctrl K
                                </kbd>
                            </button>
                        )}

                        {user && <HelpChatbot currentView={activeView} variant="header" />}

                        <button onClick={togglePrivacyMode} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Privacidade" title={isPrivacyMode ? "Mostrar Valores" : "Ocultar Valores"}>
                           {isPrivacyMode ? <EyeSlashIcon className="h-6 w-6" /> : <EyeIcon className="h-6 w-6" />}
                        </button>

                        {!user && (
                          <button onClick={onOpenSettings} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-3 py-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-xs" aria-label="Entrar">
                            Entrar
                          </button>
                        )}
                         <button onClick={toggleTheme} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Alternar tema">
                           {theme === 'light' ? <MoonIcon className="h-6 w-6" /> : <SunIcon className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
    <div className="md:hidden pb-2 flex flex-col space-y-2">
        {organizationInfo && (
            <div className="flex justify-center items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mx-4">
                <button
                    onClick={() => viewMode !== 'personal' && toggleViewMode()}
                    className={`flex-1 py-1 text-xs rounded-md font-medium transition-all text-center ${viewMode === 'personal' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Pessoal
                </button>
                <button
                    onClick={() => viewMode !== 'organization' && toggleViewMode()}
                    className={`flex-1 py-1 text-xs rounded-md font-medium transition-all text-center ${viewMode === 'organization' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Org: {organizationInfo.name}
                </button>
            </div>
        )}
        <div className="flex justify-center space-x-2">
                     <button
                        onClick={() => setActiveView('dashboard')}
                        className={`px-3 py-1 rounded text-xs ${activeView === 'dashboard' ? 'bg-[#0D9488] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                        Dash
                    </button>
                    <button
                        onClick={() => setActiveView('investments')}
                        className={`px-3 py-1 rounded text-xs ${activeView === 'investments' ? 'bg-[#0D9488] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                        Invest
                    </button>
                    <button
                        onClick={() => setActiveView('financeAccounting')}
                        className={`px-3 py-1 rounded text-xs ${activeView === 'financeAccounting' ? 'bg-[#0D9488] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                        Fin/Cont
                    </button>
                </div>
            </div>
            </div>
        </header>
            )}
        </>
    );
};
