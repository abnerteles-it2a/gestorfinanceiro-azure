import React from 'react';
import { Modal } from './shared/Modal';
import { UploadIcon, FolderIcon, FolderPlusIcon, UsersIcon, TrashIcon, ShieldIcon, FileIcon, TrendingUpIcon } from './icons';
import { TableToolbar } from './ui/TableToolbar';
import { FormField } from './ui/Forms/FormField';
import { Input } from './ui/Forms/Input';
import { useFinancialData } from '../context/FinancialDataContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/formatters';
import { KpiCard } from './KpiCard';
import { Select } from './ui/Forms/Select';

const DocsVault: React.FC = () => {
  const { organizationInfo, planInfo, viewMode, usage, subscriptionInfo, costCenters } = useFinancialData();
  const tier = String(planInfo?.tier || 'starter').toLowerCase();
  
  // Use usage directly from context (populated by bootstrap)
  const storageLimit = usage?.storageLimit || (tier === 'pro' ? 10 * 1024 * 1024 * 1024 : tier === 'plus' ? 1024 * 1024 * 1024 : 100 * 1024 * 1024);
  const storageUsed = usage?.storageUsed || 0;
  const isTrial = !!subscriptionInfo?.isTrial;
  const isBlocked = !!subscriptionInfo?.isTotalBlocked;
  const isOverQuota = !!subscriptionInfo?.isOverQuota;

  const [isOpen, setIsOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [docType, setDocType] = React.useState('');
  const [costCenterId, setCostCenterId] = React.useState('');
  const [issueDate, setIssueDate] = React.useState('');
  const [supplier, setSupplier] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [docs, setDocs] = React.useState<any[]>([]);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);
  const [delConfirmOpen, setDelConfirmOpen] = React.useState(false);
  const [delPath, setDelPath] = React.useState<string | null>(null);

  // Folder State
  const [currentFolder, setCurrentFolder] = React.useState<{id: string, name: string} | null>(null);
  const [breadcrumbs, setBreadcrumbs] = React.useState<{id: string, name: string}[]>([]);
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');

  // Permissions State
  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [selectedDoc, setSelectedDoc] = React.useState<any>(null);
  const [permType, setPermType] = React.useState('public'); 

  const canUpload = !isBlocked && !isOverQuota; 
  const orgId = String(organizationInfo?.id || '');

  const getAuthHeaders = React.useMemo((): Record<string,string> => {
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    try { const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; if (t) headers['authorization'] = `Bearer ${t}`; } catch {}
    if (viewMode) headers['x-view-mode'] = viewMode;
    return headers;
  }, [viewMode]);

  const loadDocs = React.useCallback(async (toPage?: number) => {
    try {
      const p = typeof toPage === 'number' ? toPage : page;
      const q = new URLSearchParams();
      if (orgId && viewMode === 'organization') q.set('orgId', orgId);
      q.set('page', String(p));
      q.set('per_page', String(perPage));
      q.set('parentId', currentFolder?.id || 'root');
      
      const r = await fetch(`/api/fiscal-docs/upload?${q.toString()}`, { headers: getAuthHeaders });
      const j = await r.json();
      setDocs(Array.isArray(j.rows) ? j.rows : []);
      if (typeof j.page === 'number') setPage(j.page);
    } catch { setDocs([]); }
  }, [orgId, page, perPage, currentFolder, viewMode, getAuthHeaders]);

  React.useEffect(() => { loadDocs(1); }, [loadDocs]);

  React.useEffect(() => {
    setCurrentFolder(null);
    setBreadcrumbs([]);
  }, [viewMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    
    // Safety check: Don't upload if limit reached or blocked
    if (isBlocked) {
        setStatusMsg('Assinatura expirada. Renove para continuar enviando arquivos.');
        return;
    }

    if (usage && usage.storageUsed + file.size > usage.storageLimit) {
        setStatusMsg('Cofre Cheio. Você atingiu o limite de armazenamento do seu plano.');
        return;
    }

    setUploading(true);
    setStatusMsg(null);
    try {
      const r1 = await fetch('/api/fiscal-docs/upload', {
        method: 'POST',
        headers: getAuthHeaders,
        body: JSON.stringify({
          action: 'get_presigned_url',
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          orgId: viewMode === 'organization' ? orgId : undefined,
        })
      });
      if (!r1.ok) throw new Error('Falha ao obter URL de upload');
      const { url, key } = await r1.json();
      if (!url || !key) throw new Error('URL inválida');

      const r2 = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' }
      });
      if (!r2.ok) throw new Error('Falha no upload para o S3');

      const r3 = await fetch('/api/fiscal-docs/upload', {
        method: 'POST',
        headers: getAuthHeaders,
        body: JSON.stringify({
          action: 'confirm_upload',
          key,
          orgId: viewMode === 'organization' ? orgId : undefined,
          docType: docType || undefined,
          issueDate: issueDate || undefined,
          supplier: supplier || undefined,
          amount: amount ? Number(amount) : undefined,
          notes: notes || undefined,
          contentType: file.type || undefined,
          size: file.size,
          parentId: currentFolder?.id || undefined,
          costCenterId: costCenterId || undefined,
          permissions: viewMode === 'organization' ? { type: 'public_org' } : {},
        })
      });
      if (!r3.ok) throw new Error('Falha ao salvar metadados');

      setIsOpen(false);
      setFile(null);
      setDocType('');
      setCostCenterId('');
      setIssueDate('');
      setSupplier('');
      setAmount('');
      setNotes('');
      setStatusMsg('Upload concluído');
      await loadDocs(1);
    } catch (e: any) {
      setStatusMsg(String(e?.message || 'Falha no upload'));
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setUploading(true);
    try {
      const r = await fetch('/api/fiscal-docs/upload', {
        method: 'POST',
        headers: getAuthHeaders,
        body: JSON.stringify({
          action: 'create_folder',
          name: newFolderName,
          orgId: viewMode === 'organization' ? orgId : undefined,
          parentId: currentFolder?.id || undefined,
          permissions: viewMode === 'organization' ? { type: 'public_org' } : {},
        })
      });
      if (r.ok) {
        setNewFolderName('');
        setCreateFolderOpen(false);
        await loadDocs(1);
      } else {
        throw new Error('Falha ao criar pasta');
      }
    } catch (e: any) {
      setStatusMsg(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (pathname: string) => {
    setDelPath(pathname);
    setDelConfirmOpen(true);
  };

  const confirmDelete = async () => {
    const pathname = delPath || '';
    if (!pathname) { setDelConfirmOpen(false); return; }
    try {
      const r = await fetch('/api/fiscal-docs/upload', { 
        method: 'DELETE', 
        headers: getAuthHeaders, 
        body: JSON.stringify({ pathname, orgId: viewMode === 'organization' ? orgId : undefined }) 
      });
      const j = await r.json();
      if (j.deleted) {
        await loadDocs(1);
        setStatusMsg('Item apagado');
      } else {
        setStatusMsg('Falha ao apagar item');
      }
    } catch (e: any) {
      setStatusMsg(String(e?.message || 'Falha ao apagar item'));
    } finally {
      setDelConfirmOpen(false);
      setDelPath(null);
    }
  };

  const handleEnterFolder = (folder: any) => {
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name || 'Sem nome' }]);
    setCurrentFolder({ id: folder.id, name: folder.name || 'Sem nome' });
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentFolder(null);
    } else {
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      setBreadcrumbs(newBreadcrumbs);
      setCurrentFolder(newBreadcrumbs[newBreadcrumbs.length - 1]);
    }
  };

  const openPermissions = (doc: any) => {
    setSelectedDoc(doc);
    const currentType = doc.permissions?.type || 'public_org';
    setPermType(currentType === 'restricted' ? 'private' : 'public');
    setPermModalOpen(true);
  };

  const savePermissions = async () => {
    if (!selectedDoc) return;
    try {
      const permissions = { type: permType === 'private' ? 'restricted' : 'public_org' };
      const r = await fetch('/api/fiscal-docs/upload', {
        method: 'POST',
        headers: getAuthHeaders,
        body: JSON.stringify({ action: 'update_permissions', id: selectedDoc.id, permissions })
      });
      if (r.ok) {
        setPermModalOpen(false);
        await loadDocs();
        setStatusMsg('Permissões atualizadas');
      } else {
        throw new Error('Falha ao atualizar permissões');
      }
    } catch (e: any) {
      setStatusMsg(e.message);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-10 px-1">
      {/* Header */}
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-label-caps !text-slate-400">Cofre de Documentos</h1>
            <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full uppercase tracking-widest border border-indigo-100 dark:border-indigo-800">
              {tier.toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed">
             {viewMode === 'organization' ? 'Arquivo da organização com controle de privilégios' : 'Repositório privado para registros pessoais'}
          </p>
        </div>
        
        {canUpload && (
          <div className="flex items-center gap-3">
            <button onClick={() => setCreateFolderOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:bg-slate-50 transition-all">
              <FolderPlusIcon className="h-4 w-4" />
              Nova Pasta
            </button>
            <button onClick={() => setIsOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm">
              <UploadIcon className="h-4 w-4" />
              Upload
            </button>
          </div>
        )}
      </div>

      {/* KPI Layer (Contrast Equalized) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <KpiCard 
              title="Total de Itens" 
              value={String(docs.length)} 
              icon={<FolderIcon className="h-6 w-6" />} 
              variant="primary"
              color="indigo"
              subtext="Documentos & Pastas" 
          />
          <KpiCard 
              title="Plano Atual" 
              value={tier.toUpperCase()} 
              icon={<TrendingUpIcon className="h-6 w-6" />} 
              color="green"
              subtext="Nível de Serviço" 
          />
          <KpiCard 
              title="Criptografia" 
              value="AES-256" 
              icon={<ShieldIcon className="h-6 w-6" />} 
              color="slate"
              subtext="Dados em Repouso" 
          />
          <KpiCard 
              title="Acesso" 
              value={viewMode === 'organization' ? 'Enterprise' : 'Privado'} 
              icon={<UsersIcon className="h-6 w-6" />} 
              color="amber"
              subtext="Isolamento de Dados" 
          />
      </div>

      {/* Resource Quota Monitor */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div className="flex flex-col gap-1">
                  <h3 className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <ShieldIcon className="h-4 w-4 text-indigo-500" />
                    Ocupação do Cofre (S3 Storage)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Controle de pacotes de dados conforme plano {tier.toUpperCase()}</p>
              </div>
              <div className="text-right">
                  <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                    {(storageUsed / (1024 * 1024)).toFixed(1)} MB
                  </span>
                  <span className="text-xs font-bold text-slate-400 mx-2">/</span>
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {(storageLimit / (1024 * 1024 * 1024)).toFixed(0)} GB
                  </span>
              </div>
          </div>
          <div className="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
              {(() => {
                  const pct = Math.min(100, (storageUsed / storageLimit) * 100);
                  const color = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-indigo-600';
                  return <div className={`h-full ${color} transition-all duration-1000 ease-out shadow-sm`} style={{ width: `${pct}%` }} />;
              })()}
          </div>
      </div>

      {/* Table Layer (Portal Aesthetic) */}
      <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm overflow-hidden">
          <TableToolbar 
            title={
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest overflow-x-auto scrollbar-hide py-1">
                    <button onClick={() => handleBreadcrumbClick(-1)} className={`px-2.5 py-1.5 rounded-lg transition-all ${breadcrumbs.length === 0 ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>COFRE</button>
                    {breadcrumbs.map((b, i) => (
                        <React.Fragment key={b.id}>
                            <span className="text-slate-300">/</span>
                            <button onClick={() => handleBreadcrumbClick(i)} className={`px-2.5 py-1.5 rounded-lg transition-all ${i === breadcrumbs.length - 1 ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{b.name}</button>
                        </React.Fragment>
                    ))}
                </div>
            }
            actions={
                <div className="flex items-center gap-1.5 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm">
                    <button onClick={()=>loadDocs(Math.max(1, page-1))} className="text-[10px] font-black text-slate-500 hover:text-indigo-600 px-3 tracking-widest">ANTERIOR</button>
                    <span className="text-[10px] font-black text-slate-900 dark:text-white px-3 bg-white dark:bg-slate-700 rounded-lg py-1 shadow-sm border border-slate-200 dark:border-slate-600">PÁG. {page}</span>
                    <button onClick={()=>loadDocs(page+1)} className="text-[10px] font-black text-slate-500 hover:text-indigo-600 px-3 tracking-widest">PRÓXIMA</button>
                </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-slate-100 dark:divide-slate-800/60">
              <thead className="bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                  <th className="px-6 py-4 text-left w-12"></th>
                  <th className="px-6 py-4 text-left">Nome do Item</th>
                  <th className="px-6 py-4 text-left">Atributo</th>
                  <th className="px-6 py-4 text-left">Alocação</th>
                  <th className="px-6 py-4 text-left">Emissão</th>
                  <th className="px-6 py-4 text-right">Valor</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {docs.map((d) => {
                  const isFolder = !!d.is_folder;
                  const name = d.name || String(d.pathname || '').split('/').pop() || '—';
                  const sizeKb = d.size ? `${Math.round(Number(d.size)/1024)} KB` : '—';
                  const issue = d.issue_date ? new Date(d.issue_date).toLocaleDateString('pt-BR') : '—';
                  const amountStr = d.amount == null ? '—' : formatCurrency(Number(d.amount));
                  return (
                    <tr key={d.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-5">
                          {isFolder ? <FolderIcon className="h-5 w-5 text-amber-500" /> : <FileIcon className="h-5 w-5 text-slate-400" />}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            {isFolder ? <button onClick={() => handleEnterFolder(d)} className="text-slate-900 dark:text-slate-100 font-bold hover:text-indigo-600 text-left">{name}</button> : <span className="text-slate-900 dark:text-slate-100 font-bold">{name}</span>}
                            <span className="text-[10px] text-slate-500 mt-0.5">{isFolder ? 'Diretório' : sizeKb}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">{isFolder ? 'Pasta' : (d.doc_type || 'Geral')}</td>
                      <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">
                        {isFolder ? '—' : (costCenters.find(cc => cc.id === d.cost_center_id)?.name || 'Geral')}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium tabular-nums">{isFolder ? '—' : issue}</td>
                      <td className="px-6 py-4 text-right font-bold tabular-nums">{isFolder ? '—' : amountStr}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isFolder && <a href={String(d.url || '#')} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-indigo-600"><UploadIcon className="h-4 w-4 rotate-180" /></a>}
                            {viewMode === 'organization' && <button onClick={() => openPermissions(d)} className="p-2 text-slate-400"><UsersIcon className="h-4 w-4" /></button>}
                            <button onClick={() => handleDelete(d.pathname || d.id)} className="p-2 text-slate-400 hover:text-rose-600"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Upload de Documento" size="lg">
         <div className="space-y-6">
            <input type="file" onChange={handleFileChange} className="w-full text-sm text-slate-500 p-4 border border-dashed rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
                <Input placeholder="Tipo" value={docType} onChange={e=>setDocType(e.target.value)} />
                {viewMode === 'organization' && (
                  <Select
                    value={costCenterId}
                    onChange={e => setCostCenterId(e.target.value)}
                  >
                    <option value="">Cento de Custo: Geral</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </Select>
                )}
                <Input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} />
                <Input placeholder="Emitente" value={supplier} onChange={e=>setSupplier(e.target.value)} />
                <Input type="number" placeholder="Valor" value={amount} onChange={e=>setAmount(e.target.value)} />
            </div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} className="w-full p-4 text-sm border rounded-xl" placeholder="Notas..." rows={3} />
            <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={()=>setIsOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase text-slate-400">Cancelar</button>
                <button onClick={handleUpload} disabled={!file || uploading} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[11px]">{uploading ? 'Aguarde...' : 'Upload'}</button>
            </div>
         </div>
      </Modal>

      {/* Modal Nova Pasta */}
      <Modal isOpen={createFolderOpen} onClose={() => setCreateFolderOpen(false)} title="Nova Pasta" size="md">
        <div className="space-y-6">
          <Input 
            placeholder="Nome da Pasta" 
            value={newFolderName} 
            onChange={e => setNewFolderName(e.target.value)} 
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setCreateFolderOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase text-slate-400">Cancelar</button>
            <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || uploading} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[11px]">
              {uploading ? 'Aguarde...' : 'Criar Pasta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Deletar */}
      <Modal isOpen={delConfirmOpen} onClose={() => setDelConfirmOpen(false)} title="Confirmar Exclusão" size="md">
        <div className="space-y-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tem certeza que deseja apagar permanentemente este item? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setDelConfirmOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase text-slate-400">Cancelar</button>
            <button onClick={confirmDelete} className="px-8 py-3 bg-rose-600 text-white rounded-xl font-bold uppercase text-[11px]">Apagar</button>
          </div>
        </div>
      </Modal>

      {/* Modal Permissões */}
      <Modal isOpen={permModalOpen} onClose={() => setPermModalOpen(false)} title="Permissões do Documento" size="md">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
             <label className="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <input type="radio" name="perm" checked={permType === 'public'} onChange={() => setPermType('public')} />
                <div>
                   <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Público (Organização)</p>
                   <p className="text-[10px] text-slate-500">Todos os membros com acesso ao cofre podem visualizar.</p>
                </div>
             </label>
             <label className="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <input type="radio" name="perm" checked={permType === 'private'} onChange={() => setPermType('private')} />
                <div>
                   <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Restrito (Privado)</p>
                   <p className="text-[10px] text-slate-500">Apenas o proprietário e administradores podem visualizar.</p>
                </div>
             </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setPermModalOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase text-slate-400">Cancelar</button>
            <button onClick={savePermissions} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[11px]">Salvar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DocsVault;
