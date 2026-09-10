import React from 'react';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';

interface VoiceRecordButtonProps {
  onSpeechResult: (text: string) => void;
  isProcessing?: boolean;
  className?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const VoiceRecordButton: React.FC<VoiceRecordButtonProps> = ({
  onSpeechResult,
  isProcessing = false,
  className = '',
  label = 'Lançar por Voz',
  size = 'md',
}) => {
  const { isListening, isSupported, startListening, stopListening, interimTranscript } =
    useVoiceRecognition({
      onResult: (result) => {
        if (result && result.trim().length > 0) {
          onSpeechResult(result.trim());
        }
      },
    });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return null; // Oculta silenciosamente se o navegador não suportar Web Speech API
  }

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-xs gap-2',
    lg: 'px-4 py-2 text-sm gap-2.5',
  }[size];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isProcessing}
        title={isListening ? 'Clique para parar de gravar' : 'Clique e fale os dados do lançamento'}
        className={`relative inline-flex items-center rounded-lg font-medium transition-all duration-200 shadow-sm select-none ${sizeClasses} ${
          isListening
            ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30 shadow-md animate-pulse'
            : isProcessing
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 cursor-wait'
            : 'bg-gradient-to-r from-teal-500/10 to-emerald-500/10 hover:from-teal-500/20 hover:to-emerald-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/20 dark:border-teal-500/30'
        }`}
      >
        {isListening && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
          </span>
        )}

        {/* Microfone Icon */}
        <svg
          className={`w-4 h-4 transition-transform ${isListening ? 'scale-110' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isListening ? (
            // Mic ativo / onda
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          ) : (
            // Mic normal
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          )}
        </svg>

        <span>
          {isListening
            ? 'Ouvindo... Fale agora'
            : isProcessing
            ? 'Processando com IA...'
            : label}
        </span>
      </button>

      {/* Exibição em tempo real do que está sendo captado */}
      {isListening && interimTranscript && (
        <span className="text-xs italic text-slate-500 dark:text-slate-400 max-w-xs truncate animate-fade-in">
          "{interimTranscript}"
        </span>
      )}
    </div>
  );
};
