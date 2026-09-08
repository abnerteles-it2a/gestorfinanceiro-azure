import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface AuthUser {
  id: string;
  email?: string | null;
  businessProfile?: string;
  fullName?: string;
  document?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string, force?: boolean) => Promise<void>;
  signUp: (email: string, password: string, extras?: { name?: string; orgName?: string; planTier?: string; seats?: number; cpfCnpj?: string; businessProfile?: string }) => Promise<void>;
  updateProfile: (data: { fullName?: string; document?: string; businessProfile?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setDevAdmin: (v: boolean) => void;
  refreshProfile: () => Promise<void>;
  keepLoggedIn: boolean;
  setKeepLoggedIn: (v: boolean) => void;
  getToken: () => string;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, token: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getToken = () => {
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token') || window.localStorage.getItem('financeplus_app_token') || '';
      if (token) {
        if (!window.localStorage.getItem('gestor_financeiro_app_token')) window.localStorage.setItem('gestor_financeiro_app_token', token);
        if (!window.localStorage.getItem('financeplus_app_token')) window.localStorage.setItem('financeplus_app_token', token);
      }
      return token;
    } catch {
      return '';
    }
  };

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try { return window.localStorage.getItem('gestor_financeiro_dev_admin') === '1'; } catch { return false; }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [keepLoggedIn, setKeepLoggedInState] = useState<boolean>(() => {
    try {
      const envDefault = !!((import.meta as any)?.env?.VITE_KEEP_LOGGED_IN_DEFAULT);
      const val = window.localStorage.getItem('gestor_financeiro_keep_logged_in');
      if (val === '0') return false;
      if (val === '1') return true;
      return envDefault || false;
    } catch { return false; }
  });

  // Init: Check for existing token
  useEffect(() => {
    const init = async () => {
      try {
        try {
          const token = getToken();
          if (token) {
            const r = await fetch('/api/neon-auth/me', { headers: { authorization: `Bearer ${token}` } });
            const j = await r.json();
            const u = j?.user;
            if (u?.id) {
              setUser({ 
                id: u.id, 
                email: u.email,
                fullName: u.fullName,
                document: u.document,
                businessProfile: u.businessProfile
              });
              setIsAdmin(!!u.isAdmin);
            } else {
              setUser(null);
              setIsAdmin(false);
            }
          } else {
            setUser(null);
            setIsAdmin(false);
          }
        } catch {
          setUser(null);
          setIsAdmin(false);
        }
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Heartbeat: Check session validity periodically (Single Session enforcement)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
         const t = getToken();
         if (!t) return;
         const r = await fetch('/api/neon-auth/me', { headers: { authorization: `Bearer ${t}` } });
         if (r.status === 401) {
            const j = await r.json().catch(() => ({}));
            // If session is invalid (e.g. logged in elsewhere) or expired
            if (j.error === 'session_invalid' || j.error === 'session_expired' || j.error === 'unauthorized') {
                await signOut();
                // Dispatch event so UI can show a specific message
                window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: j.error } }));
            }
         }
      } catch {}
    }, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [user]);

  const signIn = async (email: string, password: string, force?: boolean) => {
    const r = await fetch('/api/neon-auth/signin', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ email, password, force: !!force }) });
    const j = await r.json();
    if (!r.ok) {
      if (j?.error === 'already_logged') {
        // Embed session info in error message for LoginGate to parse
        throw new Error(`already_logged|${j?.minutesAgo ?? ''}|${j?.lastSeen ?? ''}`);
      }
      throw new Error(String(j?.error || 'invalid_credentials'));
    }
    const t = String(j?.token || '');
    const u = j?.user;
    if (t) try { window.localStorage.setItem('gestor_financeiro_app_token', t); window.localStorage.setItem('financeplus_app_token', t); } catch {}
    try { window.localStorage.setItem('gestor_financeiro_session_started_at', new Date().toISOString()); } catch {}
    try { window.localStorage.setItem('gestor_financeiro_session_last_activity_at', new Date().toISOString()); } catch {}
    try {
      if (t) {
        const parts = t.split('.');
        if (parts.length >= 2) {
          const base = parts[1].replace(/-/g,'+').replace(/_/g,'/');
          const json = JSON.parse(atob(base));
          const exp = Number(json?.exp || 0);
          if (exp) { window.localStorage.setItem('gestor_financeiro_session_expires_at', new Date(exp * 1000).toISOString()); }
        }
      }
    } catch {}
    if (t) {
      // Fetch full profile BEFORE setting user state to ensure consistency
      const meRes = await fetch('/api/neon-auth/me', { headers: { authorization: `Bearer ${t}` } });
      const meJ = await meRes.json();
      const fullU = meJ?.user;
      if (fullU?.id) {
        setUser({ 
          id: fullU.id, 
          email: fullU.email,
          fullName: fullU.fullName,
          document: fullU.document,
          businessProfile: fullU.businessProfile
        });
        setIsAdmin(!!fullU.isAdmin);
      }
    }
  };

  const signUp = async (email: string, password: string, extras?: { name?: string; orgName?: string; planTier?: string; seats?: number; cpfCnpj?: string, businessProfile?: string }) => {
    const payload: any = { email, password };
    if (extras && typeof extras === 'object') {
      if (extras.name) payload.name = extras.name;
      if (extras.orgName) payload.orgName = extras.orgName;
      if (extras.planTier) payload.planTier = extras.planTier;
      if (typeof extras.seats === 'number') payload.seats = extras.seats;
      if (extras.cpfCnpj) payload.cpfCnpj = extras.cpfCnpj;
      if (extras.businessProfile) payload.businessProfile = extras.businessProfile;
    }
    const r = await fetch('/api/neon-auth/signup', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j?.error || 'signup_failed'));
    return j;
  };

  const resendVerification = async (email: string) => {
    const r = await fetch('/api/neon-auth/resend-verification', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j?.error || 'verification_delivery_failed'));
  };

  const verifyEmail = async (email: string, code: string) => {
    const r = await fetch('/api/neon-auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j?.error || 'verification_failed'));
  };

  const forgotPassword = async (email: string) => {
    const r = await fetch('/api/neon-auth/forgot-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j?.error || 'forgot_password_failed'));
  };

  const resetPassword = async (email: string, token: string, password: string) => {
    const r = await fetch('/api/neon-auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, token, password }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j?.error || 'reset_password_failed'));
  };

  const updateProfile = async (data: { fullName?: string; document?: string; businessProfile?: string }) => {
    const token = getToken();
    if (!token) return;
    const r = await fetch('/api/neon-auth/update-profile', { 
      method: 'POST', 
      headers: { 
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      }, 
      body: JSON.stringify(data) 
    });
    if (!r.ok) {
      const j = await r.json();
      throw new Error(j.error || 'failed_to_update_profile');
    }
    await refreshProfile();
  };

  const signOut = async () => {
    try { window.localStorage.removeItem('gestor_financeiro_app_token'); window.localStorage.removeItem('financeplus_app_token'); } catch {}
    setUser(null);
    setIsAdmin(false);
    try {
      const ls = window.localStorage;
      const keys: string[] = [];
      for (let i = 0; i < ls.length; i++) { keys.push(ls.key(i) || ''); }
      keys.forEach((k) => { if (k && k.startsWith('gestor_financeiro_') && !k.startsWith('gestor_financeiro_session_')) { try { ls.removeItem(k); } catch {} } });
    } catch {}
  };

  const setDevAdmin = (v: boolean) => {
    setIsAdmin(v);
    try { window.localStorage.setItem('gestor_financeiro_dev_admin', v ? '1' : '0'); } catch {}
  };

  const refreshProfile = async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      const t = getToken();
      if (!t) return;
      const r = await fetch('/api/neon-auth/me', { headers: { authorization: `Bearer ${t}` } });
      const j = await r.json();
      const u = j?.user;
      if (u?.id) {
        setUser({ 
          id: u.id, 
          email: u.email,
          fullName: u.fullName,
          document: u.document,
          businessProfile: u.businessProfile
        });
        setIsAdmin(!!u.isAdmin);
      }
    } catch {}
  };

  const setKeepLoggedIn = (v: boolean) => {
    setKeepLoggedInState(v);
    try { window.localStorage.setItem('gestor_financeiro_keep_logged_in', v ? '1' : '0'); } catch {}
  };

  const value = useMemo<AuthContextValue>(() => ({ user, isAdmin, loading, signIn, signUp, updateProfile, signOut, setDevAdmin, refreshProfile, keepLoggedIn, setKeepLoggedIn, getToken, verifyEmail, resendVerification, forgotPassword, resetPassword }), [user, isAdmin, loading, keepLoggedIn, updateProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
