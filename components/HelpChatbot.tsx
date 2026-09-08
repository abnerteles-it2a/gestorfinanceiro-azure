import React, { useState, useEffect, useRef } from 'react';
import { 
    XMarkIcon, 
    PaperAirplaneIcon, 
    SparklesIcon, 
    ChatBubbleLeftRightIcon, 
    RocketIcon,
    PlusIcon,
    BankIcon,
    DatabaseIcon,
    TrendingUpIcon,
    ChevronLeftIcon,
    TrashIcon,
    ArrowTopRightOnSquareIcon
} from './icons';
import { SmartTransactionWidget } from './SmartTransactionWidget';
import { SmartInvestmentWidget } from './SmartInvestmentWidget';
import { useTheme } from '../context/ThemeContext';
import { useFinancialData } from '../context/FinancialDataContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    source?: string;
    model?: string;
    searchResults?: Array<{
        title: string;
        uri: string;
        snippet: string;
    }>;
    suggestedQuestions?: string[];
}

interface HelpChatbotProps {
    currentView?: string;
    variant?: 'floating' | 'header';
}

type ChatMode = 'chat' | 'smart_transaction' | 'smart_investment';

export const HelpChatbot: React.FC<HelpChatbotProps> = ({ currentView, variant = 'floating' }) => {
    const { theme } = useTheme();
    const { viewMode } = useFinancialData();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "Olá! Bem-vindo ao Gestor Financeiro. \n\nSou seu assistente virtual e estou aqui para te ajudar a usar o sistema. \n\nVocê pode me perguntar sobre:\n- Como criar categorias\n- Como lançar despesas\n- Como cadastrar contas bancárias\n- E muito mais!\n\nComo posso te ajudar hoje?"
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showInvestmentOptions, setShowInvestmentOptions] = useState(false);
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [chatMode, setChatMode] = useState<ChatMode>('chat');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Chat initialization and persistence are handled via useEffect hooks below.
        // Direct event listeners for manual entry were removed to prioritize the focused manual modal experience.
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const renderMessageContent = (content: string) => {
        let normalized = String(content || '').replace(/\r\n/g, '\n');
        normalized = normalized.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '**$1**');
        if (normalized.length > 400 && normalized.split('\n').length < 6) {
            normalized = normalized.replace(/([.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ])/g, '$1\n');
        }
        normalized = normalized.replace(/^[\-\*]\s+(.*)$/gm, '• $1');
        return normalized.split('\n').map((line, i) => {
            const isListItem = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\.\s+/.test(line.trim());
            const parts = line.split(/(\*\*.*?\*\*)/g);
            
            return (
                <div key={i} className={`${isListItem ? 'pl-4 mb-1' : 'mb-2 min-h-[1.2em]'}`}>
                    {parts.map((part, j) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j}>{part.slice(2, -2)}</strong>;
                        }
                        return part;
                    })}
                </div>
            );
        });
    };

    useEffect(() => {
        const savedHistory = localStorage.getItem('gestor_financeiro_chat_history');
        if (savedHistory) {
            try {
                const parsed = JSON.parse(savedHistory);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const validMessages = parsed.filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'));
                    if (validMessages.length > 0) {
                        setMessages(validMessages);
                    }
                }
            } catch (e) {
                console.error('Failed to parse chat history:', e);
                localStorage.removeItem('gestor_financeiro_chat_history');
            }
        }
    }, []);

    useEffect(() => {
        if (messages.length > 1) {
             localStorage.setItem('gestor_financeiro_chat_history', JSON.stringify(messages));
        }
    }, [messages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen, chatMode]);

    const getAuthHeaders = (): Record<string,string> => {
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        try { 
            const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; 
            if (t) headers['Authorization'] = `Bearer ${t}`; 
        } catch {}
        if (viewMode) headers['x-view-mode'] = viewMode;
        return headers;
    };

    const handleSendMessage = async (textOverride?: string) => {
        const textToSend = textOverride || input;
        if (!textToSend.trim()) return;

        if (!textOverride) setInput('');
        setShowInvestmentOptions(false);
        setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
        setIsLoading(true);

        let investmentProfile = undefined;
        const lowerText = textToSend.toLowerCase();
        if (lowerText.includes('perfil conservador')) investmentProfile = 'Conservador';
        else if (lowerText.includes('perfil moderado')) investmentProfile = 'Moderado';
        else if (lowerText.includes('perfil arrojado')) investmentProfile = 'Arrojado';

        try {
            const response = await fetch('/api/ai/agent', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ 
                    query: textToSend,
                    context: {
                        currentView: currentView || 'unknown',
                        investmentProfile
                    }
                })
            });

            const data = await response.json();
            
            let replyText = data.reply || data.content || data.message || "";
            let suggestedQuestions = data.suggestedQuestions || [];

            if (replyText && typeof replyText === 'object') {
                const obj = replyText as any;
                if (obj.reply || obj.content) {
                    if (suggestedQuestions.length === 0 && obj.suggestedQuestions) {
                        suggestedQuestions = obj.suggestedQuestions;
                    }
                    replyText = obj.reply || obj.content;
                } else {
                    replyText = JSON.stringify(replyText, null, 2);
                }
            }

            // --- FRONTEND SAFETY NET: handle any residual JSON or code blocks ---
            if (typeof replyText === 'string') {
                // Strip markdown code block wrappers
                replyText = replyText.replace(/^```(?:json|markdown)?\s*/gi, '').replace(/```\s*$/g, '').trim();
                
                // If the response still looks like JSON with a reply field, extract it
                if (replyText.includes('"reply"')) {
                    try {
                        const si = replyText.indexOf('{');
                        const ei = replyText.lastIndexOf('}');
                        if (si !== -1 && ei > si) {
                            const parsed = JSON.parse(replyText.substring(si, ei + 1));
                            if (parsed.reply) {
                                if (suggestedQuestions.length === 0 && parsed.suggestedQuestions) {
                                    suggestedQuestions = parsed.suggestedQuestions;
                                }
                                replyText = parsed.reply;
                            }
                        }
                    } catch (e) {
                        // JSON parse failed - just use the text as-is after stripping markers
                        console.warn('[Chat] Frontend safety net: JSON parse failed, using cleaned text');
                    }
                }
            }

            if (typeof replyText !== 'string') {
                replyText = String(replyText || "");
            }

            if (replyText) {
                console.log(`[Chat] Response received. Model: ${data.model}, Source: ${data.source}`);
                setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: replyText, 
                    source: data.source,
                    model: data.model,
                    searchResults: data.searchResults,
                    suggestedQuestions: suggestedQuestions
                }]);
            } else {
                console.error('[Chat] Empty replyText after hygienizer process. Data:', data);
                const errorMsg = data.message || data.error || "Desculpe, não consegui processar sua pergunta no momento.";
                setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${errorMsg}`, source: 'error' }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Ocorreu um erro de conexão. Tente novamente mais tarde.", source: 'error' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearChat = () => {
        setMessages([{
            role: 'assistant',
            content: "Olá! Bem-vindo ao Gestor Financeiro. \n\nSou seu assistente virtual e estou aqui para te ajudar a usar o sistema. \n\nVocê pode me perguntar sobre:\n- Como criar categorias\n- Como lançar despesas\n- Como cadastrar contas bancárias\n- E muito mais!\n\nComo posso te ajudar hoje?"
        }]);
        localStorage.removeItem('gestor_financeiro_chat_history');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className={`${variant === 'floating' ? 'fixed bottom-6 right-6 flex flex-col items-end' : 'relative inline-flex items-center'} z-50 ${theme === 'dark' ? 'dark' : ''}`}>
            {isOpen && (
                <div className={`w-[85vw] sm:w-[480px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in ${variant === 'floating' ? 'mb-4' : 'absolute top-full right-0 mt-4'}`} style={{ maxHeight: '650px', height: '550px' }}>
                    <div className="bg-slate-900 dark:bg-black p-4 flex justify-between items-center text-white relative z-30">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg">
                                <SparklesIcon className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-slate-50">Concierge IA</h3>
                                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Online</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setChatMode('chat')}
                                className={`p-1.5 rounded-lg transition-all ${chatMode === 'chat' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                                title="Chat IA"
                            >
                                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                            </button>
                            <button 
                                onClick={() => setChatMode('smart_transaction')}
                                className={`p-1.5 rounded-lg transition-all ${chatMode === 'smart_transaction' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                                title="Lançamento Rápido"
                            >
                                <PlusIcon className="h-4 w-4" />
                            </button>
                            <button 
                                onClick={() => setChatMode('smart_investment')}
                                className={`p-1.5 rounded-lg transition-all ${chatMode === 'smart_investment' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                                title="Investimento Rápido"
                            >
                                <TrendingUpIcon className="h-4 w-4" />
                            </button>
                            <div className="w-px h-4 bg-white/10 mx-1"></div>
                            <button 
                                onClick={handleClearChat}
                                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                title="Reiniciar conversa"
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounden-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50 dark:bg-slate-900">
                        {chatMode === 'chat' ? (
                            <>
                                <div className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth custom-scrollbar">
                                    {messages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start items-start gap-3.5'}`}>
                                            {msg.role === 'assistant' && (
                                                <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                                    <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                                </div>
                                            )}
                                            <div 
                                                className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                                                    msg.role === 'user' 
                                                        ? 'bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl rounded-tr-none shadow-md shadow-slate-200/50 dark:shadow-none' 
                                                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none shadow-sm'
                                                }`}
                                            >
                                                {renderMessageContent(msg.content)}

                                                {msg.role === 'assistant' && msg.searchResults && msg.searchResults.length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                                                        <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Fontes:</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {msg.searchResults.slice(0, 3).map((result, i) => (
                                                                <a 
                                                                    key={i}
                                                                    href={result.uri} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="text-[10px] bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5 max-w-full truncate shadow-sm"
                                                                >
                                                                    <span className="truncate max-w-[120px] font-medium">{result.title || "Documento"}</span>
                                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0 opacity-70" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {msg.role === 'assistant' && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                                                    <div className="mt-4 flex flex-col gap-2">
                                                        {msg.suggestedQuestions.map((q, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => handleSendMessage(q)}
                                                                className="text-xs bg-slate-50 hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-900/80 text-indigo-600 dark:text-indigo-400 px-3.5 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 transition-all hover:border-indigo-300 dark:hover:border-indigo-500/50 text-left shadow-sm hover:shadow group flex items-center gap-3"
                                                            >
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 group-hover:scale-125 transition-transform"></div>
                                                                <span className="font-medium">{q}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {msg.role === 'assistant' && msg.source && (
                                                    <div className="mt-3 flex items-center justify-end">
                                                        <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                                            msg.source === 'google_vertex_ai' 
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' 
                                                                : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                        } flex items-center gap-1 font-bold uppercase`}>
                                                            {msg.source === 'google_vertex_ai' ? 'IA Google' : 'Motor Local'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex justify-start items-start gap-3.5">
                                            <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                                                <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none px-5 py-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col gap-2 mb-3">
                                        {!showInvestmentOptions ? (
                                            <div className="relative">
                                                <button 
                                                    onClick={() => setShowQuickActions(!showQuickActions)}
                                                    className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-xl cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900 transition-all border border-slate-200/50 dark:border-slate-700/50 w-full sm:w-auto justify-between shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <TrendingUpIcon className="h-3.5 w-3.5 text-indigo-500" />
                                                        <span>Comandos Rápidos</span>
                                                    </div>
                                                    <span className={`text-slate-400 transition-transform duration-300 ${showQuickActions ? 'rotate-180' : ''}`}>▾</span>
                                                </button>
                                                
                                                {showQuickActions && (
                                                    <div className="absolute bottom-full left-0 mb-3 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-2.5 z-40 animate-in slide-in-from-bottom-2 fade-in flex flex-col gap-1.5">
                                                        <div className="px-2 pt-1 pb-2">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Lançamento Rápido</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <button
                                                                    onClick={() => { setChatMode('smart_transaction'); setShowQuickActions(false); }}
                                                                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group"
                                                                >
                                                                    <PlusIcon className="h-5 w-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">Transação</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => { setChatMode('smart_investment'); setShowQuickActions(false); }}
                                                                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group"
                                                                >
                                                                    <TrendingUpIcon className="h-5 w-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">Investimento</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2"></div>
                                                        <button
                                                            onClick={() => { handleSendMessage("Gere uma análise financeira completa do meu mês."); setShowQuickActions(false); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                        >
                                                            <TrendingUpIcon className="h-4 w-4 text-indigo-500" />
                                                            Análise Financeira
                                                        </button>
                                                        <button
                                                            onClick={() => { setShowInvestmentOptions(true); setShowQuickActions(false); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                        >
                                                            <RocketIcon className="h-4 w-4 text-teal-500" />
                                                            Análise de Investimentos
                                                        </button>
                                                        <button
                                                            onClick={() => { const ev = new CustomEvent('openSettingsModal', { detail: { tab: 'accounts' } }); window.dispatchEvent(ev); setShowQuickActions(false); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                        >
                                                            <BankIcon className="h-4 w-4 text-blue-500" />
                                                            Criar Conta
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1.5 animate-in slide-in-from-right-2 fade-in">
                                                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                                                    <span>Perfil de Risco:</span>
                                                    <button onClick={() => setShowInvestmentOptions(false)} className="hover:text-slate-600 dark:hover:text-slate-200 p-1">
                                                        <XMarkIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                                    <button
                                                        onClick={() => handleSendMessage("Gere uma análise de investimentos considerando meu perfil Conservador.")}
                                                        className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-xl border border-emerald-100 dark:border-emerald-800/50 whitespace-nowrap"
                                                    >
                                                        🛡️ Conservador
                                                    </button>
                                                    <button
                                                        onClick={() => handleSendMessage("Gere uma análise de investimentos considerando meu perfil Moderado.")}
                                                        className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-xl border border-amber-100 dark:border-amber-800/50 whitespace-nowrap"
                                                    >
                                                        ⚖️ Moderado
                                                    </button>
                                                    <button
                                                        onClick={() => handleSendMessage("Gere uma análise de investimentos considerando meu perfil Arrojado.")}
                                                        className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-[10px] font-bold rounded-xl border border-rose-100 dark:border-rose-800/50 whitespace-nowrap"
                                                    >
                                                        🚀 Arrojado
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2.5">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="Como posso te ajudar?"
                                            className="flex-1 px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 border border-slate-200 dark:border-slate-700 transition-all shadow-inner"
                                            disabled={isLoading}
                                        />
                                        <button
                                            onClick={() => handleSendMessage()}
                                            disabled={isLoading || !input.trim()}
                                            className="bg-slate-900 dark:bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-black dark:hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <PaperAirplaneIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-2 mb-6">
                                    <button 
                                        onClick={() => setChatMode('chat')}
                                        className="p-2 -ml-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <ChevronLeftIcon className="h-5 w-5" />
                                    </button>
                                    <h3 className="font-bold text-slate-800 dark:text-white">
                                        {chatMode === 'smart_transaction' ? 'Novo Lançamento Inteligente' : 'Novo Investimento Inteligente'}
                                    </h3>
                                </div>

                                {chatMode === 'smart_transaction' ? (
                                    <div className="chat-widget-override">
                                        <SmartTransactionWidget />
                                    </div>
                                ) : (
                                    <div className="chat-widget-override">
                                        <SmartInvestmentWidget />
                                    </div>
                                )}
                                
                                <div className="mt-8 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50">
                                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed italic">
                                        "Dica: Você pode digitar naturalmente como se estivesse falando comigo. Eu cuido de identificar os valores, datas e categorias para você."
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className={variant === 'floating' ? 
                    `p-4 rounded-2xl shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center ${isOpen ? 'bg-slate-600 hover:bg-slate-700 text-white rotate-90 shadow-black/20' : 'bg-slate-900 text-white shadow-slate-900/30'}`
                    : `relative p-3 rounded-xl transition-all duration-300 flex items-center justify-center ${isOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white' : 'bg-slate-900 dark:bg-slate-800 text-white shadow-lg shadow-black/20 hover:scale-110'}`
                }
                title={isOpen ? "Fechar Concierge" : "Concierge IA"}
            >
                {isOpen ? (
                    <XMarkIcon className="h-6 w-6" />
                ) : (
                    <>
                        <SparklesIcon className="h-6 w-6" />
                        {variant === 'header' && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white dark:border-slate-800"></span>
                            </span>
                        )}
                    </>
                )}
            </button>
        </div>
    );
};
