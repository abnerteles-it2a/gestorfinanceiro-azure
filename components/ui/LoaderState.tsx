import React from 'react';

interface LoaderStateProps {
    message?: string;
    className?: string;
}

export const LoaderState: React.FC<LoaderStateProps> = ({ 
    message = 'Carregando dados...', 
    className = '' 
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-12 w-full min-h-[200px] ${className}`}>
            <div className="relative flex items-center justify-center w-12 h-12 mb-4">
                {/* Ping animation behind the logo */}
                <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 animate-ping"></div>
                {/* Logo pulse */}
                <img 
                    src="/logo.png" 
                    alt="IT2A Loader" 
                    className="w-10 h-10 object-contain animate-pulse mix-blend-multiply dark:mix-blend-normal opacity-70"
                />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 animate-pulse">
                {message}
            </p>
        </div>
    );
};
