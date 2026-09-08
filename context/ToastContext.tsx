
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
            <div className="fixed bottom-4 right-4 z-[100] space-y-2">
                {toasts.map(toast => (
                    <div 
                        key={toast.id}
                        className={`
                            flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 ease-in-out
                            ${toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'}
                            animate-fade-in-up
                        `}
                    >
                        <span className="text-sm">{toast.message}</span>
                        {toast.actionLabel && toast.onAction && (
                            <button
                                onClick={() => { try { toast.onAction && toast.onAction(); } catch {} setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
                                className="ml-2 px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-xs"
                            >
                                {toast.actionLabel}
                            </button>
                        )}
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
