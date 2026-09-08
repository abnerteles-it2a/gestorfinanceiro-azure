import React from 'react';

type EmptyStateVariant = 'zero' | 'no_results' | 'error';

interface EmptyStateProps {
    title: string;
    description?: string;
    variant?: EmptyStateVariant;
    icon?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    variant = 'zero',
    icon,
    actionLabel,
    onAction,
    className = ''
}) => {
    const isZero = variant === 'zero';
    const isError = variant === 'error';

    return (
        <div className={`flex flex-col items-center justify-center p-10 text-center w-full h-full rounded-xl transition-all ${
            isZero 
                ? 'bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200/60 dark:border-slate-700/50 border-dashed'
                : 'bg-transparent'
        } ${className}`}>
            
            {icon && (
                <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${
                    isError 
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' 
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}>
                    {icon}
                </div>
            )}
            
            <h3 className={`text-sm font-bold tracking-tight ${isError ? 'text-red-900 dark:text-red-400' : 'text-[#020617] dark:text-white'}`}>
                {title}
            </h3>
            
            {description && (
                <p className={`mt-1 text-[13px] font-medium max-w-sm ${isError ? 'text-red-600/80 dark:text-red-500/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    {description}
                </p>
            )}
            
            {actionLabel && onAction && (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={onAction}
                        className={`inline-flex items-center px-8 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-full transition-all ${
                            variant === 'no_results'
                                ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                                : isError 
                                    ? 'bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-md'
                                    : 'bg-[#0D9488] hover:bg-[#0F766E] text-white shadow-md'
                        }`}
                    >
                        {actionLabel}
                    </button>
                </div>
            )}
        </div>
    );
};
