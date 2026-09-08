import React from 'react';

export type StatusTagType = 'success' | 'warning' | 'error' | 'info' | 'default';

interface StatusTagProps {
    children: React.ReactNode;
    type?: StatusTagType;
    className?: string;
}

const statusStyles: Record<StatusTagType, string> = {
    success: 'bg-emerald-100/80 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
    warning: 'bg-amber-100/80 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
    error: 'bg-rose-100/80 border border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400',
    info: 'bg-[#00B4D8]/10 border border-[#00B4D8]/20 text-[#00B4D8] dark:bg-[#00B4D8]/10 dark:border-[#00B4D8]/20 dark:text-[#00B4D8]',
    default: 'bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
};

export const StatusTag: React.FC<StatusTagProps> = ({ children, type = 'default', className = '' }) => {
    const baseStyle = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    const typeStyle = statusStyles[type];

    return (
        <span className={`${baseStyle} ${typeStyle} ${className}`}>
            {children}
        </span>
    );
};
