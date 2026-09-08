import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, id, name, ...props }, ref) => {
    return (
      <input
        id={id}
        name={name || id}
        ref={ref}
        className={`w-full px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-white text-sm outline-none transition-all
          ${error 
            ? 'border-rose-500 bg-rose-50/30 text-rose-900 focus:ring-2 focus:ring-rose-500/20' 
            : 'focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488]'
          }
          disabled:cursor-not-allowed disabled:opacity-50
          ${className || ''}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
