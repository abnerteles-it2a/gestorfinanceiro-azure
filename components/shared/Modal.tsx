
import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    zIndex?: number;
    variant?: 'overlay' | 'inline';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, size = 'md', zIndex = 50, variant = 'overlay' }) => {
    if (!isOpen) return null;

    const sizeClass = size === 'xl'
        ? 'max-w-4xl'
        : size === 'lg'
        ? 'max-w-2xl'
        : size === 'sm'
        ? 'max-w-sm'
        : size === 'full'
        ? (variant === 'inline' ? 'max-w-full' : 'max-w-full m-4')
        : 'max-w-md';

    const card = (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-modal-title"
            className={`modal bg-white rounded-2xl shadow-2xl w-full ${sizeClass} flex flex-col max-h-[90vh] animate-portal-enter`}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h2 id="app-modal-title" className="text-2xl font-black text-[#0D9488] uppercase tracking-tight">{title}</h2>
                <button onClick={onClose} aria-label="Fechar janela" className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
                {children}
            </div>
            {footer && (
                <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4 shrink-0">
                    {footer}
                </div>
            )}
        </div>
    );

    if (variant === 'inline') {
        return card;
    }

    return createPortal(
        <div 
            className="fixed inset-0 bg-[#020617]/40 backdrop-blur-sm flex justify-center items-center p-4 sm:p-6 animate-fade-in"
            style={{ zIndex }}
            onClick={onClose}
        >
            {card}
        </div>,
        document.body
    );
};
