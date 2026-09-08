
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
// pre-clean Supabase tokens when "Manter logado" está desativado
const preAuthBootstrap = () => {
  try {
    const val = window.localStorage.getItem('gestor_financeiro_keep_logged_in');
    const keep = val === '1';
    if (!keep) {
      const ls = window.localStorage;
      const keys: string[] = [];
      for (let i = 0; i < ls.length; i++) { keys.push(ls.key(i) || ''); }
      keys.forEach((k) => {
        if (k && k.startsWith('sb-')) { try { ls.removeItem(k); } catch {} }
      });
    }
  } catch {}
};
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
const env: any = (import.meta as any)?.env || {};
const Strict = env.VITE_STRICT_MODE_OFF ? React.Fragment : React.StrictMode;

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

preAuthBootstrap();
const root = ReactDOM.createRoot(rootElement);
root.render(
    <Strict>
        <ErrorBoundary>
            <AuthProvider>
                <ThemeProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </ThemeProvider>
            </AuthProvider>
        </ErrorBoundary>
    </Strict>
  );
