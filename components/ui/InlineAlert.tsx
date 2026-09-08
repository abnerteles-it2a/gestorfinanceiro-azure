import React, { useState, useEffect } from 'react';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from '../icons';

type AlertType = 'error' | 'success' | 'warning' | 'info';

interface InlineAlertProps {
    type: AlertType;
    title: string;
    message?: string;
    isToast?: boolean;
    duration?: number;
    onClose?: () => void;
    className?: string;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
    type,
    title,
    message,
    isToast = false,
    duration = 5000,
    onClose,
    className = ''
}) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (isToast && isVisible) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                if (onClose) onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [isToast, isVisible, duration, onClose]);

    if (!isVisible) return null;

    const styles = {
        error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50',
        success: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50',
        warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50',
        info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/50'
    };

    const icons = {
        error: <AlertTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-400" />,
        success: <CheckCircleIcon className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />,
        warning: <AlertTriangleIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />,
        info: <InfoIcon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
    };

    const baseClass = `flex items-start p-4 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-300 ${styles[type]} ${className}`;
    
    // Toast renders fixed at the top right globally
    const layoutClass = isToast 
        ? `fixed top-6 right-6 z-[9999] w-full max-w-sm animate-fade-in-down ${baseClass}`
        : `${baseClass} w-full`;

    return (
        <div className={layoutClass}>
            <div className="flex-shrink-0 mr-3">
                {icons[type]}
            </div>
            <div className="flex-1 mt-0.5">
                <h3 className="text-[13px] font-bold leading-none tracking-tight mb-1">
                    {title}
                </h3>
                {message && (
                    <div className="text-xs font-medium opacity-80 leading-snug">
                        {message}
                    </div>
                )}
            </div>
            {isToast && (
                <button 
                    onClick={() => {
                        setIsVisible(false);
                        if (onClose) onClose();
                    }}
                    className="ml-auto flex-shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity p-1"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
};
