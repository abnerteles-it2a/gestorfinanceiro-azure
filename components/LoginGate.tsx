import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { validateDocument } from '../utils/validators';
import { formatDocument } from '../utils/formatters';
import { useToast } from '../context/ToastContext';

import { useTheme } from '../context/ThemeContext';
import { Modal } from './shared/Modal';

interface LoginGateProps {
  onOpenSettings: () => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onOpenSettings }) => {
  const { user, loading, signIn, signUp, verifyEmail, resendVerification, forgotPassword, resetPassword } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [takeoverNeeded, setTakeoverNeeded] = useState(false);
  const [sessionMinutesAgo, setSessionMinutesAgo] = useState<number | null>(null);
  const [sessionLastSeen, setSessionLastSeen] = useState<string | null>(null);
  const [showLogo, setShowLogo] = useState(true);
  const [logoSrc, setLogoSrc] = useState<string>('/logo.png');
  const [logoErr, setLogoErr] = useState<number>(0);
  const [suProfile, setSuProfile] = useState('pf');
  const [isSignUpOpen, setIsSignUpOpen] = useState(false);
  const [suName, setSuName] = useState('');
  const [suCpfCnpj, setSuCpfCnpj] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suOrgName, setSuOrgName] = useState('');
  const [suPlanTier, setSuPlanTier] = useState('Pro');
  const [suSeats, setSuSeats] = useState('1');
  const [suMsg, setSuMsg] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetPasswordVal, setResetPasswordVal] = useState('');


  // Set default seats based on tier
  useEffect(() => {
    if (suPlanTier === 'Pro') setSuSeats('2');
    else setSuSeats('1');
  }, [suPlanTier]);

  // Password strength logic
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };
  const passStrength = getPasswordStrength(suPassword);
  const strengthColor = ['bg-gray-300', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][passStrength];
  const strengthLabel = ['Vazia', 'Muito Fraca', 'Fraca', 'Média', 'Forte', 'Muito Forte'][passStrength];

  // Mostrar gate sempre que não há usuário, independente de loading
  if (user) return null;

  const handleSignIn = async () => {
    try {
      setBusy(true);
      setMsg(null);
      await signIn(email, password);
    } catch (e: any) {
      const raw = e?.message || e || '';
      const msg = String(raw);
      if (msg.startsWith('already_logged')) {
        // Parse extra info if embedded: already_logged|minutesAgo
        const parts = msg.split('|');
        const mins = parts[1] ? parseInt(parts[1]) : null;
        setSessionMinutesAgo(mins);
        setSessionLastSeen(parts[2] || null);
        setTakeoverNeeded(true);
        setMsg(null);
      } else if (msg === 'email_not_verified') {
        setVerifyEmailAddr(email);
        setIsVerifyOpen(true);
        setMsg(null);
      } else {
        setMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTakeoverSignIn = async () => {
    try {
      setBusy(true);
      setMsg(null);
      await signIn(email, password, true);
      setTakeoverNeeded(false);
    } catch (e: any) {
      const m = String(e?.message || e || 'Falha ao trocar a sessão.');
      setMsg(m);
    } finally {
      setBusy(false);
    }
  };

  const handleSignUpSubmit = async () => {
    try {
      setBusy(true);
      setSuMsg(null);
      const emailOk = suEmail.includes('@');
      const seatsNum = Number(suSeats);
      if (!emailOk) { showToast('E-mail inválido.', 'error'); setSuMsg('E-mail inválido.'); return; }

      const docValidation = validateDocument(suCpfCnpj);
      if (docValidation !== true) {
        const err = typeof docValidation === 'string' ? docValidation : 'Documento inválido';
        showToast(err, 'error');
        setSuMsg(err);
        setCpfError(typeof docValidation === 'string' ? docValidation : 'Inválido');
        return;
      }

      if (!suPassword || suPassword.length < 6) { showToast('Senha deve ter pelo menos 6 caracteres.', 'error'); setSuMsg('Senha deve ter pelo menos 6 caracteres.'); return; }
      if (!suName.trim()) { showToast('Nome é obrigatório.', 'error'); setSuMsg('Nome é obrigatório.'); return; }
      if (!suOrgName.trim()) { showToast('Nome da organização é obrigatório.', 'error'); setSuMsg('Nome da organização é obrigatório.'); return; }
      if (!Number.isFinite(seatsNum) || seatsNum < 1) { showToast('Número de assentos inválido.', 'error'); setSuMsg('Número de assentos inválido.'); return; }

      const res: any = await signUp(suEmail.trim().toLowerCase(), suPassword, { 
        name: suName.trim(), 
        orgName: suOrgName.trim(), 
        planTier: suPlanTier, 
        seats: seatsNum, 
        cpfCnpj: suCpfCnpj,
        businessProfile: suProfile 
      });

      if (res?.requiresVerification) {
        setVerifyEmailAddr(suEmail.trim().toLowerCase());
        setIsVerifyOpen(true);
        setIsSignUpOpen(false);
        showToast('Código de verificação enviado para seu e-mail!', 'success');
      } else {
        showToast('Conta criada! Aproveite seus 14 dias de teste.', 'success');
        await signIn(suEmail.trim().toLowerCase(), suPassword);
        setIsSignUpOpen(false);
      }
    } catch (e: any) {
      let m = String(e?.message || e || 'Falha ao criar conta. Tente novamente.');
      if (m === 'org_name_exists') m = 'Nome da organização já existe. Por favor, escolha outro.';
      showToast(m, 'error');
      setSuMsg(m);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async () => {
    try {
      setBusy(true);
      await verifyEmail(verifyEmailAddr, verifyCode);
      showToast('E-mail verificado com sucesso! Agora você pode entrar.', 'success');
      setIsVerifyOpen(false);
      setEmail(verifyEmailAddr);
      setPassword('');
    } catch (e: any) {
      showToast(String(e?.message || 'Falha ao verificar e-mail.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setBusy(true);
      await resendVerification(verifyEmailAddr);
      showToast('Enviamos um novo código de verificação.', 'success');
    } catch (e: any) {
      showToast(String(e?.message || 'Não foi possível reenviar o código.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = async () => {
    try {
      setBusy(true);
      await forgotPassword(forgotEmail);
      showToast('E-mail de recuperação enviado!', 'success');
      setIsForgotOpen(false);
    } catch (e: any) {
      showToast(String(e?.message || 'Falha ao solicitar recuperação.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSubmit = async () => {
    try {
      setBusy(true);
      await resetPassword(forgotEmail, resetToken, resetPasswordVal);
      showToast('Senha alterada com sucesso!', 'success');
      setIsResetOpen(false);
      setEmail(forgotEmail);
      setIsForgotOpen(false);
    } catch (e: any) {
      showToast(String(e?.message || 'Falha ao alterar senha.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const emailParam = params.get('email');
    if (token && emailParam) {
      setResetToken(token);
      setForgotEmail(emailParam);
      setIsResetOpen(true);
    }
  }, []);

  useEffect(() => {
    try { setLogoSrc(theme === 'dark' ? '/logo_white.png' : '/logo.png'); } catch { }
  }, [theme]);

  return (
    <div className="relative">

      <div className="fixed inset-0 z-[200] flex min-h-screen w-screen items-center justify-center overflow-y-auto bg-slate-950 py-4 animate-fade-in">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-10 px-3 sm:px-5 md:px-8">
          <div className="hidden md:flex flex-col items-center justify-center rounded-2xl p-10 bg-gray-800/60 backdrop-blur-sm border border-gray-700/50">
            <div className="flex items-center gap-3 mb-3 w-full max-w-md">
              {showLogo && (
                <img src={logoSrc} alt="Logo" className="h-10 w-auto object-contain" onError={() => { setLogoErr(logoErr + 1); setShowLogo(false); }} />
              )}
              <div>
                <div className="text-3xl font-bold text-white tracking-tight">Gestor Financeiro</div>
                <div className="text-sm text-gray-400 uppercase tracking-widest font-medium">Contábil & Investimentos</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-8 text-gray-500 text-[10px] uppercase font-black tracking-widest bg-gray-900/40 px-3 py-1.5 rounded-full border border-gray-700/30">
               <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
               SaaS Gestor v1.2 — Alpha Launch
            </div>
          </div>
          <div className="flex items-center justify-center p-0">
            <div className="w-full max-w-lg bg-white rounded-2xl p-5 sm:p-7 md:p-10 shadow-[0_10px_35px_rgba(0,0,0,0.35)] relative border border-gray-200">
              {busy && <div className="absolute top-0 left-0 h-1 w-full bg-indigo-600 animate-pulse" />}
              
              <div className="text-center mb-8">
                <h1 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Bem-vindo</h1>
                <p className="text-gray-500 text-sm font-medium">Gestão inteligente para você e sua empresa</p>
              </div>

              <div className="space-y-3 mb-6">
                <input 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="E-mail" 
                  disabled={busy} 
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" 
                />
                <div className="relative">
                  <input 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    type={showLoginPassword ? 'text' : 'password'} 
                    placeholder="Senha" 
                    disabled={busy} 
                    className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-indigo-500 transition-all outline-none pr-12" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(v => !v)}
                    disabled={busy}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600"
                  >
                    {showLoginPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setIsForgotOpen(true)} className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest hover:underline">Esqueci minha senha</button>
                </div>
              </div>

              {msg && <div className="text-[11px] font-bold text-rose-600 mb-4 bg-rose-50 p-2 rounded-lg border border-rose-100">{msg}</div>}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleSignIn} disabled={busy} className="py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-50">
                  {busy ? 'Entrando' : 'Entrar'}
                </button>
                <button onClick={() => { setSuEmail(email); setSuPassword(password); setIsSignUpOpen(true); }} disabled={busy} className="py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all disabled:opacity-50">
                  Criar Conta
                </button>
              </div>

              {takeoverNeeded && (
                <button onClick={handleTakeoverSignIn} disabled={busy} className="mt-4 w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 shadow-md shadow-amber-200 transition-all disabled:opacity-50">
                  Assumir Sessão Atual
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isSignUpOpen} onClose={() => setIsSignUpOpen(false)} title="Nova Conta — 14 Dias Grátis" size="lg" zIndex={1000}>
        <div className="space-y-6 pt-2">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl">
             <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-xs">AI</div>
                <div>
                   <div className="text-emerald-900 dark:text-emerald-300 text-sm font-bold">Teste Grátis Ativo</div>
                   <div className="text-emerald-700 dark:text-emerald-500 text-[10px] uppercase font-bold tracking-widest">Acesso total garantido por 14 dias</div>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome Completo</label>
                      <input value={suName} onChange={(e) => setSuName(e.target.value)} placeholder="Como gostaria de ser chamado?" disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Documento (CPF/CNPJ)</label>
                      <input value={suCpfCnpj} onChange={(e) => setSuCpfCnpj(formatDocument(e.target.value))} placeholder="000.000.000-00" disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome da Empresa / Job</label>
                      <input value={suOrgName} onChange={(e) => setSuOrgName(e.target.value)} placeholder="Ex: Minha Empresa ou Finanças Pessoais" disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                    </div>
                </div>
    
                <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Seu Melhor E-mail</label>
                      <input value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="exemplo@gmail.com" disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Defina sua Senha</label>
                      <div className="relative">
                        <input type={showSignUpPassword ? 'text' : 'password'} value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="Mínimo 6 caracteres" disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none pr-12" />
                        <button type="button" onClick={() => setShowSignUpPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{showSignUpPassword ? 'Ocultar' : 'Mostrar'}</button>
                      </div>
                      {suPassword.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 px-1">
                          <div className="h-1 flex-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-300 ${strengthColor}`} style={{ width: `${(passStrength / 5) * 100}%` }} />
                          </div>
                          <span className="text-[9px] font-bold uppercase text-gray-500 tracking-tighter">{strengthLabel}</span>
                        </div>
                      )}
                    </div>
                </div>
            </div>

            <div className="p-5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/40 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-200 dark:shadow-none">PRO</div>
                   <div className="text-left space-y-0.5">
                      <div className="text-indigo-900 dark:text-indigo-300 text-sm font-black uppercase tracking-tight">Plano PRO Desbloqueado</div>
                      <div className="text-indigo-600 dark:text-indigo-500 text-[10px] uppercase font-bold tracking-widest">Acesso total a todos os módulos por 14 dias</div>
                   </div>
                </div>
                <button onClick={handleSignUpSubmit} disabled={busy} className="w-full sm:w-auto px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 active:scale-95">
                  {busy ? 'Configurando...' : 'Garantir Acesso FULL'}
                </button>
            </div>
          </div>

          {suMsg && <div className="text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/40">{suMsg}</div>}
          
          <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-medium">
             Ao criar uma conta, você aceita nossos termos de uso e política de privacidade.
          </div>
        </div>
      </Modal>
      <Modal isOpen={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} title="Verificação de E-mail" size="md" zIndex={1100}>
        <div className="space-y-6 py-2 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">Enviamos um código de 6 dígitos para <strong>{verifyEmailAddr}</strong>. Digite-o abaixo para validar sua conta.</p>
          <input 
            value={verifyCode} 
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} 
            placeholder="000000" 
            className="w-full text-center text-3xl font-black tracking-[0.5em] py-4 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-0 transition-all outline-none" 
          />
          <button onClick={handleVerifySubmit} disabled={busy || verifyCode.length < 6} className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50">
            {busy ? 'Verificando...' : 'Verificar E-mail'}
          </button>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={handleResendVerification} disabled={busy} className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-700 disabled:opacity-50">Reenviar código</button>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Não recebeu? Verifique a pasta de spam.</p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isForgotOpen} onClose={() => setIsForgotOpen(false)} title="Recuperar Senha" size="md" zIndex={1100}>
        <div className="space-y-6 py-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">Digite seu e-mail para receber um link de recuperação de senha.</p>
          <input 
            value={forgotEmail} 
            onChange={(e) => setForgotEmail(e.target.value)} 
            placeholder="seu@email.com" 
            className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" 
          />
          <button onClick={handleForgotSubmit} disabled={busy || !forgotEmail.includes('@')} className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50">
            {busy ? 'Enviando...' : 'Enviar Link de Recuperação'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={isResetOpen} onClose={() => setIsResetOpen(false)} title="Nova Senha" size="md" zIndex={1100}>
        <div className="space-y-6 py-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">Digite sua nova senha abaixo.</p>
          <div className="space-y-4">
            <input 
              value={resetPasswordVal} 
              onChange={(e) => setResetPasswordVal(e.target.value)} 
              type="password"
              placeholder="Nova Senha" 
              className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all outline-none" 
            />
          </div>
          <button onClick={handleResetSubmit} disabled={busy || resetPasswordVal.length < 6} className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50">
            {busy ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={takeoverNeeded} onClose={() => setTakeoverNeeded(false)} title="Sessão Ativa Detectada" size="md" zIndex={1100}>
        <div className="space-y-5">
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 leading-snug">Esta conta já está logada em outro dispositivo</p>
              {sessionMinutesAgo !== null && (
                <p className="text-xs font-semibold text-gray-600 mt-1.5 bg-white/70 px-2 py-1 rounded-lg inline-block">
                  ⏱ Última atividade: há {sessionMinutesAgo === 0 ? 'menos de 1 minuto' : `${sessionMinutesAgo} minuto${sessionMinutesAgo > 1 ? 's' : ''}`}
                </p>
              )}
              <p className="text-xs text-gray-700 mt-2.5 leading-relaxed">
                Ao continuar, a sessão anterior será <strong>encerrada automaticamente</strong> e o outro dispositivo será desconectado.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => { setTakeoverNeeded(false); setSessionMinutesAgo(null); }}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleTakeoverSignIn}
              disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all disabled:opacity-50 active:scale-95"
            >
              {busy ? 'Conectando...' : 'Sim, Assumir Sessão'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
