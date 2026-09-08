import React from 'react';

export interface FormFieldProps {
  label: React.ReactNode;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ 
  label, 
  error, 
  helperText, 
  children, 
  className = '',
  htmlFor 
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor={htmlFor || undefined}
        className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest"
      >
        {label}
      </label>
      
      {children}
      
      {error && (
        <p className="text-[11px] font-bold text-rose-500 mt-0.5 animate-in slide-in-from-top-1 opacity-0 fade-in duration-200 fill-mode-forwards">
          {error}
        </p>
      )}
      
      {!error && helperText && (
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
          {helperText}
        </p>
      )}
    </div>
  );
};
