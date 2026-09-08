
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFinancialData } from '../context/FinancialDataContext';
import { MarketWidget } from './MarketWidget';
import { MarketRankWidget } from './MarketRankWidget';

type ActiveView = 'home' | 'dashboard' | 'cashflow' | 'investments' | 'financeAccounting' | 'docsVault' | 'reports' | 'admin' | 'orgAdmin' | 'settings' | 'checkout' | 'support';

interface HomeModuleProps {
  setActiveView: (v: ActiveView) => void;
  onOpenSettings: () => void;
  onUpgrade: (tier?: string) => void;
}

const MODULE_DEFS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    gradient: 'linear-gradient(145deg, #1e40af, #3b82f6)',
    glow: 'rgba(59,130,246,0.5)',
    show: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <rect x="2" y="3" width="7" height="9" rx="1.5" />
        <rect x="13" y="3" width="9" height="5" rx="1.5" />
        <rect x="13" y="12" width="9" height="9" rx="1.5" />
        <rect x="2" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 'financeAccounting',
    label: 'Financeiro & Contábil',
    gradient: 'linear-gradient(145deg, #164e63, #22d3ee)',
    glow: 'rgba(34,211,238,0.5)',
    show: null as any,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
      </svg>
    ),
  },
  {
    id: 'investments',
    label: 'Investimentos',
    gradient: 'linear-gradient(145deg, #115e59, #14b8a6)',
    glow: 'rgba(167,139,250,0.5)',
    show: null as any,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Relatórios',
    gradient: 'linear-gradient(145deg, #7f1d1d, #f87171)',
    glow: 'rgba(248,113,113,0.5)',
    show: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: 'docsVault',
    label: 'Cofre de Docs',
    gradient: 'linear-gradient(145deg, #292524, #78716c)',
    glow: 'rgba(120,113,108,0.5)',
    show: null as any,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
      </svg>
    ),
  },
  {
    id: 'orgAdmin',
    label: 'Corporativo',
    gradient: 'linear-gradient(145deg, #581c87, #c084fc)',
    glow: 'rgba(192,132,252,0.5)',
    show: null as any,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'support',
    label: 'Suporte',
    gradient: 'linear-gradient(145deg, #064e3b, #34d399)',
    glow: 'rgba(52,211,153,0.5)',
    show: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];


// macOS-style squircle app icon
const AppIcon: React.FC<{
  mod: typeof MODULE_DEFS[0];
  onClick: () => void;
}> = ({ mod, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Abrir ${mod.label}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'clamp(6px, 0.8vw, 10px)',
        cursor: 'pointer',
        border: 'none',
        padding: 0,
        background: 'transparent',
        width: 'clamp(68px, 6vw, 88px)',
        transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
        transform: hovered ? 'scale(1.12) translateY(-4px)' : 'scale(1)',
      }}
    >
      {/* Icon squircle */}
      <div
        style={{
          width: 'clamp(52px, 5.5vw, 72px)',
          height: 'clamp(52px, 5.5vw, 72px)',
          borderRadius: 'clamp(12px, 1.5vw, 18px)',
          background: mod.gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          boxShadow: hovered
            ? `0 16px 40px -8px ${mod.glow}, 0 4px 12px rgba(0,0,0,0.4)`
            : '0 4px 16px rgba(0,0,0,0.35)',
          transition: 'box-shadow 0.2s ease',
          border: '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Shine overlay */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '45%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
          borderRadius: '18px 18px 50% 50%',
          pointerEvents: 'none',
        }} />
        {React.cloneElement(mod.icon as React.ReactElement<any>, {
          style: { width: 'clamp(20px, 2.5vw, 32px)', height: 'clamp(20px, 2.5vw, 32px)' }
        })}
      </div>
      {/* Label */}
      <span style={{
        fontSize: 'clamp(9px, 0.9vw, 11px)',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.92)',
        textAlign: 'center',
        lineHeight: 1.3,
        textShadow: '0 1px 4px rgba(0,0,0,0.7)',
        letterSpacing: '0.01em',
        maxWidth: 'clamp(64px, 7vw, 88px)',
        wordBreak: 'break-word',
      }}>
        {mod.label}
      </span>
    </button>
  );
};

const HomeModule: React.FC<HomeModuleProps> = ({ setActiveView, onOpenSettings, onUpgrade }) => {
  const { user } = useAuth();
  const { entitlements, capabilities, subscriptionInfo, planInfo } = useFinancialData();

  const canInvestments = entitlements?.modules?.investments ?? capabilities?.canAccessInvestments;
  const canFinanceAccounting = entitlements?.modules?.financeAccounting ?? capabilities?.canAccessFinance;
  const canDocsVault = entitlements?.modules?.docsVault ?? capabilities?.canAccessDocs;
  const canOrgAdmin = !!entitlements?.modules?.corporateManagement;

  const visibleModules = MODULE_DEFS.filter(m => {
    if (m.id === 'investments') return canInvestments;
    if (m.id === 'financeAccounting') return canFinanceAccounting;
    if (m.id === 'docsVault') return canDocsVault;
    if (m.id === 'orgAdmin') return canOrgAdmin;
    return true;
  });

  const handleClick = (id: string) => {
    if (id === 'settings') { onOpenSettings(); return; }
    setActiveView(id as ActiveView);
  };

  const firstName = user?.email?.split('@')[0]?.split('.')[0] || 'Usuário';
  const isPro = planInfo?.tier === 'pro' || !!subscriptionInfo?.isTrial;

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(56px, 4vw + 28px, 80px) clamp(14px, 3vw, 48px) clamp(20px, 2.5vw, 40px)',
        background: 'transparent',
      }}
    >
      {/* Smoked glass overlay — dark on the left (icons/text) fading to transparent on the right (photo shows through) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.85) 60%, rgba(15,23,42,0.4) 100%)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 10, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 'clamp(24px, 3vw, 40px)' }}>
          <p style={{ color: '#2DD4BF', fontSize: 'clamp(10px, 1vw, 13px)', fontWeight: 800, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
            Olá, {firstName}!
          </p>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 'clamp(15px, 2vw, 22px)', fontWeight: 300, letterSpacing: '-0.01em', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            O que vamos gerir hoje?
          </p>
        </div>

        {/* Main layout: icon grid + market widget */}
        <div className="home-launchpad-layout" style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(16px, 2vw, 32px)', alignItems: 'flex-start' }}>

          {/* macOS Launchpad-style icon grid */}
          <div
            className="home-launchpad-grid"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'clamp(16px, 2.5vw, 28px) clamp(12px, 2vw, 20px)',
              flex: 1,
              minWidth: 'min(100%, clamp(220px, 30vw, 320px))',
              alignContent: 'flex-start',
            }}
          >
            {visibleModules.map(mod => (
              <AppIcon
                key={mod.id}
                mod={mod}
                onClick={() => handleClick(mod.id)}
              />
            ))}
          </div>

          {/* Market Widget */}
          <MarketWidget
            isPro={isPro}
            onGoToDashboard={() => setActiveView('dashboard')}
            onUpgrade={() => onUpgrade('pro')}
          />

          {/* Market Rank Widget */}
          <MarketRankWidget
            isPro={isPro}
            onGoToDashboard={() => setActiveView('dashboard')}
            onUpgrade={() => onUpgrade('pro')}
          />
        </div>

        {/* Footer */}
        <div
          className="home-launchpad-footer"
          style={{
            marginTop: 'auto',
            paddingTop: 48,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: 'white',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            opacity: 0.75,
          }}
        >
          <span>Gestor Financeiro Enterprise © 2026 · by IT2A</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 10px #10B981' }} />
            <span>Sistemas Online</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HomeModule;

