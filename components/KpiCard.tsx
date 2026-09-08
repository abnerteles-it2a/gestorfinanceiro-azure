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
            <div className="KpiCard flex flex-col p-5 rounded-xl bg-[#0D9488] text-white shadow-lg shadow-[#0D9488]/15 border-none hover:shadow-xl hover:shadow-[#0D9488]/20 transition-[box-shadow] duration-200 ease-out group min-h-[9.5rem]">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl mb-4 bg-white/20 text-white transition-transform duration-200 group-hover:scale-105 shadow-sm">
                    {React.isValidElement(icon) 
                        ? React.cloneElement(icon as React.ReactElement<any>, { className: 'h-5 w-5' })
                        : icon
                    }
                </div>
                <div className="flex-1 space-y-1">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-white/90">
                        {title}
                    </h3>
                    <p className="text-2xl font-bold leading-none truncate tracking-tight text-white tabular-nums">
                        {isPrivacyMode ? '••••' : value}
                    </p>
                </div>
                {subtext && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-[9px] font-black tracking-widest uppercase opacity-70 truncate text-white/80">
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
            className={`KpiCard omie-card ${isCompact ? '!p-4 min-h-[7rem]' : '!p-5 min-h-[9.5rem]'} flex justify-between items-center bg-white hover:shadow-md transition-[box-shadow] duration-200 group`}
            style={{ borderLeft: `6px solid ${accentColor}` }}
        >
            <div className="flex flex-col gap-1">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {title}
                </h3>
                <p className={`${isCompact ? 'text-lg' : 'text-xl'} font-bold text-[#020617] tracking-tight tabular-nums`}>
                    {isPrivacyMode ? '••••' : value}
                </p>
                {subtext && (
                    <span className={`text-[9px] font-black uppercase tracking-widest ${subtextColor || 'text-slate-500 dark:text-slate-400'}`}>
                        {subtext}
                    </span>
                )}
            </div>

            <div className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shadow-inner shrink-0`}>
                <div className="scale-125 opacity-30 group-hover:scale-110 group-hover:opacity-100 transition-all">
                    {React.isValidElement(icon) 
                        ? React.cloneElement(icon as React.ReactElement<any>, { className: 'h-5 w-5' })
                        : icon
                    }
                </div>
            </div>
        </div>
    );
};
