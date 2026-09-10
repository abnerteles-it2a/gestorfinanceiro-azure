import React from 'react';

interface KpiCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    subtext?: string;
    subtextColor?: string;
    isPrivacyMode?: boolean;
    variant?: 'standard' | 'primary';
    density?: 'default' | 'compact';
    color?: 'blue' | 'green' | 'rose' | 'amber' | 'indigo' | 'slate' | string;
}

const colorMap: Record<string, string> = {
    blue: '#3B82F6',
    green: '#10B981',
    rose: '#F43F5E',
    amber: '#F59E0B',
    indigo: '#6366F1',
    slate: '#64748B'
};

export const KpiCard: React.FC<KpiCardProps> = ({ 
    title, 
    value, 
    icon, 
    subtext, 
    subtextColor, 
    isPrivacyMode,
    variant = 'standard',
    density = 'default',
    color = 'slate'
}) => {
    const isCompact = density === 'compact';
    const isPrimary = variant === 'primary';
    const accentColor = colorMap[color as string] || (typeof color === 'string' && color.startsWith('#') ? color : colorMap.slate);

    if (isPrimary) {
        return (
            <div className="KpiCard flex flex-col p-3.5 sm:p-4 rounded-xl bg-[#0D9488] text-white shadow-md shadow-[#0D9488]/15 border border-teal-500/20 hover:border-teal-400/40 hover:shadow-lg hover:shadow-[#0D9488]/25 active:scale-[0.98] transition-all duration-200 ease-out group min-h-[5.5rem] sm:min-h-[6.5rem]">
                <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg mb-2 sm:mb-3 bg-white/20 text-white transition-transform duration-200 group-hover:scale-105 shadow-sm">
                    {React.isValidElement(icon) 
                        ? React.cloneElement(icon as React.ReactElement<any>, { className: 'h-4 w-4 sm:h-4.5 sm:w-4.5' })
                        : icon
                    }
                </div>
                <div className="flex-1 space-y-0.5">
                    <h3 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] text-white/90 truncate">
                        {title}
                    </h3>
                    <p className="text-base sm:text-lg lg:text-xl font-bold leading-tight truncate tracking-tight text-white tabular-nums">
                        {isPrivacyMode ? '••••' : value}
                    </p>
                </div>
                {subtext && (
                    <div className="mt-2 pt-2 border-t border-white/15">
                        <p className="text-[8.5px] sm:text-[9px] font-black tracking-widest uppercase opacity-80 truncate text-white/90">
                            {subtext}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            role="group"
            aria-label={title}
            className={`KpiCard omie-card ${isCompact ? '!p-3 sm:!p-3.5 min-h-[5rem] sm:min-h-[5.5rem]' : '!p-3.5 sm:!p-4 min-h-[5.5rem] sm:min-h-[6.5rem]'} flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 group`}
            style={{ borderLeft: `5px solid ${accentColor}` }}
        >
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <h3 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 truncate">
                    {title}
                </h3>
                <p className={`${isCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg lg:text-xl'} font-bold text-slate-900 dark:text-white tracking-tight tabular-nums truncate`}>
                    {isPrivacyMode ? '••••' : value}
                </p>
                {subtext && (
                    <span className={`text-[8.5px] sm:text-[9px] font-black uppercase tracking-widest truncate ${subtextColor || 'text-slate-500 dark:text-slate-400'}`}>
                        {subtext}
                    </span>
                )}
            </div>

            <div className={`${isCompact ? 'w-8 h-8' : 'w-9 h-9 sm:w-10 sm:h-10'} rounded-xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 dark:text-slate-300 border border-slate-100 dark:border-slate-700/60 shadow-inner shrink-0`}>
                <div className="scale-110 opacity-40 group-hover:scale-125 group-hover:opacity-100 transition-all">
                    {React.isValidElement(icon) 
                        ? React.cloneElement(icon as React.ReactElement<any>, { className: 'h-4 w-4 sm:h-4.5 sm:w-4.5' })
                        : icon
                    }
                </div>
            </div>
        </div>
    );
};
