
import React, { useEffect, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './shared/Modal';
import { KpiCard } from './KpiCard';
import { UsersIcon, ShieldIcon, DatabaseIcon, PlusIcon, PaperAirplaneIcon, TrashIcon, SettingsIcon } from './icons';
import { UpgradeScreen } from './UpgradeScreen';

interface OrgMember {
    id: string;
    user_id: string;
    role: string;
    email: string;
    full_name?: string;
    joined_at?: string;
}

interface OrgCostCenter { id: string; name: string; owner_name?: string; }
interface Permission { id: string; cost_center_id: string; role: string; }

export const OrgAdminPanel: React.FC = () => {
    const { organizationInfo, orgRole, planInfo, refreshData, viewMode, subscriptionInfo } = useFinancialData();
    const { showToast } = useToast();

    const tier = String(planInfo?.tier || 'starter').toLowerCase();

    if (tier !== 'pro') {
        return (
            <UpgradeScreen 
                title="Gestão Corporativa"
                description="Centralize a gestão de múltiplas empresas, controle de assentos/licenças de multi-usuários, estruturação de centros de custo e controle de permissões por unidade de negócio."
                requiredTier="pro"
            />
        );
    }

    const [members, setMembers] = useState<OrgMember[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Invite State
    const [inviteModalOpen, setInviteModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [busy, setBusy] = useState(false);

    // Create Member State
    const [createMemberModalOpen, setCreateMemberModalOpen] = useState(false);
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [newMemberPassword, setNewMemberPassword] = useState('');
    const [newMemberRole, setNewMemberRole] = useState('member');

    // CC State
    const [activeTab, setActiveTab] = useState<'members' | 'cost_centers'>('members');
    const [costCenters, setCostCenters] = useState<OrgCostCenter[]>([]);
    const [createCCModalOpen, setCreateCCModalOpen] = useState(false);
    const [newCCName, setNewCCName] = useState('');

    // Permissions State
    const [permissionsModal, setPermissionsModal] = useState<{ open: boolean; userId: string; userName: string } | null>(null);
    const [userPermissions, setUserPermissions] = useState<Permission[]>([]);

    const [passwordModal, setPasswordModal] = useState<{ open: boolean; userId: string; email: string } | null>(null);
    const [resetPasswordVal, setResetPasswordVal] = useState('');

    const getToken = () => window.localStorage.getItem('gestor_financeiro_app_token') || '';

    const getHeaders = () => {
        const h: Record<string, string> = { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${getToken()}` 
        };
        if (viewMode) h['x-view-mode'] = viewMode;
        return h;
    };

    const loadMembers = async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'list_members' })
            });
            let j: any = {};
            try { j = await r.json(); } catch { j = { error: 'invalid_json', raw: r.status }; }
            if (r.ok) {
                setMembers(j.members || []);
            } else {
                // Visible error for debugging in Amplify
                console.error(`[OrgAdmin] list_members failed: HTTP ${r.status}`, j);
                showToast(`Erro ao carregar membros (${r.status}): ${j.error || 'desconhecido'}`, 'error');
            }
        } catch (e: any) {
            console.error('[OrgAdmin] loadMembers network error:', e);
            showToast(`Erro de rede ao carregar membros: ${e.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadCostCenters = async () => {
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'list_org_cost_centers' })
            });
            const j = await r.json();
            if (r.ok) setCostCenters(j.cost_centers || []);
            else console.error('Failed to load cost centers:', j.error);
        } catch (e) { console.error('Error loading cost centers:', e); }
    };

    const handleCreateCC = async () => {
        if (!newCCName) return;
        setBusy(true);
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'create_org_cost_center', name: newCCName })
            });
            if (r.ok) {
                showToast('Centro de custo criado!', 'success');
                setNewCCName('');
                setCreateCCModalOpen(false);
                loadCostCenters();
                refreshData?.();
            } else {
                showToast('Erro ao criar centro de custo', 'error');
            }
        } catch {
            showToast('Erro de conexão', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteCC = async (id: string) => {
        if (!confirm('Tem certeza? Isso pode afetar transações existentes.')) return;
        try {
             const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'delete_org_cost_center', id })
            });
            if (r.ok) {
                showToast('Centro de custo removido', 'success');
                loadCostCenters();
                refreshData?.();
            } else {
                showToast('Erro ao remover', 'error');
            }
        } catch {
            showToast('Erro de conexão', 'error');
        }
    };

    const handleOpenPermissions = async (userId: string, userName: string) => {
        setPermissionsModal({ open: true, userId, userName });
        setUserPermissions([]);
        // Load permissions
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'get_user_permissions', user_id: userId })
            });
            const j = await r.json();
            if (r.ok) setUserPermissions(j.permissions || []);
        } catch {}
        
        // Load CCs if not loaded
        if (costCenters.length === 0) loadCostCenters();
    };

    const handleUpdatePermission = async (ccId: string, role: string) => {
        if (!permissionsModal) return;
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ 
                    action: 'update_permission', 
                    user_id: permissionsModal.userId,
                    cost_center_id: ccId,
                    role 
                })
            });
            if (r.ok) {
                // Update local state
                setUserPermissions(prev => {
                    const filtered = prev.filter(p => p.cost_center_id !== ccId);
                    if (role !== 'none') {
                        filtered.push({ id: 'temp', cost_center_id: ccId, role });
                    }
                    return filtered;
                });
                showToast('Permissão atualizada.', 'success');
            } else {
                 showToast('Erro ao atualizar permissão.', 'error');
            }
        } catch {
             showToast('Erro de conexão.', 'error');
        }
    };

    const handleResetPassword = async () => {
        if (!passwordModal || !resetPasswordVal) return;
        setBusy(true);
        try {
            const r = await fetch('/api/org_admin', { 
                method: 'POST', 
                headers: getHeaders(), 
                body: JSON.stringify({ 
                    action: 'change_member_password', 
                    user_id: passwordModal.userId, 
                    password: resetPasswordVal 
                }) 
            });
            if (r.ok) {
                showToast('Senha alterada!', 'success');
                setPasswordModal(null);
                setResetPasswordVal('');
            } else {
                showToast('Erro ao alterar senha', 'error');
            }
        } catch {
            showToast('Erro de conexão', 'error');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (organizationInfo?.id && (orgRole === 'owner' || orgRole === 'admin')) {
            loadMembers();
            loadCostCenters();
        }
    }, [organizationInfo, orgRole]);

    const handleInvite = async () => {
        if (!inviteEmail) return;
        setBusy(true);
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ action: 'invite_member', email: inviteEmail })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'Failed to invite');
            
            setInviteEmail('');
            setInviteModalOpen(false);
            loadMembers();
            
            // Show the invite link to the user since there is no SMTP
            const inviteLink = `${window.location.origin}/?invite=${j.token}`;
            prompt('Convite gerado! Como não há envio de e-mail automático configurado, copie o link abaixo e envie para o parceiro:', inviteLink);
            showToast('Convite gerado. Envie o link manualmente.', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleCreateMember = async () => {
        if (!newMemberEmail || !newMemberName || !newMemberPassword) return;
        setBusy(true);
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ 
                    action: 'create_member_direct', 
                    email: newMemberEmail,
                    name: newMemberName,
                    password: newMemberPassword,
                    role: newMemberRole
                })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || 'Failed to create member');
            
            showToast('Membro criado com sucesso!', 'success');
            setNewMemberName('');
            setNewMemberEmail('');
            setNewMemberPassword('');
            setCreateMemberModalOpen(false);
            loadMembers();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (userId: string) => {
        if (!confirm('Tem certeza que deseja remover este membro?')) return;
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ action: 'remove_member', user_id: userId })
            });
            if (!r.ok) {
                const j = await r.json();
                throw new Error(j.error || 'Failed to remove');
            }
            showToast('Membro removido.', 'success');
            loadMembers();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleChangeRole = async (userId: string, newRole: string) => {
        try {
            const r = await fetch('/api/org_admin', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ action: 'update_role', user_id: userId, role: newRole })
            });
            if (!r.ok) {
                const j = await r.json();
                throw new Error(j.error || 'Failed to update role');
            }
            showToast('Função atualizada.', 'success');
            loadMembers();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    if (!organizationInfo) return <div className="p-8 text-center text-slate-500">Você não pertence a uma organização.</div>;
    if (orgRole !== 'owner' && orgRole !== 'admin') return <div className="p-8 text-center text-red-500">Acesso negado. Apenas administradores podem ver esta página.</div>;

    const seats = organizationInfo.seats || 1;
    const usedSeats = members.length;
    const isFull = usedSeats >= seats;
    const percentage = Math.min(100, (usedSeats / seats) * 100);

    return (
        <div className="space-y-8 animate-fade-in pb-8 px-1">
            {/* Header: Camada de Título (Enterprise Style) */}
            <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-label-caps !text-slate-400">Governança Corporativa</h1>
                        <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full uppercase tracking-widest border border-indigo-100 dark:border-indigo-800">
                            Enterprise Admin
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed italic">
                        {organizationInfo.name} • Painel de Controle de Identidade e Acesso
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {activeTab === 'members' && (
                        <>
                            <button 
                                onClick={() => setCreateMemberModalOpen(true)}
                                disabled={isFull || subscriptionInfo?.isTrial}
                                title={subscriptionInfo?.isTrial ? 'Recurso desbloqueado apenas após a assinatura efetiva do plano Pro.' : undefined}
                                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-sm shadow-slate-100 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PlusIcon className="h-4 w-4 text-emerald-500" />
                                Membro Direto
                            </button>
                            <button 
                                onClick={() => setInviteModalOpen(true)}
                                disabled={isFull || subscriptionInfo?.isTrial}
                                title={subscriptionInfo?.isTrial ? 'Recurso desbloqueado apenas após a assinatura efetiva do plano Pro.' : undefined}
                                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm shadow-indigo-200 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PaperAirplaneIcon className="h-4 w-4" />
                                Enviar Convite
                            </button>
                        </>
                    )}
                    {activeTab === 'cost_centers' && (
                        <button 
                            onClick={() => setCreateCCModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Novo Centro de Custo
                        </button>
                    )}
                </div>
            </div>

            {/* Metric Layer: High-Level Scorecards (Contrast Equalized) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard 
                    title="Assentos Utilizados" 
                    value={`${usedSeats} / ${seats}`} 
                    icon={<UsersIcon className="h-6 w-6" />} 
                    variant="primary"
                    color={isFull ? 'rose' : 'indigo'}
                    subtext={isFull ? 'Limite atingido — todos os assentos ocupados' : `${seats - usedSeats} licença(s) disponível(is) no plano Pro`}
                />
                <KpiCard 
                    title="Seu Nível Global" 
                    value={orgRole.toUpperCase()} 
                    icon={<ShieldIcon className="h-6 w-6" />} 
                    color="amber"
                    subtext="Permissões de Gerenciamento"
                />
                <KpiCard 
                    title="Arquitetura Operacional" 
                    value={`${costCenters.length} CCs`} 
                    icon={<DatabaseIcon className="h-6 w-6" />} 
                    color="green"
                    subtext="Unidades de Negócio registradas"
                />
            </div>

            {/* Workbench Toolbar */}
            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 inline-flex items-center gap-1 shadow-inner">
                <button 
                    onClick={() => setActiveTab('members')}
                    className={`px-8 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === 'members' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-md ring-1 ring-slate-200/50 dark:ring-transparent translate-y-[-1px]' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Membros & Acessos
                </button>
                <button 
                    onClick={() => setActiveTab('cost_centers')}
                    className={`px-8 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === 'cost_centers' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-md ring-1 ring-slate-200/50 dark:ring-transparent translate-y-[-1px]' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Estrutura Operacional (CC)
                </button>
            </div>

            {/* Workbench: Members Table (Portal Style) */}
            {activeTab === 'members' && (
                <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm overflow-hidden transform transition-all">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md">
                        <h3 className="text-label-caps !text-slate-400">Malha de Identidade e Acesso</h3>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/30 dark:bg-slate-900/40 sticky top-0 z-10 backdrop-blur-md">
                                <tr className="border-b border-slate-100 dark:border-slate-800/50">
                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Identificação do Colaborador</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Nível de Privilégio</th>
                                    <th className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Gestão de Perfil</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                                {members.map(m => (
                                    <tr key={m.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-900 dark:text-slate-100 font-bold">{m.full_name || 'Sem nome'}</span>
                                                <span className="text-[11px] font-medium text-slate-500 mt-0.5">{m.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                m.role === 'owner' ? 'bg-indigo-100 text-indigo-700' :
                                                m.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Administrator' : 'General Member'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {m.role !== 'owner' && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleOpenPermissions(m.user_id, m.full_name || m.email)} 
                                                            className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl hover:bg-indigo-100"
                                                        >
                                                            Acessos CC
                                                        </button>
                                                        <select 
                                                            className="text-[10px] font-bold uppercase tracking-widest border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl px-2 py-1 outline-none ring-1 ring-slate-200 focus:ring-indigo-500"
                                                            value={m.role}
                                                            onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                                                        >
                                                            <option value="member">Membro</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                        <button 
                                                            onClick={() => setPasswordModal({ open: true, userId: m.user_id, email: m.email })}
                                                            className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded-xl hover:bg-amber-100"
                                                        >
                                                            SENHA
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRemove(m.user_id)}
                                                            className="p-1 px-2 text-[10px] font-bold uppercase tracking-widest text-rose-600 bg-rose-50 dark:bg-rose-900/30 rounded-xl hover:bg-rose-100"
                                                        >
                                                            EXCLUIR
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {members.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-12 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nenhum membro registrado</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Workbench: Cost Centers Table (Portal Style) */}
            {activeTab === 'cost_centers' && (
                <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md">
                        <h3 className="text-label-caps !text-slate-400">Centros de Responsabilidade</h3>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left">
                             <thead className="bg-slate-50/30 dark:bg-slate-900/40 sticky top-0 z-10 backdrop-blur-md">
                                <tr className="border-b border-slate-100 dark:border-slate-800/50">
                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Nomenclatura do Centro Operacional</th>
                                    <th className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Operações de Estrutura</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                                {costCenters.map(cc => (
                                    <tr key={cc.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="px-6 py-4 text-slate-900 dark:text-slate-100 font-bold uppercase tracking-wider text-[11px]">{cc.name}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleDeleteCC(cc.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-rose-600 bg-rose-50 dark:bg-rose-900/30 rounded-xl hover:bg-rose-100 text-[10px] font-bold uppercase tracking-widest"
                                            >
                                                Remover CC
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {costCenters.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-12 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sem centros de custo ativos</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Member Modal: Refined Enterprise Style */}
            <Modal isOpen={createMemberModalOpen} onClose={() => setCreateMemberModalOpen(false)} title="Nova Credencial de Acesso" size="md">
                <div className="space-y-8 p-2">
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">
                        Configuração de perfil para novo colaborador orgânico.
                    </p>
                    
                    <div className="space-y-6">
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome Completo do Portador</label>
                            <input 
                                placeholder="Ex: João da Silva"
                                className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                                value={newMemberName}
                                onChange={e => setNewMemberName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-mail Corporativo</label>
                            <input 
                                type="email" 
                                placeholder="nome@organizacao.com"
                                className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                                value={newMemberEmail}
                                onChange={e => setNewMemberEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha Provisória</label>
                            <input 
                                type="password" 
                                placeholder="********"
                                className="w-full h-11 px-4 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                                value={newMemberPassword}
                                onChange={e => setNewMemberPassword(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nível de Privilégio</label>
                            <select 
                                className="w-full h-11 px-4 text-[11px] font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                                value={newMemberRole}
                                onChange={e => setNewMemberRole(e.target.value)}
                            >
                                <option value="member">MEMBRO GERAL (Padronizado)</option>
                                <option value="admin">ADMINISTRADOR (Controle Total)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button 
                            onClick={() => setCreateMemberModalOpen(false)} 
                            className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleCreateMember} 
                            disabled={busy || !newMemberName || !newMemberEmail || !newMemberPassword}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                        >
                            {busy ? 'Auditando...' : 'Formalizar Cadastro'}
                        </button>
                    </div>
                </div>
            </Modal>
            {/* Invite Modal */}
            <Modal isOpen={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Protocolo de Convite Externo" size="sm">
                <div className="space-y-6 p-2">
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">
                        Afilie um parceiro existente à sua malha organizacional.
                    </p>
                    <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endereço de E-mail</label>
                        <input 
                            type="email" 
                            placeholder="email@parceiro.com"
                            className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button onClick={() => setInviteModalOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
                        <button 
                            onClick={handleInvite} 
                            disabled={busy || !inviteEmail}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                        >
                            {busy ? 'Expedindo...' : 'Enviar Convite'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Create CC Modal */}
            <Modal isOpen={createCCModalOpen} onClose={() => setCreateCCModalOpen(false)} title="Registro de Centro de Custo" size="sm">
                <div className="space-y-6 p-2">
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">
                        Estruture uma nova unidade operacional para segregação financeira.
                    </p>
                    <div className="space-y-2.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nomenclatura do Centro</label>
                        <input 
                            type="text" 
                            placeholder="Ex: Marketing, Logística, RH..."
                            className="w-full h-11 px-4 text-sm font-black uppercase tracking-tighter rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                            value={newCCName}
                            onChange={e => setNewCCName(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button onClick={() => setCreateCCModalOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Abortar</button>
                        <button 
                            onClick={handleCreateCC} 
                            disabled={busy || !newCCName}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                        >
                            {busy ? 'Vinculando...' : 'Efetivar CC'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Permissions Modal */}
            {permissionsModal && (
                <Modal 
                    isOpen={permissionsModal.open} 
                    onClose={() => setPermissionsModal(null)} 
                    title={`Matriz de Acesso: ${permissionsModal.userName}`}
                    size="lg"
                >
                    <div className="space-y-6 p-2">
                        <p className="text-[11px] font-medium text-slate-500 leading-relaxed uppercase tracking-widest">
                            Defina os privilégios granulares por Unidade Operacional. <br/>
                            <span className="text-slate-400">Membros de nível geral possuem visão restrita aos centros autorizados.</span>
                        </p>
                        
                        {costCenters.length === 0 ? (
                            <div className="p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-xl flex flex-col items-center gap-3">
                                <DatabaseIcon className="h-6 w-6 text-amber-500" />
                                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest text-center">Nenhum centro de custo mapeado nesta organização</p>
                            </div>
                        ) : (
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800 max-h-[50vh] overflow-y-auto scrollbar-hide bg-slate-50/20">
                                {costCenters.map(cc => {
                                    const perm = userPermissions.find(p => p.cost_center_id === cc.id);
                                    const currentRole = perm?.role || 'none';
                                    
                                    return (
                                        <div key={cc.id} className="p-4 flex items-center justify-between hover:bg-white dark:hover:bg-slate-800/40 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${currentRole !== 'none' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                    <DatabaseIcon className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{cc.name}</p>
                                                    {cc.owner_name && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Custódia: {cc.owner_name}</p>}
                                                </div>
                                            </div>
                                            <select
                                                value={currentRole}
                                                onChange={(e) => handleUpdatePermission(cc.id, e.target.value)}
                                                className={`text-[10px] font-bold uppercase tracking-widest border rounded-xl px-3 py-2 outline-none transition-all ${currentRole !== 'none' ? 'bg-indigo-50 border-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-800 dark:text-indigo-400' : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-800'}`}
                                            >
                                                <option value="none">BLOQUEADO</option>
                                                <option value="viewer">VISUALIZADOR (Ver)</option>
                                                <option value="editor">MANIPULADOR (Ver + Criar)</option>
                                                <option value="manager">GESTOR (Ver + Criar + Deletar)</option>
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                             <button 
                                onClick={() => setPermissionsModal(null)} 
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 dark:shadow-none"
                            >
                                Salvar Mudanças
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Password Management Modal */}
            <Modal 
                isOpen={!!passwordModal?.open} 
                onClose={() => { setPasswordModal(null); setResetPasswordVal(''); }}
                title="Redefinição de Credencial"
            >
                <div className="space-y-6 p-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed uppercase tracking-[0.1em]">
                            ATENÇÃO: Você está regerando a chave de acesso para <strong>{passwordModal?.email}</strong>. 
                            O usuário será desconectado e precisará usar a nova senha.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova Senha Provisória</label>
                        <input 
                            type="password" 
                            value={resetPasswordVal} 
                            onChange={e => setResetPasswordVal(e.target.value)}
                            placeholder="Defina a senha para o membro..."
                            className="w-full h-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={() => { setPasswordModal(null); setResetPasswordVal(''); }}
                            className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleResetPassword}
                            disabled={busy || !resetPasswordVal}
                            className="flex-2 py-3 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                        >
                            {busy ? 'Regerando...' : 'Efetivar Nova Senha'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
