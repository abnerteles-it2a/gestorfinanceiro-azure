import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import { 
    MessageSquareIcon, 
    PlusIcon, 
    CheckCircleIcon, 
    ClockIcon, 
    AlertTriangleIcon, 
    ArrowUpIcon,
    XIcon,
    ChevronRightIcon,
    SendIcon,
    HelpCircleIcon,
    LightbulbIcon
} from './icons';

interface Ticket {
    id: string;
    subject: string;
    status: 'open' | 'closed' | 'pending';
    category: string;
    created_at: string;
    last_message_at?: string;
    last_message_is_admin_reply?: boolean;
}

interface Message {
    id: string;
    user_id: string;
    message: string;
    is_admin_reply: boolean;
    created_at: string;
}

interface FeatureRequest {
    id: string;
    title: string;
    description: string;
    status: string;
    upvotes: number;
    my_vote: boolean;
    created_at: string;
}

export const SupportPortal: React.FC = () => {
    const { showToast } = useToast();
    const [view, setView] = useState<'tickets' | 'features'>('tickets');
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [features, setFeatures] = useState<FeatureRequest[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [ticketMessages, setTicketMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [unreadAdminReplies, setUnreadAdminReplies] = useState(0);
    
    // Forms
    const [showNewTicketModal, setShowNewTicketModal] = useState(false);
    const [newTicket, setNewTicket] = useState({ subject: '', category: 'bug', message: '' });
    const [newReply, setNewReply] = useState('');
    const [showNewFeatureModal, setShowNewFeatureModal] = useState(false);
    const [newFeature, setNewFeature] = useState({ title: '', description: '' });

    const getAuthHeaders = () => {
        const token = window.localStorage.getItem('gestor_financeiro_app_token') || window.localStorage.getItem('financeplus_app_token') || '';
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    };

    const fetchTickets = async () => {
        try {
            const res = await fetch('/api/support?action=list_user_tickets', { headers: getAuthHeaders() });
            const data = await res.json();
            const list: Ticket[] = data.tickets || [];
            setTickets(list);
            try {
                const unread = list.filter(t => {
                    if (!t.last_message_at) return false;
                    if (!t.last_message_is_admin_reply) return false;
                    const lastTs = new Date(t.last_message_at).getTime();
                    if (!Number.isFinite(lastTs)) return false;
                    const seenKey = `gestor_financeiro_support_seen_${t.id}`;
                    const seenRaw = localStorage.getItem(seenKey) || '';
                    const seenTs = seenRaw ? Number(seenRaw) : 0;
                    return lastTs > (Number.isFinite(seenTs) ? seenTs : 0);
                }).length;
                setUnreadAdminReplies(unread);
            } catch {}
        } catch (e) {
            console.error(e);
        }
    };

    const fetchFeatures = async () => {
        try {
            const res = await fetch('/api/support?action=list_features', { headers: getAuthHeaders() });
            const data = await res.json();
            setFeatures(data.features || []);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchTicketDetails = async (id: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action: 'get_ticket_details', ticketId: id })
            });
            const data = await res.json();
            if (data.ticket) {
                setSelectedTicket(data.ticket);
                setTicketMessages(data.messages || []);
                try {
                    localStorage.setItem(`gestor_financeiro_support_seen_${id}`, String(Date.now()));
                } catch {}
            }
        } catch (e) {
            showToast('Erro ao carregar detalhes.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (view === 'tickets') fetchTickets();
        else fetchFeatures();
    }, [view]);

    const handleCreateTicket = async () => {
        if (!newTicket.subject || !newTicket.message) return;
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action: 'create_ticket', ...newTicket })
            });
            if (res.ok) {
                showToast('Chamado aberto com sucesso!', 'success');
                setShowNewTicketModal(false);
                setNewTicket({ subject: '', category: 'bug', message: '' });
                fetchTickets();
            }
        } catch (e) {
            showToast('Erro ao abrir chamado.', 'error');
        }
    };

    const handleReply = async () => {
        if (!newReply || !selectedTicket) return;
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action: 'add_message', ticketId: selectedTicket.id, message: newReply })
            });
            if (res.ok) {
                setNewReply('');
                fetchTicketDetails(selectedTicket.id);
            }
        } catch (e) {
            showToast('Erro ao enviar resposta.', 'error');
        }
    };

    const handleUpvote = async (id: string) => {
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action: 'toggle_upvote', requestId: id })
            });
            if (res.ok) fetchFeatures();
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateFeature = async () => {
        if (!newFeature.title) return;
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ action: 'create_feature', ...newFeature })
            });
            if (res.ok) {
                showToast('Sugestão enviada!', 'success');
                setShowNewFeatureModal(false);
                setNewFeature({ title: '', description: '' });
                fetchFeatures();
            }
        } catch (e) {
            showToast('Erro ao enviar sugestão.', 'error');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'open': return <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100 uppercase tracking-wider"><ClockIcon className="h-3 w-3"/> Aberto</span>;
            case 'pending': return <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-100 uppercase tracking-wider"><AlertTriangleIcon className="h-3 w-3"/> Aguardando</span>;
            case 'closed': return <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-100 uppercase tracking-wider"><CheckCircleIcon className="h-3 w-3"/> Resolvido</span>;
            default: return status;
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <HelpCircleIcon className="h-7 w-7 text-indigo-500" /> Suporte & Feedback
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Estamos aqui para ajudar você a crescer.</p>
                </div>
                
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit self-start md:self-end shadow-inner border border-slate-200 dark:border-slate-700">
                    <button 
                        onClick={() => { setView('tickets'); setSelectedTicket(null); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'tickets' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                    >
                        <MessageSquareIcon className="h-4 w-4" /> Chamados
                        {unreadAdminReplies > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                                {unreadAdminReplies}
                            </span>
                        )}
                    </button>
                    <button 
                        onClick={() => { setView('features'); setSelectedTicket(null); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'features' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                    >
                        <LightbulbIcon className="h-4 w-4" /> Sugestões
                    </button>
                </div>
            </div>

            {view === 'tickets' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Ticket List */}
                    <div className={`${selectedTicket ? 'hidden lg:block' : 'block'} lg:col-span-4 space-y-4`}>
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-label-caps !text-slate-400">Meus Chamados</h2>
                            <button 
                                onClick={() => setShowNewTicketModal(true)}
                                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                            >
                                <PlusIcon className="h-4 w-4" /> Novo Chamado
                            </button>
                        </div>
                        
                        <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
                            {tickets.length === 0 ? (
                                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                                    <MessageSquareIcon className="h-10 w-10 text-slate-300 mx-auto mb-2 opacity-50" />
                                    <p className="text-slate-500 text-sm">Nenhum chamado aberto ainda.</p>
                                </div>
                            ) : tickets.map(t => (
                                <button 
                                    key={t.id}
                                    onClick={() => fetchTicketDetails(t.id)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedTicket?.id === t.id ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50 shadow-md ring-1 ring-indigo-100 dark:ring-indigo-900/30' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-800/50 shadow-sm'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        {getStatusBadge(t.status)}
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                try {
                                                    if (!t.last_message_at || !t.last_message_is_admin_reply) return null as any;
                                                    const lastTs = new Date(t.last_message_at).getTime();
                                                    if (!Number.isFinite(lastTs)) return null as any;
                                                    const seenRaw = localStorage.getItem(`gestor_financeiro_support_seen_${t.id}`) || '';
                                                    const seenTs = seenRaw ? Number(seenRaw) : 0;
                                                    const unread = lastTs > (Number.isFinite(seenTs) ? seenTs : 0);
                                                    if (!unread) return null as any;
                                                    return <span className="inline-block h-2 w-2 rounded-full bg-rose-500" title="Nova resposta" />;
                                                } catch {
                                                    return null as any;
                                                }
                                            })()}
                                            <span className="text-[10px] text-slate-400 font-medium">{formatDate(t.created_at)}</span>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{t.subject}</h3>
                                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-tight font-medium opacity-70">Categoria: {t.category === 'bug' ? 'Bug / Erro' : t.category === 'improvement' ? 'Melhoria' : 'Outro'}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ticket Chat */}
                    <div className={`${selectedTicket ? 'block' : 'hidden lg:flex'} lg:col-span-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-xl overflow-hidden flex flex-col h-[70vh]`}>
                        {selectedTicket ? (
                            <>
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setSelectedTicket(null)} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-indigo-600 transition-colors">
                                            <XIcon className="h-5 w-5" />
                                        </button>
                                        <div>
                                            <h2 className="font-bold text-slate-800 dark:text-white leading-tight">{selectedTicket.subject}</h2>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {getStatusBadge(selectedTicket.status)}
                                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">ID: {selectedTicket.id.slice(0,8)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/10">
                                    {ticketMessages.map(m => (
                                        <div key={m.id} className={`flex ${m.is_admin_reply ? 'justify-start' : 'justify-end'}`}>
                                            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${m.is_admin_reply 
                                                ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-600 rounded-bl-none' 
                                                : 'bg-indigo-600 text-white rounded-br-none shadow-indigo-100 dark:shadow-none'}`}
                                            >
                                                {m.is_admin_reply && (
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Equipe Gestor</span>
                                                    </div>
                                                )}
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
                                                <div className={`text-[9px] mt-2 opacity-60 font-bold ${m.is_admin_reply ? 'text-slate-400' : 'text-indigo-100 text-right'}`}>
                                                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {formatDate(m.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {selectedTicket.status !== 'closed' && (
                                    <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                                        <div className="relative group">
                                            <textarea 
                                                value={newReply}
                                                onChange={e => setNewReply(e.target.value)}
                                                placeholder="Escreva sua resposta..."
                                                className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500/50 resize-none h-20 transition-all custom-scrollbar dark:text-slate-200"
                                            />
                                            <button 
                                                onClick={handleReply}
                                                disabled={!newReply.trim()}
                                                className="absolute bottom-3 right-3 p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 disabled:opacity-30 disabled:shadow-none transition-all"
                                            >
                                                <SendIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-full mb-4">
                                    <MessageSquareIcon className="h-12 w-12 text-indigo-200 dark:text-indigo-900/50" />
                                </div>
                                <h3 className="text-slate-800 dark:text-white font-bold text-lg">Central de Atendimento</h3>
                                <p className="text-slate-500 max-w-xs mt-2 text-sm">Selecione um chamado ao lado para ver o histórico de conversas com nossa equipe.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <div>
                            <h2 className="text-label-caps !text-slate-400">Sugestões da Comunidade</h2>
                            <p className="text-xs text-slate-500 mt-1">Vote nas funcionalidades que você quer ver no aplicativo.</p>
                        </div>
                        <button 
                            onClick={() => setShowNewFeatureModal(true)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                            <PlusIcon className="h-4 w-4" /> Sugerir Funcionalidade
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map(f => (
                            <div key={f.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${f.status === 'shipped' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : f.status === 'planned' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                                        {f.status === 'shipped' ? 'Entregue' : f.status === 'planned' ? 'Planejado' : 'Sugestão'}
                                    </span>
                                    <button 
                                        onClick={() => handleUpvote(f.id)}
                                        className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all ${f.my_vote ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 hover:border-indigo-200 hover:text-indigo-600'}`}
                                    >
                                        <ArrowUpIcon className="h-5 w-5" />
                                        <span className="text-xs font-bold">{f.upvotes}</span>
                                    </button>
                                </div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-lg leading-tight mb-2">{f.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400/80 leading-relaxed mb-6 flex-1 line-clamp-3">{f.description}</p>
                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50 dark:border-slate-700/50">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{formatDate(f.created_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* New Ticket Modal */}
            {showNewTicketModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[32px] p-8 shadow-2xl relative animate-in slide-in-from-bottom-4 duration-300">
                        <button onClick={() => setShowNewTicketModal(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <XIcon className="h-6 w-6" />
                        </button>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">Novo Chamado</h2>
                        
                        <div className="space-y-5">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Assunto</label>
                                <input 
                                    type="text"
                                    value={newTicket.subject}
                                    onChange={e => setNewTicket({...newTicket, subject: e.target.value})}
                                    placeholder="Ex: Erro ao importar extrato"
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Categoria</label>
                                <select 
                                    value={newTicket.category}
                                    onChange={e => setNewTicket({...newTicket, category: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white appearance-none cursor-pointer"
                                >
                                    <option value="bug">🐛 Bug / Erro no Sistema</option>
                                    <option value="improvement">🚀 Sugestão de Melhoria</option>
                                    <option value="question">❓ Dúvida de Uso</option>
                                    <option value="other">📦 Outros</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Mensagem</label>
                                <textarea 
                                    value={newTicket.message}
                                    onChange={e => setNewTicket({...newTicket, message: e.target.value})}
                                    placeholder="Descreva o problema com o máximo de detalhes possível..."
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 h-32 resize-none custom-scrollbar dark:text-white"
                                />
                            </div>
                            <button 
                                onClick={handleCreateTicket}
                                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all text-sm mt-4 uppercase tracking-widest"
                            >
                                Enviar Chamado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Feature Modal */}
            {showNewFeatureModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[32px] p-8 shadow-2xl relative animate-in slide-in-from-bottom-4 duration-300">
                        <button onClick={() => setShowNewFeatureModal(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <XIcon className="h-6 w-6" />
                        </button>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Sugerir Funcionalidade</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Ajude-nos a construir o melhor gestor financeiro do Brasil.</p>
                        
                        <div className="space-y-5">
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Título da Sugestão</label>
                                <input 
                                    type="text"
                                    value={newFeature.title}
                                    onChange={e => setNewFeature({...newFeature, title: e.target.value})}
                                    placeholder="Ex: Dashboard de Investimentos Cripto"
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Descrição</label>
                                <textarea 
                                    value={newFeature.description}
                                    onChange={e => setNewFeature({...newFeature, description: e.target.value})}
                                    placeholder="Explique como essa funcionalidade ajudaria você no dia a dia..."
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 text-sm focus:ring-2 focus:ring-indigo-500 h-32 resize-none custom-scrollbar dark:text-white"
                                />
                            </div>
                            <button 
                                onClick={handleCreateFeature}
                                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all text-sm mt-4 uppercase tracking-widest"
                            >
                                Publicar Sugestão
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
