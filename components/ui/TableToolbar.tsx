import React from 'react';

interface TableToolbarProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({ title, subtitle, actions, filters }) => {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-bold text-slate-800 dark:text-white tracking-tight whitespace-nowrap">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-stretch lg:self-auto">
        {filters && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
            {filters}
          </div>
        )}
        {actions && (
           <div className="flex items-center gap-2 sm:border-l border-slate-200 dark:border-slate-700 sm:pl-3 w-full sm:w-auto justify-end shrink-0">
             {actions}
           </div>
        )}
      </div>
    </div>
  );
};
