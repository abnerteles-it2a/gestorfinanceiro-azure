import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors">
          <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-8 sm:p-10 rounded-2xl shadow-2xl max-w-xl w-full backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-6 shadow-sm">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
              Instabilidade Temporária no Módulo
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              O Gestor Financeiro detectou uma exceção inesperada neste componente. Seus dados e registros permanecem seguros na nuvem.
            </p>
            
            {this.state.error && (
              <div className="bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl overflow-auto max-h-36 mb-6 text-xs font-mono text-slate-600 dark:text-slate-400">
                <p className="text-rose-500 font-bold mb-1">{this.state.error.toString()}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#0D9488] hover:bg-[#0f766e] text-white text-sm font-bold shadow-lg shadow-teal-500/20 active:scale-[0.98] transition-all"
              >
                Recarregar Sistema
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('gestor_financeiro_chat_history');
                    window.location.href = '/';
                  } catch {
                    window.location.reload();
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
              >
                Retornar ao Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
