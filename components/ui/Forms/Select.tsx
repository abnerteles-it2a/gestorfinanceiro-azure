import React, { forwardRef } from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`w-full px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-white text-sm outline-none transition-all appearance-none
          ${error 
            ? 'border-rose-500 bg-rose-50/30 text-rose-900 focus:ring-2 focus:ring-rose-500/20' 
            : 'focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488]'
          }
          disabled:cursor-not-allowed disabled:opacity-50
          bg-no-repeat bg-[right_1rem_center] bg-[length:1em_1em]
          ${className || ''}`}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`
        }}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
