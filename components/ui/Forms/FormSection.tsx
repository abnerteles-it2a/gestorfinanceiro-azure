import React from 'react';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  noBorder?: boolean;
}

export const FormSection: React.FC<FormSectionProps> = ({ 
  title, 
  description, 
  children, 
  className = '',
  noBorder = false
}) => {
  return (
    <div className={`flex flex-col gap-5 ${noBorder ? '' : 'border-b border-slate-100 dark:border-slate-800/80 pb-8'} ${className}`}>
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h4>
        {description && (
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
};
