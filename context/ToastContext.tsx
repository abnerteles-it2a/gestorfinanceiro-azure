
import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    actionLabel?: string;
    onAction?: () => void;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, actionLabel?: string, onAction?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info', actionLabel?: string, onAction?: () => void) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type, actionLabel, onAction }]);
        const timeout = (type === 'warning' && actionLabel) ? 8000 : 3000;
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, timeout);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div role="region" aria-label="Notificações do sistema" aria-live="polite" className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        role={toast.type === 'error' ? 'alert' : 'status'}
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white transform transition-opacity duration-300 ease-in-out
                            ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-teal-600'}
                            animate-fade-in-up
                        `}
                    >
                        <span className="text-sm flex-1">{toast.message}</span>
                        {toast.actionLabel && toast.onAction && (
                            <button
                                type="button"
                                onClick={() => { try { toast.onAction && toast.onAction(); } catch {} setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
                                className="ml-2 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold shrink-0"
                            >
                                {toast.actionLabel}
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label="Fechar notificação"
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
