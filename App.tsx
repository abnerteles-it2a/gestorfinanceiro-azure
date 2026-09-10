
import React, { lazy, Suspense, useState, useEffect } from 'react';
import { FinancialDataProvider } from './context/FinancialDataContext';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';

import { LoginGate } from './components/LoginGate';
import { SettingsModal } from './components/SettingsModal';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Investments = lazy(() => import('./components/Investments'));
const FinanceAccounting = lazy(() => import('./components/FinanceAccounting'));
const DocsVault = lazy(() => import('./components/DocsVault'));
const Reports = lazy(() => import('./components/Reports'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const OrgAdminPanel = lazy(() => import('./components/OrgAdminPanel').then(module => ({ default: module.OrgAdminPanel })));
const Checkout = lazy(() => import('./components/Checkout').then(module => ({ default: module.Checkout })));
const SupportPortal = lazy(() => import('./components/SupportPortal').then(module => ({ default: module.SupportPortal })));
import { Header } from './components/Header';
import { PlusIcon, WalletIcon, TrendingUpIcon, ListBulletIcon, BankIcon, UploadIcon, CalendarIcon, SparklesIcon, UsersIcon, HelpCircleIcon } from './components/icons';
import HomeModule from './components/HomeModule';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddInvestmentModal } from './components/AddInvestmentModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { EditInvestmentModal } from './components/EditInvestmentModal';
import { LoaderState } from './components/ui/LoaderState';
import { WelcomeModal } from './components/WelcomeModal';
import { CalendarWidget } from './components/CalendarWidget';
import { WeatherWidget } from './components/WeatherWidget';
import type { ModalType, Transaction, AnyInvestment } from './types';
import { TransactionType, AssetType } from './types';
import { useFinancialData } from './context/FinancialDataContext';
import { useTheme } from './context/ThemeContext';
import { useSecurity } from './hooks/useSecurity';
import { toIsoLocalDate } from './utils/formatters';

type ActiveView = 'home' | 'dashboard' | 'cashflow' | 'investments' | 'financeAccounting' | 'docsVault' | 'reports' | 'admin' | 'orgAdmin' | 'settings' | 'checkout' | 'support';

const SidebarNav: React.FC<{ collapsed: boolean; setCollapsed: (v: boolean) => void; setManual: (v: boolean) => void; setActiveView: (v: ActiveView) => void; activeView: ActiveView; moduleColor: string; }>
= ({ collapsed, setCollapsed, setManual, setActiveView, activeView, moduleColor }) => {
    const { transactions, investments, fixedIncomeInvestments, getInsights, planInfo, capabilities, entitlements, organizationInfo, orgRole } = useFinancialData();
    const { user, isAdmin, signOut } = useAuth();
    const [logoutBusy, setLogoutBusy] = useState(false);
    const today = toIsoLocalDate(new Date().toISOString().slice(0,10));
    const txToday = transactions.filter(t => t.date === today).length;
    const invCount = investments.length + fixedIncomeInvestments.length;
    const insightsCount = getInsights().length;

    const canInvestments = entitlements?.modules?.investments ?? capabilities?.canAccessInvestments ?? true;
    const canFinanceAccounting = entitlements?.modules?.financeAccounting ?? capabilities?.canAccessFinance ?? true;
    const canDocsVault = entitlements?.modules?.docsVault ?? capabilities?.canAccessDocs ?? true;
    
    const navBtnClass = (view: ActiveView) => {
        if (collapsed) return `omie-sidebar-item`;
        return `w-full h-10 flex items-center px-3 gap-3 rounded-lg transition-all text-sm font-medium relative group ${activeView === view ? 'bg-[#0D9488]/15 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`;
    };
    const activeStyle = (view: ActiveView): React.CSSProperties =>
        collapsed && activeView === view ? { background: moduleColor, color: 'white' } : {};

    return (
        <aside className={`app-sidebar no-print hidden md:flex glass-sidebar ${
            collapsed ? 'omie-sidebar' : 'app-sidebar-expanded flex-col transition-all duration-300 h-screen sticky top-0 z-40 shrink-0 text-slate-300'
        }`}>
            <div className={`${
                collapsed ? 'h-16 flex items-center justify-center border-b border-white/5' : 'h-20 flex flex-col justify-center px-5 border-b border-slate-800'
            } shrink-0`}>
                {collapsed ? (
                    <img src="/logo_white.png" alt="Logo" className="w-12 h-12 object-contain opacity-95" />
                ) : (
                    <div className="flex items-center gap-3 overflow-hidden">
                            <img src="/logo_white.png" alt="Logo" className="w-12 h-12 object-contain opacity-95" />
                            <div className="flex flex-col">
                                <span className="block font-bold text-white text-[13px] leading-tight truncate tracking-tight uppercase">Gestor Financeiro</span>
                                <span className="block text-[9px] text-slate-500 font-bold truncate uppercase tracking-[0.14em]">Enterprise Ecosystem</span>
                            </div>
                        </div>
                )}
            </div>

            {user && !collapsed && (
                <div className="shrink-0 px-3 lg:px-5 py-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#0D9488]/20 flex items-center justify-center text-[10px] font-bold text-[#0D9488] shrink-0 border border-slate-700">
                            {(user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <p className="text-[11px] font-medium text-slate-400 truncate flex-1">{user.email || 'Usuário'}</p>
                        {isAdmin && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0D9488]/20 text-[#0D9488] shrink-0">Admin</span>
                        )}
                    </div>
                </div>
            )}

            <div className={`flex ${collapsed ? 'justify-center' : 'justify-end'} px-2 py-1 shrink-0`}>
                <button
                    onClick={() => { const v = !collapsed; setManual(true); setCollapsed(v); try { window.localStorage.setItem('gestor_financeiro_sidebar_collapsed', v ? '1' : '0'); } catch {} }}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                    title={collapsed ? 'Expandir' : 'Colapsar'}
                >
                    <ListBulletIcon className="h-4 w-4" />
                </button>
            </div>

            <nav className={`flex-1 py-1 ${collapsed ? 'px-2' : 'px-2 lg:px-3'} space-y-1 overflow-y-auto overflow-x-hidden`}>
                <button onClick={() => setActiveView('dashboard')} className={navBtnClass('dashboard')} style={activeStyle('dashboard')} title="Dashboard">
                    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="9" rx="1.5" />
                        <rect x="14" y="3" width="7" height="5" rx="1.5" />
                        <rect x="14" y="12" width="7" height="9" rx="1.5" />
                        <rect x="3" y="16" width="7" height="5" rx="1.5" />
                    </svg>
                    {!collapsed && <span className="whitespace-nowrap">Dashboard</span>}
                </button>
                {canFinanceAccounting && (
                    <button onClick={() => setActiveView('financeAccounting')} className={navBtnClass('financeAccounting')} style={activeStyle('financeAccounting')} title="Financeiro/Contábil">
                        <BankIcon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">Financeiro/Contábil</span>}
                    </button>
                )}
                {canInvestments && (
                    <button onClick={() => setActiveView('investments')} className={navBtnClass('investments')} style={activeStyle('investments')} title="Investimentos">
                        <TrendingUpIcon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">Investimentos</span>}
                    </button>
                )}
                <button onClick={() => setActiveView('reports')} className={navBtnClass('reports')} style={activeStyle('reports')} title="Relatórios">
                    <ListBulletIcon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">Relatórios</span>}
                </button>
                {canDocsVault && (
                    <button onClick={() => setActiveView('docsVault')} className={navBtnClass('docsVault')} style={activeStyle('docsVault')} title="Cofre de Documentos">
                        <UploadIcon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">Cofre de Docs</span>}
                    </button>
                )}
                {entitlements?.modules?.corporateManagement && (
                    <button onClick={() => setActiveView('orgAdmin')} className={navBtnClass('orgAdmin')} style={activeStyle('orgAdmin')} title="Gestão Corporativa">
                        <UsersIcon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="whitespace-nowrap">Gestão Corporativa</span>}
                    </button>
                )}

                {!collapsed && (
                    <div className="mt-2 px-1 animate-in fade-in slide-in-from-bottom-2 duration-500 dark">
                        <div className="h-px bg-slate-800 mb-2 opacity-50 mx-2"></div>
                        <CalendarWidget isSidebar={true} />
                    </div>
                )}
                
                <button onClick={() => setActiveView('support')} className={navBtnClass('support')} style={activeStyle('support')} title="Ajuda & Suporte">
                    <HelpCircleIcon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="whitespace-nowrap">Ajuda & Suporte</span>}
                </button>
            </nav>
        </aside>
    );
};

const AppContent: React.FC = () => {
    useSecurity();
    const { theme } = useTheme();
    const { user, signOut, isAdmin } = useAuth();
    const { showToast } = useToast();
    const { userPreferences, entitlements, capabilities, subscriptionInfo } = useFinancialData();
    const [activeView, setActiveView] = useState<ActiveView>('home');
    const [financeSubTab, setFinanceSubTab] = useState<'cashflow' | 'obligations' | 'accounting'>('cashflow');
    const [returnView, setReturnView] = useState<ActiveView>('dashboard');
    const [selectedTier, setSelectedTier] = useState<string>('starter');
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try {
            return window.localStorage.getItem('gestor_financeiro_sidebar_collapsed') === '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem('gestor_financeiro_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
        } catch {}
    }, [sidebarCollapsed]);
    const [sidebarManual, setSidebarManual] = useState<boolean>(false);
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        if (user) setActiveView('home');
    }, [user]);

    useEffect(() => {
        const canInvestments = entitlements?.modules?.investments ?? capabilities?.canAccessInvestments;
        if (activeView === 'investments' && canInvestments === false) {
            setActiveView('financeAccounting');
            showToast('Investimentos ficam disponíveis apenas no modo Pessoal.', 'info');
        }
    }, [activeView, entitlements?.modules?.investments, capabilities?.canAccessInvestments, showToast]);

    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const reason = ce.detail?.reason;
            if (reason === 'session_invalid') {
                showToast('Sessão encerrada. Você conectou em outro dispositivo.', 'warning', 'Entendi');
            } else if (reason === 'session_expired') {
                showToast('Sessão expirada. Faça login novamente.', 'info', 'Entendi');
            }
        };
        window.addEventListener('auth:logout', handler as EventListener);
        return () => window.removeEventListener('auth:logout', handler as EventListener);
    }, [showToast]);

    // Welcome Onboarding popup is disabled per user request
    useEffect(() => {
        if (showWelcome) {
            setShowWelcome(false);
        }
    }, [showWelcome]);

    useEffect(() => {
        const handler = () => {
            const w = window.innerWidth;
            if (sidebarManual) return;
            if (w >= 1440) setSidebarCollapsed(false);
            else if (w >= 768) setSidebarCollapsed(true);
        };
        handler();
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('resize', handler);
        };
    }, [sidebarManual]);
    
    

    
    const [showSplash, setShowSplash] = useState(false);

    const handleSetActiveView = (newView: ActiveView) => {
        if (activeView === 'home' && newView !== 'home') {
            setShowSplash(true);
            setTimeout(() => setShowSplash(false), 900);
        }
        setActiveView(newView);
    };

    const canInvestments = entitlements?.modules?.investments ?? capabilities?.canAccessInvestments ?? true;
    const canFinanceAccounting = entitlements?.modules?.financeAccounting ?? capabilities?.canAccessFinance ?? true;

    const showTopbarIdentity = activeView === 'home' || sidebarCollapsed;

    const getModuleColor = () => {
        if (activeView === 'financeAccounting') {
            if (financeSubTab === 'cashflow') return '#2E7D32';
            if (financeSubTab === 'obligations') return '#1565C0';
            if (financeSubTab === 'accounting') return '#0097A7';
        }
        const colors: Record<string, string> = {
            dashboard:         '#1565C0',
            cashflow:          '#2E7D32',
            investments:       '#4527A0',
            financeAccounting: '#0097A7',
            docsVault:         '#37474F',
            reports:           '#B71C1C',
            admin:             '#E65100',
            orgAdmin:          '#6A1B9A',
            support:           '#00695C',
            settings:          '#FF8F00',
            checkout:          '#0D9488',
            home:              '#0D9488',
        };
        return colors[activeView] || '#0D9488';
    };

    const getTitle = () => {
        if (activeView === 'financeAccounting') {
            if (financeSubTab === 'cashflow') return 'Finanças / Fluxo de Caixa';
            if (financeSubTab === 'obligations') return 'Finanças / Contas a Pagar e Receber';
            if (financeSubTab === 'accounting') return 'Controladoria / Visão Contábil';
        }
        const titles: Record<string, string> = {
            dashboard:         'Dashboard',
            cashflow:          'Fluxo de Caixa',
            investments:       'Investimentos',
            financeAccounting: 'Financeiro & Contábil',
            docsVault:         'Cofre de Documentos',
            reports:           'Relatórios e BI',
            admin:             'Painel Administrativo',
            orgAdmin:          'Gestão Corporativa',
            support:           'Ajuda & Suporte',
            settings:          'Configurações',
            checkout:          'Planos & Assinatura',
        };
        return titles[activeView] || 'Gestor Financeiro';
    };

    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [investmentToEdit, setInvestmentToEdit] = useState<AnyInvestment | null>(null);
    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [addInitial, setAddInitial] = useState<{ date?: string; transactionType?: TransactionType; accountId?: string; category?: string } | undefined>(undefined);
    const [investmentAddInitial, setInvestmentAddInitial] = useState<{ type?: AssetType; ticker?: string; quantity?: number; purchasePrice?: number; purchaseDate?: string; name?: string; issuer?: string; amountInvested?: number; yieldRate?: string; maturityDate?: string; op?: 'buy'|'sell'|'dividend'; assetId?: string } | undefined>(undefined);
    const [settingsInitialTab, setSettingsInitialTab] = useState<'categories' | 'accounts' | 'costCenters' | 'preferences' | 'backup' | 'auth' | undefined>(undefined);

    const openSettings = (tab?: typeof settingsInitialTab) => {
        setSettingsInitialTab(tab);
        if (!user) {
            setSettingsModalOpen(true);
            return;
        }
        if (activeView !== 'settings') setReturnView(activeView);
        setActiveView('settings');
    };

    const closeSettingsPage = () => {
        setActiveView(returnView);
        setSettingsInitialTab(undefined);
    };

    const handleEditTransaction = (transaction: Transaction) => {
        setTransactionToEdit(transaction);
    };

    const handleOpenCheckout = (tier: string = 'starter') => {
        setSelectedTier(tier);
        setActiveView('checkout');
    };

    const handleEditInvestment = (investment: AnyInvestment) => {
        setInvestmentToEdit(investment);
    };
    React.useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const detail = (ce && ce.detail) || {};
            setAddInitial(detail);
            setActiveModal('transaction');
        };
        window.addEventListener('gestor_financeiro_add_tx', handler as EventListener);
        return () => { window.removeEventListener('gestor_financeiro_add_tx', handler as EventListener); };
    }, []);

    React.useEffect(() => {
        const handler = (e: Event) => { const ce = e as CustomEvent; const detail = (ce && ce.detail) || {}; setInvestmentAddInitial(detail); setActiveModal('investment'); };
        window.addEventListener('gestor_financeiro_add_investment', handler as EventListener);
        return () => { window.removeEventListener('gestor_financeiro_add_investment', handler as EventListener); };
    }, []);

    React.useEffect(() => {
        const handler = () => {
            setActiveView('checkout');
        };
        window.addEventListener('gestor_financeiro_go_checkout', handler as EventListener);
        return () => { window.removeEventListener('gestor_financeiro_go_checkout', handler as EventListener); };
    }, []);

    React.useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const detail = (ce && ce.detail) || {};
            openSettings(detail.tab);
        };
        window.addEventListener('openSettingsModal', handler as EventListener);
        return () => { window.removeEventListener('openSettingsModal', handler as EventListener); };
    }, [user, activeView, returnView]);

    React.useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent;
            const detail = (ce && ce.detail) || {};
            if (detail.view) {
                handleSetActiveView(detail.view);
            }
        };
        window.addEventListener('gestor_financeiro_navigate', handler as EventListener);
        return () => { window.removeEventListener('gestor_financeiro_navigate', handler as EventListener); };
    }, []);

    return (
        <div
            className={`${theme === 'dark' ? 'dark' : ''} flex h-screen overflow-hidden bg-spatial`}
            style={{ '--module-color': getModuleColor() } as React.CSSProperties}
        >
            {/* SIDEBAR — hidden on home, expanded=current style, collapsed=omie-sidebar */}
            {user && activeView !== 'home' && (
                <SidebarNav
                    collapsed={sidebarCollapsed}
                    setCollapsed={v => setSidebarCollapsed(v)}
                    setManual={v => setSidebarManual(v)}
                    setActiveView={handleSetActiveView}
                    activeView={activeView}
                    moduleColor={getModuleColor()}
                />
            )}

            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

                {/* ── OMIE TOPBAR (48px) ── */}
                <header
                    className="omie-topbar no-print shrink-0 transition-all duration-300"
                    style={activeView === 'home'
                        ? { background: 'transparent', backdropFilter: 'none', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }
                        : { background: 'rgba(2, 6, 23, 0.4)', backdropFilter: 'blur(10px)' }
                    }
                >
                    <div className="omie-topbar-brand">
                        <button
                            onClick={() => user && handleSetActiveView('home')}
                            className="flex items-center gap-3 bg-transparent border-none cursor-pointer text-white p-0"
                        >
                            {(activeView === 'home' || sidebarCollapsed) && (
                                <>
                                    <span className="text-[14px] font-black tracking-tighter text-white drop-shadow-md">Gestor Financeiro</span>
                                    <span className="text-[9px] font-black text-white/90 uppercase tracking-widest hidden sm:inline drop-shadow-md">· by IT2A</span>
                                    <span className="omie-topbar-sep" />
                                </>
                            )}
                            {user && showTopbarIdentity && (
                                <>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 hidden md:inline drop-shadow-md">
                                        {user?.email?.split('@')[0] || 'Usuário'}
                                    </span>
                                    {isAdmin && (
                                        <span className="text-[8px] font-black uppercase text-[#0D9488] hidden md:inline drop-shadow-md">(Admin)</span>
                                    )}
                                </>
                            )}
                        </button>
                    </div>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center justify-center">
                        <WeatherWidget isHome={activeView === 'home'} />
                    </div>
                    <div className="flex items-center gap-5">
                        <button
                            onClick={() => user && openSettings()}
                            title="Configurações"
                            className="text-white/90 hover:text-white transition-colors cursor-pointer drop-shadow-md"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                            </svg>
                        </button>
                        {user && (
                            <div
                                className="flex items-center gap-2 pl-4 border-l border-white/20 cursor-pointer group drop-shadow-md"
                                onClick={async () => { if (window.confirm('Sair do sistema?')) await signOut(); }}
                                title="Sair"
                            >
                                <span className="text-[11px] font-bold text-white/90 uppercase tracking-widest group-hover:text-[#0D9488] transition-colors hidden sm:inline">
                                    Sair
                                </span>
                                {showTopbarIdentity && (
                                    <div className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center text-white border border-white/40 text-[11px] font-bold group-hover:bg-[#0D9488] transition-all">
                                        {(user?.email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                {/* ── FUNCTIONAL HEADER UNIFICADO (48px) ── */}
                {user && activeView !== 'home' && (
                    <Header
                        activeView={activeView as any}
                        setActiveView={handleSetActiveView as any}
                        onOpenSettings={() => openSettings()}
                        onUpgrade={handleOpenCheckout}
                        moduleTitle={getTitle()}
                        hideBar={false}
                    />
                )}

                {/* ── MAIN CONTENT ── */}
                <main className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar ${
                    activeView === 'home'
                        ? 'p-0 relative bg-transparent'
                        : 'p-3 sm:p-4 lg:p-5 xl:p-6 2xl:p-8 pb-20 md:pb-6 bg-omie-bg dark:bg-slate-950'
                }`}>
                    {activeView === 'home' && user && (
                        <HomeModule
                            setActiveView={handleSetActiveView}
                            onOpenSettings={() => openSettings()}
                            onUpgrade={handleOpenCheckout}
                        />
                    )}
                    {activeView !== 'home' && (
                        <Suspense fallback={<LoaderState message="Carregando módulo..." className="min-h-[45vh]" />}>
                            <div className="app-content-limit">
                                {activeView === 'dashboard' && <Dashboard />}
                                {activeView === 'investments' && <Investments onEditInvestment={handleEditInvestment} />}
                                {activeView === 'financeAccounting' && (
                                    <FinanceAccounting
                                        activeSubTab={financeSubTab}
                                        setActiveSubTab={setFinanceSubTab}
                                        onEditTransaction={handleEditTransaction}
                                    />
                                )}
                                {activeView === 'docsVault' && <DocsVault />}
                                {activeView === 'reports' && <Reports />}
                                {activeView === 'admin' && <AdminPanel />}
                                {activeView === 'orgAdmin' && <OrgAdminPanel />}
                                {activeView === 'checkout' && (
                                    <Checkout
                                        isOpen={true}
                                        tier={selectedTier}
                                        onClose={() => handleSetActiveView('dashboard')}
                                    />
                                )}
                                {activeView === 'support' && <SupportPortal />}
                                {activeView === 'settings' && (
                                    <SettingsModal
                                        isOpen={true}
                                        onClose={closeSettingsPage}
                                        onUpgrade={handleOpenCheckout}
                                        initialTab={settingsInitialTab}
                                        variant="inline"
                                        title="Configurações"
                                        size="full"
                                    />
                                )}
                            </div>
                        </Suspense>
                    )}
                </main>
            </div>

            {user && activeView !== 'home' && (
                <nav aria-label="Navegação principal" className="fixed inset-x-2 bottom-2 z-50 flex md:hidden items-center justify-around gap-1 rounded-2xl border border-white/15 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl">
                    {([
                        ['home', 'Início', WalletIcon],
                        ['dashboard', 'Painel', ListBulletIcon],
                        ...(canFinanceAccounting ? [['financeAccounting', 'Financeiro', BankIcon]] : []),
                        ...(canInvestments ? [['investments', 'Investir', TrendingUpIcon]] : []),
                        ['reports', 'Relatórios', ListBulletIcon],
                        ['support', 'Ajuda', HelpCircleIcon],
                    ] as Array<[ActiveView, string, React.ComponentType<{ className?: string }>]>).map(([view, label, Icon]) => (
                        <button
                            key={view}
                            type="button"
                            onClick={() => handleSetActiveView(view)}
                            aria-current={activeView === view ? 'page' : undefined}
                            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[9px] font-bold transition-colors ${activeView === view ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="truncate">{label}</span>
                        </button>
                    ))}
                </nav>
            )}

            {/* ── MODAIS (sem alteração) ── */}
            <AddTransactionModal
                isOpen={activeModal === 'transaction'}
                onClose={() => setActiveModal(null)}
                onAddAccount={() => {
                    setActiveModal(null);
                    openSettings('accounts');
                }}
                initial={addInitial}
            />
            <AddInvestmentModal
                isOpen={activeModal === 'investment'}
                onClose={() => setActiveModal(null)}
                initial={investmentAddInitial}
            />
            {transactionToEdit && (
                <EditTransactionModal
                    isOpen={!!transactionToEdit}
                    onClose={() => setTransactionToEdit(null)}
                    transaction={transactionToEdit}
                />
            )}
            {investmentToEdit && (
                <EditInvestmentModal
                    isOpen={!!investmentToEdit}
                    onClose={() => setInvestmentToEdit(null)}
                    investment={investmentToEdit}
                />
            )}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => {
                    setSettingsModalOpen(false);
                    setSettingsInitialTab(undefined);
                }}
                onUpgrade={handleOpenCheckout}
                initialTab={settingsInitialTab}
            />
            <WelcomeModal
                isOpen={showWelcome}
                onClose={() => setShowWelcome(false)}
            />

            {/* ── SUBSCRIPTION BLOCK OVERLAY ── */}
            {subscriptionInfo?.isTotalBlocked && activeView !== 'checkout' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60 animate-in fade-in duration-500">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-8 animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-rose-100 dark:bg-rose-950/30 text-rose-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-rose-50 dark:ring-rose-900/20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <div className="space-y-3">
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight uppercase">Dashboard Bloqueado</h2>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Sua assinatura expirou e o período de carência terminou. Seus dados estão seguros, mas o acesso foi temporariamente suspenso.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 pt-2">
                            <button
                                onClick={() => handleSetActiveView('checkout')}
                                className="w-full py-4 bg-[#0D9488] text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-[#0F766E] shadow-xl transition-all active:scale-95"
                            >
                                Regularizar Assinatura
                            </button>
                            <button
                                onClick={async () => await signOut()}
                                className="w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors"
                            >
                                Sair da Conta
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest opacity-60">it2a Gestor Financeiro © 2026</p>
                    </div>
                </div>
            )}

            {/* ── LOGIN GATE ── */}
            {!user && (
                <LoginGate onOpenSettings={() => openSettings('auth')} />
            )}

            {/* ── SPLASH SCREEN (home → módulo) ── */}
            {showSplash && (
                <div
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#020617]"
                    style={{ animation: 'gestorSplashIn 0.9s ease forwards' }}
                >
                    <style>{`
                        @keyframes gestorSplashIn {
                            0%   { opacity: 0; }
                            15%  { opacity: 1; }
                            75%  { opacity: 1; }
                            100% { opacity: 0; }
                        }
                    `}</style>
                    <div className="flex flex-col items-center gap-5">
                        <div className="flex items-center gap-4">
                            <img src="/logo_white.png" alt="IT2A" className="h-10 w-auto object-contain opacity-90"
                                 onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                            <div className="h-10 w-px bg-white/10" />
                            <div>
                                <span className="text-[22px] font-black text-white tracking-tight leading-none">Gestor Financeiro</span>
                                <p className="text-[9px] font-black text-[#0D9488] uppercase tracking-[0.3em] mt-1">
                                    Enterprise · by IT2A
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
    return (
        <FinancialDataProvider>
            <AppContent />
        </FinancialDataProvider>
    );
};

export default App;
