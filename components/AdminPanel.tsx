import React, { useEffect, useState, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './shared/Modal';

interface AdminUser { id: string; email: string; is_admin: boolean; created_at?: string }
interface AdminSubscription { id: string; user_id: string; email?: string; is_admin?: boolean; provider: string; status: string; period_start?: string; period_end?: string; billing_period?: string; requested_tier?: string; plan_name?: string }
interface AdminOrgSubscription { org_id: string; org_name?: string; provider: string; status: string; period_start?: string; period_end?: string; billing_period?: string; requested_tier?: string; plan_id?: string; plan_name?: string }
interface Plan { id: string; name: string; tier: string }
interface ProfileRow { user_id: string; email: string; plan_id?: string; plan_name?: string; org_id?: string; is_admin?: boolean; business_profile?: string }
interface Org { id: string; name: string; seats: number; plan_id?: string; plan_name?: string; members_count?: number }
interface OrgMember { id: string; org_id: string; user_id: string; role: string; email?: string }
interface CostCenter { id: string; name: string; code?: string }
interface Permission { id: string; cost_center_id: string; role: string }
interface AdminTicket { id: string; subject: string; status: string; category: string; created_at: string; email: string }
interface AdminTicketMessage { id: string; user_id: string; message: string; is_admin_reply: boolean; created_at: string }
interface AdminFeature { id: string; title: string; description: string; status: string; upvotes: number; email: string; created_at: string }

const AdminPanel: React.FC = () => {
  const getToken = () => window.localStorage.getItem('gestor_financeiro_app_token') || '';
  const { viewMode } = useFinancialData();
  const { showToast } = useToast();

  // Data State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [orgSubs, setOrgSubs] = useState<AdminOrgSubscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<Permission[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<'users' | 'orgs' | 'subs' | 'profiles' | 'support'>('users');
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [adminFeatures, setAdminFeatures] = useState<AdminFeature[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<AdminTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<AdminTicketMessage[]>([]);
  const [adminReply, setAdminReply] = useState('');
  const [replyStatus, setReplyStatus] = useState('pending');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | 'active' | 'paused' | 'canceled'>('all');
  const [subScopeFilter, setSubScopeFilter] = useState<'user' | 'org'>('user');

  // Modal States
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: string; id: string; name?: string } | null>(null);
  const [permissionsModal, setPermissionsModal] = useState<{ open: boolean; orgId: string; userId: string; userName: string } | null>(null);

  // Form States
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; userId: string; email: string } | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubOrgId, setNewSubOrgId] = useState('');
  const [newSubProvider, setNewSubProvider] = useState('internal');
  const [newSubStatus, setNewSubStatus] = useState('active');
  const [newSubStart, setNewSubStart] = useState('');
  const [newSubEnd, setNewSubEnd] = useState('');
  const [newSubBillingPeriod, setNewSubBillingPeriod] = useState('monthly');
  const [editingSubId, setEditingSubId] = useState<string>('');
  const [editingSubScope, setEditingSubScope] = useState<'user' | 'org'>('user');

  // Org Form State
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [orgSeats, setOrgSeats] = useState<number>(1);
  const [orgPlanId, setOrgPlanId] = useState<string>('');

  // Org Member Form State
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  const getHeaders = useMemo(() => {
    const t = getToken();
    const h: Record<string, string> = { 
        'content-type': 'application/json', 
        'authorization': `Bearer ${t}` 
    };
    if (viewMode) h['x-view-mode'] = viewMode;
    return h;
  }, [viewMode]);

  const load = async () => {
    setError(null);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'load_all' }) });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j?.error || 'load_failed'));
      setUsers((j?.users || []) as AdminUser[]);
      setSubs((j?.subscriptions || []) as AdminSubscription[]);
      setOrgSubs((j?.org_subscriptions || []) as AdminOrgSubscription[]);
      setPlans((j?.plans || []) as Plan[]);
      setProfiles((j?.profiles || []) as ProfileRow[]);
      setOrgs((j?.organizations || []) as Org[]);
      
      // Load support if active
      if (activeTab === 'support') {
        const tr = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_list_tickets' }) });
        const td = await tr.json();
        setTickets(td.tickets || []);
        
        const fr = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_list_features' }) });
        const fd = await fr.json();
        setAdminFeatures(fd.features || []);
      }
      
      // If editing an org, refresh its data if it still exists
      if (selectedOrgId && orgModalOpen) {
         const updatedOrg = (j?.organizations || []).find((o: Org) => o.id === selectedOrgId);
         if (updatedOrg) {
             setOrgName(updatedOrg.name);
             setOrgSeats(updatedOrg.seats);
             setOrgPlanId(updatedOrg.plan_id || '');
         }
      }
    } catch (e: any) {
      setError(String(e?.message || e || 'error'));
    }
  };

  useEffect(() => { load(); }, [activeTab]);

  const formatDate = (d?: string) => {
      if (!d) return '—';
      try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return String(d); }
  };

  const statusPill = (status: string) => {
      const s = String(status || '').toLowerCase();
      if (s === 'active') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      if (s === 'paused') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      if (s === 'canceled') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  };

  const billingLabel = (billingPeriod: string) => {
      const b = String(billingPeriod || '').toLowerCase();
      if (b === 'monthly') return 'Mensal';
      if (b === 'yearly') return 'Anual';
      if (b === 'trial') return 'Trial';
      if (b === 'internal') return 'Interno';
      return b ? b : '—';
  };

  const searchNorm = useMemo(() => search.trim().toLowerCase(), [search]);
  const planById = useMemo(() => {
      const m = new Map<string, Plan>();
      plans.forEach(p => m.set(p.id, p));
      return m;
  }, [plans]);
  const plansByTier = useMemo(() => {
      const byTier = new Map<string, Plan>();
      for (const p of plans) {
          const tier = String(p.tier || '').toLowerCase();
          if (!tier) continue;
          if (tier !== 'starter' && tier !== 'plus' && tier !== 'pro') continue;
          if (!byTier.has(tier)) byTier.set(tier, p);
      }
      return Array.from(byTier.values()).sort((a, b) => {
          const order: any = { starter: 1, plus: 2, pro: 3 };
          return (order[String(a.tier).toLowerCase()] || 99) - (order[String(b.tier).toLowerCase()] || 99);
      });
  }, [plans]);
  const profileByUserId = useMemo(() => {
      const m = new Map<string, ProfileRow>();
      profiles.forEach(p => m.set(p.user_id, p));
      return m;
  }, [profiles]);
  const orgById = useMemo(() => {
      const m = new Map<string, Org>();
      orgs.forEach(o => m.set(o.id, o));
      return m;
  }, [orgs]);
  const latestSubByUserId = useMemo(() => {
      const m = new Map<string, AdminSubscription>();
      const score = (s: AdminSubscription) => {
          const a = s.period_start || s.period_end || '';
          const b = s.period_end || s.period_start || '';
          return Math.max(Date.parse(a || '0') || 0, Date.parse(b || '0') || 0);
      };
      subs.forEach(s => {
          const cur = m.get(s.user_id);
          if (!cur || score(s) >= score(cur)) m.set(s.user_id, s);
      });
      return m;
  }, [subs]);

  const kpis = useMemo(() => {
      const totalUsers = users.length;
      const admins = users.filter(u => u.is_admin).length;
      const totalOrgs = orgs.length;
      const statusCounts = [...subs, ...orgSubs].reduce((acc: any, s: any) => {
        const st = String(s.status || '').toLowerCase();
        acc[st] = (acc[st] || 0) + 1;
        return acc;
      }, {});
      return {
          totalUsers,
          admins,
          totalOrgs,
          subsTotal: subs.length + orgSubs.length,
          subsActive: statusCounts.active || 0,
          subsPaused: statusCounts.paused || 0,
          subsCanceled: statusCounts.canceled || 0
      };
  }, [users, orgs, subs, orgSubs]);

  const filteredUsers = useMemo(() => {
      if (!searchNorm) return users;
      return users.filter(u => {
          const prof = profileByUserId.get(u.id);
          const orgName = prof?.org_id ? (orgById.get(prof.org_id)?.name || '') : '';
          const planName = prof?.plan_id ? (planById.get(prof.plan_id)?.name || prof.plan_name || '') : (prof?.plan_name || '');
          const s = latestSubByUserId.get(u.id);
          const subStatus = s?.status || '';
          return [
              u.email,
              orgName,
              planName,
              subStatus
          ].some(v => String(v || '').toLowerCase().includes(searchNorm));
      });
  }, [users, searchNorm, profileByUserId, orgById, planById, latestSubByUserId]);

  const filteredOrgs = useMemo(() => {
      if (!searchNorm) return orgs;
      return orgs.filter(o => String(o.name || '').toLowerCase().includes(searchNorm));
  }, [orgs, searchNorm]);

  const filteredUserSubs = useMemo(() => {
    const base = subStatusFilter === 'all' ? subs : subs.filter(s => String(s.status || '').toLowerCase() === subStatusFilter);
    if (!searchNorm) return base;
    return base.filter(s => {
      const email = s.email || '';
      const plan = s.plan_name || '';
      const provider = s.provider || '';
      return [email, plan, provider].some(v => String(v || '').toLowerCase().includes(searchNorm));
    });
  }, [subs, subStatusFilter, searchNorm]);

  const filteredOrgSubs = useMemo(() => {
    const base = subStatusFilter === 'all' ? orgSubs : orgSubs.filter(s => String(s.status || '').toLowerCase() === subStatusFilter);
    if (!searchNorm) return base;
    return base.filter(s => {
      const orgName = s.org_name || '';
      const plan = s.plan_name || '';
      const provider = s.provider || '';
      return [orgName, plan, provider, s.org_id].some(v => String(v || '').toLowerCase().includes(searchNorm));
    });
  }, [orgSubs, subStatusFilter, searchNorm]);

  // --- User Actions ---
  const promote = async (email: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'promote', email }) });
      if (!r.ok) throw new Error('promote_failed');
      await load();
      showToast('Usuário promovido a admin.', 'success');
    } catch (e: any) {
      showToast('Falha ao promover usuário.', 'error');
    } finally { setBusy(false); }
  };

  const demote = async (email: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'demote', email }) });
      if (!r.ok) throw new Error('demote_failed');
      await load();
      showToast('Admin removido do usuário.', 'success');
    } catch (e: any) {
      showToast('Falha ao remover admin.', 'error');
    } finally { setBusy(false); }
  };

  const upsertUser = async () => {
    if (!newUserEmail) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'users_upsert', email: newUserEmail, isAdmin: newUserIsAdmin, password: newUserPassword }) });
      if (!r.ok) throw new Error('user_upsert_failed');
      await load();
      showToast('Usuário criado/atualizado com sucesso.', 'success');
      setUserModalOpen(false);
      setNewUserEmail(''); setNewUserPassword(''); setNewUserIsAdmin(false);
    } catch (e: any) {
      showToast('Falha ao criar/atualizar usuário.', 'error');
    } finally { setBusy(false); }
  };

  const deleteUser = (email: string) => setConfirmModal({ open: true, type: 'user', id: email, name: email });
  
  const confirmDeleteUser = async (email: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'users_delete', email }) });
      if (!r.ok) throw new Error('user_delete_failed');
      await load();
      showToast('Usuário excluído com sucesso.', 'success');
    } catch (e: any) {
      showToast('Falha ao excluir usuário.', 'error');
    } finally { setBusy(false); }
  };

  // --- Sub Actions ---
  const updateSub = async (id: string, status: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'subscriptions_update', id, status }) });
      if (!r.ok) throw new Error('update_sub_failed');
      await load();
      showToast('Assinatura atualizada.', 'success');
    } catch (e: any) {
      showToast('Falha ao atualizar assinatura.', 'error');
    } finally { setBusy(false); }
  };

  const updateOrgSub = async (orgId: string, status: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_subscriptions_update', orgId, status }) });
      if (!r.ok) throw new Error('update_org_sub_failed');
      await load();
      showToast('Assinatura da organização atualizada.', 'success');
    } catch (e: any) {
      showToast('Falha ao atualizar assinatura da organização.', 'error');
    } finally { setBusy(false); }
  };

  const upsertSub = async () => {
    setBusy(true);
    try {
      let r: Response;
      if (editingSubScope === 'org') {
        const orgId = newSubOrgId;
        const payload: any = { orgId, provider: newSubProvider, status: newSubStatus, period_start: newSubStart, period_end: newSubEnd, billing_period: newSubBillingPeriod };
        r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_subscriptions_upsert', ...payload }) });
      } else {
        const payload: any = { email: newSubEmail, provider: newSubProvider, status: newSubStatus, period_start: newSubStart, period_end: newSubEnd, billing_period: newSubBillingPeriod };
        if (editingSubId) payload.id = editingSubId;
        r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'subscriptions_upsert', ...payload }) });
      }
      if (!r.ok) throw new Error('subs_upsert_failed');
      await load();
      showToast('Assinatura adicionada/atualizada.', 'success');
      setSubModalOpen(false);
      setEditingSubId('');
      setEditingSubScope('user');
      setNewSubEmail(''); setNewSubOrgId(''); setNewSubStart(''); setNewSubEnd('');
    } catch (e: any) {
      showToast('Falha ao adicionar/atualizar assinatura.', 'error');
    } finally { setBusy(false); }
  };

  const openSubModal = (scope: 'user' | 'org', sub?: AdminSubscription | AdminOrgSubscription) => {
    setEditingSubScope(scope);
    if (scope === 'org') {
      const s = (sub || null) as AdminOrgSubscription | null;
      setEditingSubId(s?.org_id || '');
      setNewSubOrgId(s?.org_id || '');
      setNewSubEmail('');
      setNewSubProvider(s?.provider || 'internal');
      setNewSubStatus(s?.status || 'active');
      setNewSubBillingPeriod(s?.billing_period || 'monthly');
      setNewSubStart(s?.period_start ? String(s.period_start).slice(0, 10) : '');
      setNewSubEnd(s?.period_end ? String(s.period_end).slice(0, 10) : '');
    } else {
      const s = (sub || null) as AdminSubscription | null;
      setEditingSubId(s?.id || '');
      setNewSubEmail(s?.email || '');
      setNewSubOrgId('');
      setNewSubProvider(s?.provider || 'internal');
      setNewSubStatus(s?.status || 'active');
      setNewSubBillingPeriod(s?.billing_period || 'monthly');
      setNewSubStart(s?.period_start ? String(s.period_start).slice(0, 10) : '');
      setNewSubEnd(s?.period_end ? String(s.period_end).slice(0, 10) : '');
    }
    setSubModalOpen(true);
  };

  const deleteSub = (id: string) => setConfirmModal({ open: true, type: 'sub', id, name: 'Assinatura' });
  const deleteOrgSub = (orgId: string) => setConfirmModal({ open: true, type: 'org_sub', id: orgId, name: 'Assinatura (Org)' });

  const confirmDeleteSub = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'subscriptions_delete', id }) });
      if (!r.ok) throw new Error('subs_delete_failed');
      await load();
      showToast('Assinatura excluída.', 'success');
    } catch (e: any) {
      showToast('Falha ao excluir assinatura.', 'error');
    } finally { setBusy(false); }
  };

  const confirmDeleteOrgSub = async (orgId: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_subscriptions_delete', orgId }) });
      if (!r.ok) throw new Error('org_subs_delete_failed');
      await load();
      showToast('Assinatura da organização excluída.', 'success');
    } catch (e: any) {
      showToast('Falha ao excluir assinatura da organização.', 'error');
    } finally { setBusy(false); }
  };

  // --- Profile Actions ---
  const updateProfile = async (userId: string, data: { planId?: string, businessProfile?: string }) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { 
        method: 'POST', 
        headers: getHeaders, 
        body: JSON.stringify({ 
          action: 'profiles_update', 
          userId, 
          ...data 
        }) 
      });
      if (!r.ok) throw new Error('update_profile_failed');
      await load();
      showToast('Perfil atualizado.', 'success');
    } catch (e: any) {
      showToast('Falha ao atualizar perfil.', 'error');
    } finally { setBusy(false); }
  };

  const deleteProfile = (userId: string) => setConfirmModal({ open: true, type: 'profile', id: userId, name: `Perfil de ${userId}` });
  
  const confirmDeleteProfile = async (userId: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'profiles_delete', userId }) });
      if (!r.ok) throw new Error('profile_delete_failed');
      await load();
      showToast('Perfil excluído.', 'success');
    } catch (e: any) {
      showToast('Falha ao excluir perfil.', 'error');
    } finally { setBusy(false); }
  };

  // --- Org Actions ---
  const refreshMembers = async (orgId: string) => {
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_members', orgId }) });
      const j = await r.json();
      if (!r.ok) throw new Error('members_failed');
      setOrgMembers((j?.members || []) as OrgMember[]);
    } catch (e) {
      console.error(e);
    }
  };

  const openOrgModal = (org?: Org) => {
      if (org) {
          setSelectedOrgId(org.id);
          setOrgName(org.name);
          setOrgSeats(org.seats);
          setOrgPlanId(org.plan_id || '');
          setOrgMembers([]); // Clear previous members
          refreshMembers(org.id);
      } else {
          setSelectedOrgId('');
          setOrgName('');
          setOrgSeats(1);
          setOrgPlanId('');
          setOrgMembers([]);
      }
      setOrgModalOpen(true);
  };

  const saveOrg = async () => {
    setBusy(true);
    try {
      const payload: any = { action: 'orgs_upsert', name: orgName, seats: orgSeats, planId: orgPlanId || '' };
      if (selectedOrgId) payload.id = selectedOrgId;
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('org_upsert_failed');
      await load();
      showToast('Organização salva com sucesso.', 'success');
      if (!selectedOrgId) setOrgModalOpen(false); // Close if creating new
    } catch (e: any) {
      showToast('Falha ao salvar organização.', 'error');
    } finally { setBusy(false); }
  };

  const deleteOrg = (orgId: string, name?: string) => setConfirmModal({ open: true, type: 'org', id: orgId, name: name || orgId });
  
  const confirmDeleteOrg = async (orgId: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'orgs_delete', id: orgId }) });
      if (!r.ok) throw new Error('org_delete_failed');
      await load();
      showToast('Organização excluída.', 'success');
    } catch (e: any) {
      showToast('Falha ao excluir organização.', 'error');
    } finally { setBusy(false); }
  };

  const orgMemberAction = async (action: 'add'|'remove'|'change_role', orgId: string, email: string, role?: string) => {
    if (action === 'remove') {
      setConfirmModal({ open: true, type: 'member', id: `${orgId}:${email}`, name: email });
      return;
    }
    await performOrgMemberAction(action, orgId, email, role);
  };

  const performOrgMemberAction = async (action: 'add'|'remove'|'change_role', orgId: string, email: string, role?: string) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_members_update', op: action, orgId, email, role }) });
      if (!r.ok) throw new Error('member_update_failed');
      await refreshMembers(orgId);
      showToast(action === 'add' ? 'Membro adicionado.' : action === 'remove' ? 'Membro removido.' : 'Role alterada.', 'success');
      if (action === 'add') setNewMemberEmail('');
    } catch (e: any) {
      showToast('Falha ao atualizar membro.', 'error');
    } finally { setBusy(false); }
  };

  const resetPassword = async () => {
    if (!passwordModal || !resetPasswordVal) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin', { 
        method: 'POST', 
        headers: getHeaders, 
        body: JSON.stringify({ action: 'reset_password', userId: passwordModal.userId, password: resetPasswordVal }) 
      });
      if (!r.ok) throw new Error('reset_failed');
      showToast('Senha alterada com sucesso!', 'success');
      setPasswordModal(null);
      setResetPasswordVal('');
    } catch (e) {
      showToast('Falha ao resetar senha.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const openPermissionsModal = async (orgId: string, userId: string, userName: string) => {
    setPermissionsModal({ open: true, orgId, userId, userName });
    setBusy(true);
    try {
        const rCC = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_cost_centers', orgId }) });
        const jCC = await rCC.json();
        setCostCenters((jCC?.cost_centers || []) as CostCenter[]);

        const rP = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_member_permissions', orgId, userId }) });
        const jP = await rP.json();
        setMemberPermissions((jP?.permissions || []) as Permission[]);
    } catch (e) {
        showToast('Falha ao carregar permissões', 'error');
    } finally { setBusy(false); }
  };

  const updatePermission = async (costCenterId: string, role: string) => {
      if (!permissionsModal) return;
      const { orgId, userId } = permissionsModal;
      const prev = [...memberPermissions];
      if (role === 'none') {
          setMemberPermissions(prev.filter(p => p.cost_center_id !== costCenterId));
      } else {
          const idx = prev.findIndex(p => p.cost_center_id === costCenterId);
          if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], role };
              setMemberPermissions(copy);
          } else {
              setMemberPermissions([...prev, { id: 'temp', cost_center_id: costCenterId, role }]);
          }
      }

      try {
        await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'org_member_permissions_update', orgId, userId, costCenterId, role }) });
      } catch (e) {
          showToast('Falha ao salvar permissão', 'error');
          setMemberPermissions(prev);
      }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Admin</h2>
          <div className="text-xs text-slate-600 dark:text-slate-400">Usuários, organizações e assinaturas</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {busy ? 'Carregando...' : 'Atualizar'}
          </button>
          <button onClick={() => setUserModalOpen(true)} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            + Usuário
          </button>
          <button onClick={() => openOrgModal()} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 transition-colors">
            + Organização
          </button>
          <button onClick={() => openSubModal(subScopeFilter)} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
            + Assinatura
          </button>
        </div>
      </div>
      
      {error && <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Usuários</div>
          <div className="text-xl font-semibold text-slate-900 dark:text-white">{kpis.totalUsers}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{kpis.admins} admins</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Organizações</div>
          <div className="text-xl font-semibold text-slate-900 dark:text-white">{kpis.totalOrgs}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Assinaturas</div>
          <div className="text-xl font-semibold text-slate-900 dark:text-white">{kpis.subsTotal}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Ativas</div>
          <div className="text-xl font-semibold text-green-600">{kpis.subsActive}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Pausadas</div>
          <div className="text-xl font-semibold text-yellow-600">{kpis.subsPaused}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Canceladas</div>
          <div className="text-xl font-semibold text-red-600">{kpis.subsCanceled}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email, organização, plano, status..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
          />
        </div>
        {activeTab === 'subs' && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-400">Escopo</div>
            <select
              value={subScopeFilter}
              onChange={(e) => setSubScopeFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="user" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Usuário</option>
              <option value="org" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Organização</option>
            </select>
            <div className="text-xs text-slate-600 dark:text-slate-400">Status</div>
            <select
              value={subStatusFilter}
              onChange={(e) => setSubStatusFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="all" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Todos</option>
              <option value="active" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Ativo</option>
              <option value="paused" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Pausado</option>
              <option value="canceled" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Cancelado</option>
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto no-scrollbar">
        {(['users', 'orgs', 'subs', 'profiles', 'support'] as const).map((tab) => (
            <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap
                ${activeTab === tab 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200/20' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
            {tab === 'users' ? `Usuários (${filteredUsers.length})` : tab === 'orgs' ? `Organizações (${filteredOrgs.length})` : tab === 'subs' ? `Assinaturas (${subScopeFilter === 'org' ? filteredOrgSubs.length : filteredUserSubs.length})` : tab === 'profiles' ? `Perfis (${profiles.length})` : 'Suporte'}
            </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        
        {/* USERS TAB */}
        {activeTab === 'users' && (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Usuários</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Dica: ajuste plano e assinatura direto na linha.
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Email</th>
                                <th className="px-4 py-3">Tipo de Perfil</th>
                                <th className="px-4 py-3">Acesso</th>
                                <th className="px-4 py-3">Plano</th>
                                <th className="px-4 py-3">Organização</th>
                                <th className="px-4 py-3">Assinatura</th>
                                <th className="px-4 py-3">Criado</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800/50">
                            {filteredUsers.map(u => {
                                const prof = profileByUserId.get(u.id);
                                const orgName = prof?.org_id ? (orgById.get(prof.org_id)?.name || prof.org_id) : '—';
                                const planId = prof?.plan_id || '';
                                const planName = planId ? (planById.get(planId)?.name || prof?.plan_name || '') : (prof?.plan_name || '');
                                const sub = latestSubByUserId.get(u.id);
                                const subStatus = sub?.status || '—';
                                const subEnd = sub?.period_end ? formatDate(sub.period_end) : (sub ? 'Vitalício' : '—');
                                return (
                                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.email}</td>
                                    <td className="px-4 py-3">
                                        <select 
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-tighter transition-all text-slate-900 dark:text-white" 
                                            value={prof?.business_profile || 'pessoal'} 
                                            onChange={(e) => updateProfile(u.id, { businessProfile: e.target.value })} 
                                            disabled={busy}
                                        >
                                            <option value="pessoal" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">PF</option>
                                            <option value="mei" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">MEI</option>
                                            <option value="empresa" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Empresa</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.is_admin ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                            {u.is_admin ? 'Admin' : 'Usuário'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <select
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                                            value={planId}
                                            onChange={(e) => updateProfile(u.id, { planId: e.target.value })}
                                            disabled={busy}
                                        >
                                            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sem plano</option>
                                            {plans.map(pl => (
                                                <option key={pl.id} value={pl.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{pl.name}</option>
                                            ))}
                                        </select>
                                        {planName && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{planName}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{orgName}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusPill(subStatus)}`}>{String(subStatus).toUpperCase()}</span>
                                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{subEnd}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(u.created_at)}</td>
                                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                        {u.is_admin ? (
                                            <button onClick={() => demote(u.email)} disabled={busy} className="text-orange-600 hover:text-orange-800 text-xs font-medium">Remover Admin</button>
                                        ) : (
                                            <button onClick={() => promote(u.email)} disabled={busy} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Tornar Admin</button>
                                        )}
                                        {sub && (
                                            <button onClick={() => openSubModal('user', sub)} disabled={busy} className="text-slate-700 dark:text-slate-200 hover:text-indigo-700 text-xs font-medium">Editar Assinatura</button>
                                        )}
                                        {prof?.org_id && (
                                            <button onClick={() => openOrgModal(orgById.get(prof.org_id))} disabled={busy} className="text-teal-600 hover:text-teal-800 text-xs font-medium">Organização</button>
                                        )}
                                        <button onClick={() => setPasswordModal({ open: true, userId: u.id, email: u.email })} disabled={busy} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Mudar Senha</button>
                                        <button onClick={() => deleteUser(u.email)} disabled={busy} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir</button>
                                    </td>
                                </tr>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">Nenhum usuário encontrado.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* ORGS TAB */}
        {activeTab === 'orgs' && (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Organizações</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Assentos, plano e membros</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Nome</th>
                                <th className="px-4 py-3">Plano</th>
                                <th className="px-4 py-3">Assentos</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800/50">
                            {filteredOrgs.map(o => {
                                const members = Number(o.members_count || 0);
                                const seats = Number(o.seats || 0);
                                const pct = seats > 0 ? Math.min(100, Math.round((members / seats) * 100)) : 0;
                                const over = seats > 0 && members > seats;
                                const planName = o.plan_id ? (planById.get(o.plan_id)?.name || o.plan_name || '—') : (o.plan_name || 'Sem plano');
                                return (
                                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                        <button 
                                            onClick={() => openOrgModal(o)} 
                                            className="hover:underline hover:text-indigo-600 text-left transition-colors"
                                        >
                                            {o.name}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{planName}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-slate-700 dark:text-slate-200">{members} / {seats || '—'}</div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${over ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                                {over ? 'Excedido' : `${pct}%`}
                                            </span>
                                        </div>
                                        <div className="mt-2 w-full bg-slate-200 rounded-full h-2 dark:bg-slate-800 overflow-hidden">
                                            <div className={`h-2 rounded-full ${over ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                        <button onClick={() => openOrgModal(o)} disabled={busy} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Editar</button>
                                        <button onClick={() => deleteOrg(o.id, o.name)} disabled={busy} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir</button>
                                    </td>
                                </tr>
                                );
                            })}
                            {filteredOrgs.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">Nenhuma organização encontrada.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* SUBS TAB */}
        {activeTab === 'subs' && (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Assinaturas</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Editar período e provedor pelo botão “Editar”</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">{subScopeFilter === 'org' ? 'Organização' : 'Usuário'}</th>
                                <th className="px-4 py-3">Provider</th>
                                <th className="px-4 py-3">Plano</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Início</th>
                                <th className="px-4 py-3">Fim</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800/50">
                            {(subScopeFilter === 'org' ? filteredOrgSubs : filteredUserSubs).map((s: any) => (
                                <tr key={subScopeFilter === 'org' ? s.org_id : s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-4 py-3 text-slate-900 dark:text-white">{subScopeFilter === 'org' ? (s.org_name || s.org_id) : (s.email || s.user_id)}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="truncate">{s.provider || '—'}</span>
                                            {s.billing_period ? (
                                                <span className="shrink-0 text-[9px] font-bold bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-widest border border-slate-200 dark:border-slate-700">
                                                    {billingLabel(s.billing_period)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{s.plan_name || '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const endTs = s.period_end ? new Date(s.period_end).getTime() : null;
                                                const st = String(s.status || '').toLowerCase();
                                                const expired = !!endTs && endTs < Date.now();
                                                const showExpired = expired && st === 'active';
                                                const cls = showExpired ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : statusPill(s.status);
                                                const label = showExpired ? 'EXPIRADA' : String(s.status || '').toUpperCase();
                                                return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
                                            })()}
                                            <select
                                                className="bg-transparent border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                                                value={s.status}
                                                onChange={(e) => (subScopeFilter === 'org' ? updateOrgSub(s.org_id, e.target.value) : updateSub(s.id, e.target.value))}
                                                disabled={busy || (!!s.is_admin && subScopeFilter !== 'org')}
                                            >
                                                <option value="active" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">active</option>
                                                <option value="pending" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">pending</option>
                                                <option value="paused" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">paused</option>
                                                <option value="overdue" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">overdue</option>
                                                <option value="canceled" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">canceled</option>
                                            </select>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDate(s.period_start)}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{s.period_end ? formatDate(s.period_end) : (s.period_start ? '—' : 'Vitalício')}</td>
                                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                        <button onClick={() => openSubModal(subScopeFilter, s)} disabled={busy} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Editar</button>
                                        {subScopeFilter === 'org' ? (
                                          <button onClick={() => deleteOrgSub(s.org_id)} disabled={busy} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir</button>
                                        ) : (
                                          <button onClick={() => deleteSub(s.id)} disabled={busy} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(subScopeFilter === 'org' ? filteredOrgSubs.length : filteredUserSubs.length) === 0 && (
                                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">Nenhuma assinatura encontrada.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* PROFILES TAB */}
        {activeTab === 'profiles' && (
             <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Perfis (avançado)</h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Use quando precisar ajustar plano diretamente no perfil</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Email</th>
                                <th className="px-4 py-3">Plano Atual</th>
                                <th className="px-4 py-3">Tipo de Perfil</th>
                                <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800/50">
                            {profiles
                                .filter(p => !searchNorm || String(p.email || '').toLowerCase().includes(searchNorm))
                                .map(p => (
                                <tr key={p.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-4 py-3 text-slate-900 dark:text-white">{p.email}</td>
                                    <td className="px-4 py-3">
                                        <select 
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-900 dark:text-white" 
                                            value={p.plan_id || ''} 
                                            onChange={(e) => updateProfile(p.user_id, { planId: e.target.value })} 
                                            disabled={busy}
                                        >
                                            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sem plano</option>
                                            {plansByTier.map(pl => (
                                                <option key={pl.id} value={pl.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                                                    {String(pl.tier || '').toLowerCase() === 'starter' ? 'Starter'
                                                        : String(pl.tier || '').toLowerCase() === 'plus' ? 'Plus'
                                                        : 'Pro'}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <select 
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs font-medium text-slate-900 dark:text-white" 
                                            value={p.business_profile || 'pessoal'} 
                                            onChange={(e) => updateProfile(p.user_id, { businessProfile: e.target.value })} 
                                            disabled={busy}
                                        >
                                            <option value="pessoal" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Pessoal (PF)</option>
                                            <option value="mei" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Microempreendedor (MEI)</option>
                                            <option value="empresa" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Empresa (ME/EPP)</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => deleteProfile(p.user_id)} disabled={busy} className="text-red-600 hover:text-red-800 text-xs font-medium">Excluir Perfil</button>
                                    </td>
                                </tr>
                            ))}
                            {profiles.filter(p => !searchNorm || String(p.email || '').toLowerCase().includes(searchNorm)).length === 0 && (
                                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">Nenhum perfil encontrado.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
             </div>
        )}
        
        {activeTab === 'support' && (
          <div className="space-y-8 animate-fade-in">
             {/* Support KPIs */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   </div>
                   <div>
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Abertos / Fila</div>
                      <div className="text-2xl font-black text-slate-800 dark:text-white">{tickets.filter(t => t.status === 'open').length}</div>
                   </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                   </div>
                   <div>
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Aguardando Usuário</div>
                      <div className="text-2xl font-black text-slate-800 dark:text-white">{tickets.filter(t => t.status === 'pending').length}</div>
                   </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   </div>
                   <div>
                      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Resolvidos</div>
                      <div className="text-2xl font-black text-slate-800 dark:text-white">{tickets.filter(t => t.status === 'closed').length}</div>
                   </div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
               {/* Ticket List */}
               <div className="lg:col-span-4 space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-white">Tickets de Suporte</h3>
                    <span className="text-[10px] font-black uppercase text-slate-400">{tickets.length} chamados</span>
                 </div>
                 <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                   {tickets.length === 0 ? (
                     <div className="p-8 text-center text-slate-400 italic text-sm">Nenhum chamado.</div>
                   ) : tickets.map(t => (
                     <button 
                        key={t.id}
                        onClick={async () => {
                          const res = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_get_ticket', ticketId: t.id }) });
                          const data = await res.json();
                          setSelectedTicket(data.ticket);
                          setTicketMessages(data.messages || []);
                          setReplyStatus(data.ticket.status);
                        }}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${selectedTicket?.id === t.id ? 'bg-indigo-50 border-indigo-200 shadow-sm dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800 hover:border-indigo-200'}`}
                     >
                       <div className="flex justify-between items-start mb-1">
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${t.status === 'open' ? 'bg-blue-100 text-blue-700' : t.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{t.status}</span>
                          <span className="text-[10px] text-slate-400">{new Date(t.created_at).toLocaleDateString()}</span>
                       </div>
                       <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{t.subject}</h4>
                       <p className="text-[10px] text-slate-500 truncate">{t.email}</p>
                     </button>
                   ))}
                 </div>
               </div>

               {/* Reply Box */}
               <div className="lg:col-span-8 bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-[70vh]">
                 {selectedTicket ? (
                   <>
                     <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                       <div>
                         <h3 className="font-bold text-slate-800 dark:text-white">{selectedTicket.subject}</h3>
                         <p className="text-xs text-slate-500">{selectedTicket.email}</p>
                       </div>
                       <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black uppercase text-slate-400">Status:</span>
                           <select 
                              value={replyStatus} 
                              onChange={e => setReplyStatus(e.target.value)}
                              className="text-xs border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg p-1 px-2"
                            >
                              <option value="open" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Aberto</option>
                              <option value="pending" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Aguardando Usuário</option>
                              <option value="closed" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Resolvido / Fechado</option>
                           </select>
                       </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 dark:bg-slate-900/10 custom-scrollbar">
                       {ticketMessages.map(m => (
                         <div key={m.id} className={`flex ${m.is_admin_reply ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-sm ${m.is_admin_reply 
                             ? 'bg-indigo-600 text-white rounded-tr-none' 
                             : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-none'}`}>
                             {m.is_admin_reply && <span className="text-[8px] font-black uppercase tracking-widest block mb-1 opacity-70">Sua Resposta (Admin)</span>}
                             <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                             <span className="text-[9px] opacity-60 mt-2 block italic">{new Date(m.created_at).toLocaleString()}</span>
                           </div>
                         </div>
                       ))}
                     </div>
                     <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <textarea 
                          value={adminReply}
                          onChange={e => setAdminReply(e.target.value)}
                          placeholder="Digite aqui sua resposta para o cliente..."
                          className="w-full text-sm border border-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-white rounded-xl p-3 h-24 resize-none focus:ring-2 focus:ring-indigo-500 transition-all custom-scrollbar"
                        />
                        <div className="flex justify-end mt-3">
                            <button 
                              onClick={async () => {
                                if (!adminReply.trim()) return;
                                setBusy(true);
                                try {
                                  await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_reply_ticket', ticketId: selectedTicket.id, message: adminReply, status: replyStatus }) });
                                  setAdminReply('');
                                  const res = await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_get_ticket', ticketId: selectedTicket.id }) });
                                  const data = await res.json();
                                  setTicketMessages(data.messages || []);
                                  showToast('Resposta enviada com sucesso.', 'success');
                                } catch (e) {
                                  showToast('Erro ao enviar resposta.', 'error');
                                } finally { setBusy(false); }
                              }}
                              disabled={busy || !adminReply.trim()}
                              className="bg-indigo-600 text-white font-bold px-8 py-2.5 rounded-xl text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
                            >
                              {busy ? 'Enviando...' : 'Enviar Resposta'}
                            </button>
                        </div>
                     </div>
                   </>
                 ) : (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 space-y-4">
                     <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                     </div>
                     <p className="text-sm font-medium">Selecione um chamado ao lado para responder o cliente.</p>
                   </div>
                 )}
               </div>
             </div>

             <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
               <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-lg">Roadmap de Sugestões</h3>
                    <p className="text-xs text-slate-500">Funcionalidades sugeridas e votadas pelos usuários.</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-1 flex gap-1">
                      <span className="px-3 py-1 text-[10px] font-black uppercase text-slate-400">Gestão Global</span>
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                   <thead>
                     <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                       <th className="py-4 px-4">Usuário</th>
                       <th className="py-4 px-4">Sugestão</th>
                       <th className="py-4 px-4 text-center">Votos</th>
                       <th className="py-4 px-4">Status Atual</th>
                       <th className="py-4 px-4 text-right">Alterar Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                     {adminFeatures.length === 0 ? (
                       <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhuma sugestão enviada ainda.</td></tr>
                     ) : adminFeatures.map(f => (
                       <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                         <td className="py-4 px-4">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{f.email}</span>
                            <div className="text-[10px] text-slate-400 mt-1">{new Date(f.created_at).toLocaleDateString()}</div>
                         </td>
                         <td className="py-4 px-4">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{f.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5 max-w-sm truncate">{f.description}</div>
                         </td>
                         <td className="py-4 px-4 text-center">
                            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black px-3 py-1 rounded-lg text-xs">
                              {f.upvotes}
                            </span>
                         </td>
                         <td className="py-4 px-4">
                           <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${f.status === 'shipped' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800' : f.status === 'planned' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-800 dark:border-slate-700'}`}>
                             {f.status === 'shipped' ? 'Entregue' : f.status === 'planned' ? 'Planejado' : 'Sugestão'}
                           </span>
                         </td>
                         <td className="py-4 px-4 text-right">
                           <select 
                            value={f.status}
                            onChange={async (e) => {
                              try {
                                await fetch('/api/admin', { method: 'POST', headers: getHeaders, body: JSON.stringify({ action: 'admin_update_feature', requestId: f.id, status: e.target.value }) });
                                load();
                                showToast('Status da sugestão atualizado.', 'success');
                              } catch (e) { showToast('Erro ao atualizar.', 'error'); }
                            }}
                            className="text-xs font-bold p-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                           >
                             <option value="suggested" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">💡 Sugestão</option>
                             <option value="planned" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">📅 Planejado</option>
                             <option value="shipped" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">🚀 Entregue</option>
                           </select>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}

      </div>

      {/* MODALS */}
      
      {/* Create User Modal */}
      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title="Criar Usuário">
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Senha (Opcional)</label>
                <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
            </div>
            <div className="flex items-center gap-2">
                <input type="checkbox" id="isAdmin" checked={newUserIsAdmin} onChange={e => setNewUserIsAdmin(e.target.checked)} />
                <label htmlFor="isAdmin" className="text-sm text-slate-700 dark:text-slate-300">É Administrador?</label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setUserModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                <button onClick={upsertUser} disabled={busy || !newUserEmail} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">Salvar</button>
            </div>
        </div>
      </Modal>

      {/* Create Sub Modal */}
      <Modal
        isOpen={subModalOpen}
        onClose={() => { setSubModalOpen(false); setEditingSubId(''); setEditingSubScope('user'); }}
        title={editingSubId ? (editingSubScope === 'org' ? 'Editar Assinatura (Organização)' : 'Editar Assinatura') : (editingSubScope === 'org' ? 'Criar Assinatura (Organização)' : 'Criar Assinatura')}
      >
        <div className="grid grid-cols-1 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Escopo</label>
                <select
                  value={editingSubScope}
                  onChange={(e) => {
                    const next = e.target.value as any;
                    setEditingSubScope(next);
                    setEditingSubId('');
                    setNewSubEmail('');
                    setNewSubOrgId('');
                    setNewSubProvider('internal');
                    setNewSubStatus('active');
                    setNewSubStart('');
                    setNewSubEnd('');
                  }}
                  disabled={!!editingSubId}
                  className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white disabled:opacity-60"
                >
                  <option value="user" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Usuário</option>
                  <option value="org" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Organização</option>
                </select>
            </div>
            {editingSubScope === 'org' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Organização (ID)</label>
                <input
                  list="org-list"
                  type="text"
                  value={newSubOrgId}
                  onChange={e => setNewSubOrgId(e.target.value)}
                  className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white"
                />
                <datalist id="org-list">
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </datalist>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email do Usuário</label>
                <input type="email" value={newSubEmail} onChange={e => setNewSubEmail(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
              </div>
            )}
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Provider</label>
                <input type="text" value={newSubProvider} onChange={e => setNewSubProvider(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                <select value={newSubStatus} onChange={e => setNewSubStatus(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white">
                    <option value="active" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Active</option>
                    <option value="paused" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Paused</option>
                    <option value="canceled" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Canceled</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Período de Cobrança (Trial/Definitiva)</label>
                <select value={newSubBillingPeriod} onChange={e => setNewSubBillingPeriod(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white">
                    <option value="monthly" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Mensal (Ativa)</option>
                    <option value="yearly" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Anual (Ativa)</option>
                    <option value="trial" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Trial (14 dias)</option>
                    <option value="internal" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Interno (Cortesia)</option>
                </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Início</label>
                    <input type="date" value={newSubStart} onChange={e => setNewSubStart(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fim</label>
                    <input type="date" value={newSubEnd} onChange={e => setNewSubEnd(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setSubModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                <button onClick={upsertSub} disabled={busy || (editingSubScope === 'org' ? !newSubOrgId : !newSubEmail)} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">Salvar</button>
            </div>
        </div>
      </Modal>

      {/* Org Detail/Edit Modal */}
      <Modal isOpen={orgModalOpen} onClose={() => setOrgModalOpen(false)} title={selectedOrgId ? `Editar Organização: ${orgName}` : 'Nova Organização'}>
         <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            {/* Org Settings */}
            <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl space-y-4">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">Dados da Organização</h4>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                    <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assentos</label>
                        <input type="number" min={1} value={orgSeats} onChange={e => setOrgSeats(Number(e.target.value))} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Plano</label>
                        <select value={orgPlanId} onChange={e => setOrgPlanId(e.target.value)} className="w-full mt-1 p-2 border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white">
                            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sem plano</option>
                            {plans.map(p => <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{p.name}</option>)}
                        </select>
                    </div>
                </div>

                {selectedOrgId && (
                    <div className="bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-600">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Utilização de Assentos</span>
                            <span className={`text-sm font-bold ${orgMembers.length > orgSeats ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                {orgMembers.length} / {orgSeats}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 dark:bg-slate-800 overflow-hidden">
                            <div 
                                className={`h-2 rounded-full transition-all duration-500 ${orgMembers.length > orgSeats ? 'bg-red-500' : 'bg-indigo-500'}`} 
                                style={{ width: `${Math.min(100, (orgMembers.length / Math.max(1, orgSeats)) * 100)}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between mt-1">
                             <span className="text-xs text-slate-500">
                                {((orgMembers.length / Math.max(1, orgSeats)) * 100).toFixed(0)}% ocupado
                             </span>
                             <span className="text-xs text-slate-500">
                                {orgSeats - orgMembers.length >= 0 
                                    ? `${orgSeats - orgMembers.length} disponíveis` 
                                    : `${orgMembers.length - orgSeats} excedidos`}
                             </span>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={() => setOrgModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300 text-sm transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-600">
                        Fechar
                    </button>
                    <button onClick={saveOrg} disabled={busy || !orgName} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm">
                        {selectedOrgId ? 'Atualizar Dados' : 'Criar Organização'}
                    </button>
                </div>
            </div>

            {/* Members Section (Only if editing existing org) */}
            {selectedOrgId && (
                <div className="space-y-4">
                     <div className="flex justify-between items-center border-b pb-2">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">Membros</h4>
                     </div>
                     
                     {/* Add Member Inline */}
                     <div className="flex gap-2 items-end bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 block mb-1">Email do Novo Membro</label>
                            <input type="email" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="usuario@email.com" className="w-full p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white" />
                        </div>
                        <div className="w-32">
                             <label className="text-xs text-slate-500 block mb-1">Função</label>
                             <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} className="w-full p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-800 dark:text-white">
                                 <option value="member" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Membro</option>
                                 <option value="admin" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Admin</option>
                                 <option value="owner" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Owner</option>
                             </select>
                        </div>
                        <button onClick={() => orgMemberAction('add', selectedOrgId, newMemberEmail, newMemberRole)} disabled={busy || !newMemberEmail} className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">
                            Adicionar
                        </button>
                     </div>

                     <div className="overflow-x-auto border rounded-xl">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                <tr>
                                    <th className="px-3 py-2">Email</th>
                                    <th className="px-3 py-2">Role</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 dark:divide-slate-800/50">
                                {orgMembers.map(m => (
                                    <tr key={m.id}>
                                        <td className="px-3 py-2 text-slate-900 dark:text-white">{m.email || m.user_id}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{m.role}</td>
                                        <td className="px-3 py-2 text-right space-x-1">
                                            <button onClick={() => orgMemberAction('change_role', selectedOrgId, m.email || '', m.role === 'member' ? 'admin' : 'member')} disabled={busy} className="text-indigo-600 hover:text-indigo-800 text-xs">Trocar Role</button>
                                            <button onClick={() => orgMemberAction('remove', selectedOrgId, m.email || '')} disabled={busy} className="text-red-600 hover:text-red-800 text-xs">Remover</button>
                                            {m.role === 'member' && (
                                                <button onClick={() => openPermissionsModal(selectedOrgId, m.user_id, m.email || '')} disabled={busy} className="text-teal-600 hover:text-teal-800 text-xs ml-1">Permissões</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {orgMembers.length === 0 && (
                                    <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">Nenhum membro encontrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                     </div>
                </div>
            )}
         </div>
      </Modal>

      {/* Permissions Modal */}
      {permissionsModal && (
        <Modal
            isOpen={permissionsModal.open}
            onClose={() => setPermissionsModal(null)}
            title={`Permissões de ${permissionsModal.userName}`}
            footer={
                <div className="flex justify-end">
                    <button onClick={() => setPermissionsModal(null)} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700">Fechar</button>
                </div>
            }
        >
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Defina o nível de acesso para cada Centro de Custo. Membros sem permissão explícita não verão o Centro de Custo.
                </p>
                {costCenters.length === 0 ? (
                    <p className="text-slate-500 italic">Nenhum centro de custo encontrado nesta organização.</p>
                ) : (
                    <div className="space-y-2">
                        {costCenters.map(cc => {
                            const perm = memberPermissions.find(p => p.cost_center_id === cc.id);
                            const currentRole = perm?.role || 'none';
                            return (
                                <div key={cc.id} className="flex items-center justify-between p-2 border rounded border-slate-200 dark:border-slate-800">
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white">{cc.name}</p>
                                        {cc.code && <p className="text-xs text-slate-500">{cc.code}</p>}
                                    </div>
                                    <select
                                        value={currentRole}
                                        onChange={(e) => updatePermission(cc.id, e.target.value)}
                                        className="bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm text-slate-900 dark:text-white"
                                        disabled={busy}
                                    >
                                        <option value="none" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sem Acesso</option>
                                        <option value="viewer" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Visualizar</option>
                                        <option value="editor" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Editar</option>
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <Modal
          isOpen={confirmModal.open}
          onClose={() => setConfirmModal(null)}
          title="Confirmar Ação"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmModal.type === 'user') confirmDeleteUser(confirmModal.id);
                  if (confirmModal.type === 'org') confirmDeleteOrg(confirmModal.id);
                  if (confirmModal.type === 'member') {
                    const [orgId, email] = confirmModal.id.split(':');
                    performOrgMemberAction('remove', orgId, email);
                  }
                  if (confirmModal.type === 'sub') confirmDeleteSub(confirmModal.id);
                  if (confirmModal.type === 'org_sub') confirmDeleteOrgSub(confirmModal.id);
                  if (confirmModal.type === 'profile') confirmDeleteProfile(confirmModal.id);
                  setConfirmModal(null);
                }}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Confirmar
              </button>
            </div>
          }
        >
          <p className="text-slate-800 dark:text-slate-200">
            Tem certeza que deseja excluir {confirmModal.name || 'este item'}? Esta ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default AdminPanel;
