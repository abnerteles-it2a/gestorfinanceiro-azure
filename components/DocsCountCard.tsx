import React from 'react';

const formatBytesPtBr = (bytes: number): string => {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    const v = b / Math.pow(1024, i);
    const decimals = i === 0 ? 0 : v >= 10 ? 0 : 1;
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })} ${units[i]}`;
};

export const DocsCountCard: React.FC<{ count: number; bytes?: number; scope?: 'personal' | 'org' }> = ({ count, bytes = 0, scope = 'personal' }) => {
    const countLabel = Number(count || 0).toLocaleString('pt-BR');
    const hasBytes = Number.isFinite(bytes) && bytes > 0;
    const scopeLabel = scope === 'org' ? 'Org' : 'Pessoal';
    return (
        <div role="group" aria-labelledby="docs-count-card-title" className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 h-full flex flex-col backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
                <h3 id="docs-count-card-title" className="text-label-caps !text-slate-400 truncate">
                    Cofre de Documentos
                </h3>
                <span className="shrink-0 text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg uppercase tracking-widest border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm">
                    {scopeLabel}
                </span>
            </div>
            <div className="flex-1 flex flex-col justify-center">
                <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums leading-none mb-2 tracking-tighter">
                    {countLabel}
                </div>
                <div className="text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap truncate opacity-80">
                    {hasBytes ? `Arquivos • ${formatBytesPtBr(bytes)}` : 'Arquivos Armazenados'}
                </div>
            </div>
        </div>
    );
};
