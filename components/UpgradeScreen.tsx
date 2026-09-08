import React from 'react';

interface UpgradeScreenProps {
    title: string;
    description: string;
    requiredTier: 'plus' | 'pro';
}

export const UpgradeScreen: React.FC<UpgradeScreenProps> = ({ title, description, requiredTier }) => {
    const handleUpgradeClick = () => {
        window.dispatchEvent(new CustomEvent('gestor_financeiro_go_checkout'));
    };

    const tierLabel = requiredTier === 'pro' ? 'PRO' : 'PLUS e PRO';
    const tierColor = requiredTier === 'pro' 
        ? 'from-teal-600 to-indigo-600 text-teal-200 border-teal-500/30' 
        : 'from-amber-600 to-orange-600 text-amber-200 border-amber-500/30';

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in">
            <div className="max-w-xl w-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-md rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden group">
                {/* Background decorative glow */}
                <div className={`absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br ${requiredTier === 'pro' ? 'from-teal-500/10 to-indigo-500/10' : 'from-amber-500/10 to-orange-500/10'} rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700`} />
                <div className={`absolute -left-20 -bottom-20 w-48 h-48 bg-gradient-to-br ${requiredTier === 'pro' ? 'from-indigo-500/10 to-teal-500/10' : 'from-orange-500/10 to-amber-500/10'} rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700`} />
                
                <div className="relative z-10 flex flex-col items-center">
                    {/* Locked badge */}
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-6 shadow-sm">
                        <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                        </svg>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-gradient-to-r ${tierColor}`}>
                            Recurso {tierLabel}
                        </span>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
                        {title}
                    </h3>
                    
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mb-8">
                        {description}
                    </p>

                    <div className="h-px bg-slate-200 dark:bg-slate-800 w-full mb-8" />

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
                        <button
                            onClick={handleUpgradeClick}
                            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${
                                requiredTier === 'pro' 
                                    ? 'bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 shadow-teal-500/20' 
                                    : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20'
                            }`}
                        >
                            Fazer Upgrade Agora
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
