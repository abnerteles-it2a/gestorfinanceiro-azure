import React, { useEffect, useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatCurrencyForInput, parseCurrencyInput } from '../utils/formatters';
import { calcValorParcelas, calcDataParcelas } from '../utils/financial';
import { StatusTag } from './ui/StatusTag';
import { EmptyState } from './ui/EmptyState';
import { DocumentIcon, CheckCircleIcon, EditIcon, TrashIcon } from './icons';
import { DataTable, Column } from './ui/DataTable';
import { TableToolbar } from './ui/TableToolbar';
import { Input } from './ui/Forms/Input';
import { Select } from './ui/Forms/Select';
import { FormField } from './ui/Forms/FormField';
import { InlineAlert } from './ui/InlineAlert';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

const paymentMethodSuggestions = ['Boleto','PIX', 'Saldo Conta', 'Saldo Conta Investimentos', 'Saldo Corretora', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Transferência Bancária', 'Débito Automático'];

export const PayablesList: React.FC<{ readOnly?: boolean; hideAddForm?: boolean; reloadKey?: number }> = ({ readOnly=false, hideAddForm=false, reloadKey }) => {
  const { accounts, categories, costCenters, appendTransactionsLocal, addCategory, viewMode, transactions } = useFinancialData();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorToast, setErrorToast] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0,10));
  const [installments, setInstallments] = useState(1);
  const [issueDate, setIssueDate] = useState('');
  const [category, setCategory] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [markingId, setMarkingId] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0,10));
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [description, setDescription] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [editId, setEditId] = useState<string>('');
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCostCenterId, setEditCostCenterId] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('open');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>('');

  const currentMonth = useMemo(()=>monthKey(new Date()),[]);
  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const isFiltered = monthFilter !== currentMonth || statusFilter !== 'all';

  const clearFilters = () => {
      setMonthFilter(currentMonth);
      setStatusFilter('all');
  };

  const getAuthHeaders = React.useCallback((): Record<string,string> => {
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    try { const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; if (t) headers['authorization'] = `Bearer ${t}`; } catch {}
    if (viewMode) headers['x-view-mode'] = viewMode;
    return headers;
  }, [viewMode]);

  const load = async () => {
    setLoading(true);
    try {
      const pStatus = statusFilter === 'all' ? '' : statusFilter;
      const r = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'payables_list', data: { month: monthFilter, status: pStatus } }) });
      const j = await r.json();
      setItems((j.rows || []));
    } catch {
        setErrorToast('Não foi possível sincronizar os dados da conta a pagar. Verifique a internet e tente novamente.');
    }
    setLoading(false);
  };

  // Token readiness: re-fetch when the token arrives in localStorage (bootstrap may finish after mount)
  const [hasToken, setHasToken] = React.useState(() => !!window.localStorage.getItem('gestor_financeiro_app_token'));
  React.useEffect(() => {
    if (hasToken) return;
    const id = setInterval(() => {
      if (window.localStorage.getItem('gestor_financeiro_app_token')) {
        setHasToken(true);
        clearInterval(id);
      }
    }, 300);
    return () => clearInterval(id);
  }, [hasToken]);

  useEffect(() => { if (hasToken) load(); }, [monthFilter, statusFilter, viewMode, hasToken]);
  useEffect(() => { if (reloadKey !== undefined && hasToken) load(); }, [reloadKey, viewMode]);


  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (category) {
        const exists = categories.some(c => c.name.toLowerCase() === category.toLowerCase());
        if (!exists && addCategory) {
          try { await addCategory({ name: category, type: 'Saída', icon: '' }); } catch {}
        }
      }

      const totalAmount = Number(amount || 0);
      const numInstallments = installments || 1;
      const amounts = calcValorParcelas(totalAmount, numInstallments);
      const dates = calcDataParcelas(numInstallments, dueDate);
      const newItems: any[] = [];

      for (let i = 0; i < numInstallments; i++) {
        const parcelTitle = numInstallments > 1 ? `${title} (${i+1}/${numInstallments})` : title;
        const parcelAmount = amounts[i];
        const parcelDueDate = dates[i].slice(0, 10);

        const r = await fetch('/api/query', { 
          method: 'POST', 
          headers: getAuthHeaders(), 
          body: JSON.stringify({ 
            type: 'payables_insert', 
            data: { 
              title: parcelTitle, 
              amount: parcelAmount, 
              issueDate: (issueDate || null), 
              dueDate: parcelDueDate, 
              category: (category || null), 
              costCenterId: (costCenterId || null), 
              supplier: (supplier || null), 
              notes: (notes || null) 
            } 
          }) 
        });
        const j = await r.json();
        if (j.rows && j.rows.length > 0) newItems.push(j.rows[0]);
      }

      setItems((prev)=>[...newItems, ...prev]);
      setTitle(''); setAmount(''); setIssueDate(''); setCategory(''); setCostCenterId(''); setSupplier(''); setNotes(''); setInstallments(1);
    } catch {}
  };

  const onDelete = async (id: string) => {
    try { await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'payables_delete', data: { id } }) }); setItems(prev=>prev.filter(i=>i.id!==id)); } catch {}
    setDeleteConfirmId('');
  };

  const onMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingId) return;
    try {
      const it = items.find(i => i.id === markingId);
      const catName = (it?.category || 'Contas a Pagar');
      const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
      if (!exists && addCategory) {
        try { await addCategory({ name: catName, type: 'Saída', icon: '' }); } catch {}
      }
      const r = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'payables_mark_paid', data: { id: markingId, paidAmount: (paidAmount ? Number(paidAmount) : null), paidDate, accountId, paymentMethod: (paymentMethod || 'Boleto'), description, discountAmount: (discountAmount ? Number(discountAmount) : null), penaltyAmount: (penaltyAmount ? Number(penaltyAmount) : null) } }) });
      const j = await r.json();
      const updated = (j.rows || [])[0];
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      if (j.tx && appendTransactionsLocal) {
        const tx = j.tx;
        appendTransactionsLocal([{ id: tx.id, date: tx.date, accountId: tx.account_id, toAccountId: tx.to_account_id || undefined, transactionType: tx.transaction_type, category: tx.category, description: tx.description || '', amount: Number(tx.amount || 0), paymentMethod: tx.payment_method || '', costCenterId: tx.cost_center_id || undefined }]);
      }
      setMarkingId(''); setPaidAmount(''); setPaidDate(new Date().toISOString().slice(0,10)); setAccountId(''); setPaymentMethod(''); setDescription(''); setDiscountAmount(''); setPenaltyAmount('');
    } catch {}
  };

  const startEdit = (it: any) => {
    setEditId(it.id);
    setEditTitle(it.title || '');
    setEditAmount(formatCurrencyForInput(it.amount || 0));
    setEditIssueDate(it.issue_date ? String(it.issue_date).slice(0,10) : '');
    setEditDueDate(it.due_date ? String(it.due_date).slice(0,10) : '');
    setEditCategory(it.category || '');
    setEditCostCenterId(it.cost_center_id || '');
    setEditSupplier(it.supplier || '');
    setEditNotes(it.notes || '');
    setEditStatus(it.status || 'open');
  };
  useEffect(() => {
    if (markingId && !paymentMethod) setPaymentMethod('Boleto');
  }, [markingId]);
  const cancelEdit = () => {
    setEditId('');
    setEditTitle('');
    setEditAmount('');
    setEditIssueDate('');
    setEditDueDate('');
    setEditCategory('');
    setEditCostCenterId('');
    setEditSupplier('');
    setEditNotes('');
    setEditStatus('open');
  };
  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'payables_update', data: { id: editId, title: editTitle, amount: parseCurrencyInput(editAmount), issueDate: (editIssueDate || null), dueDate: (editDueDate || null), category: (editCategory || null), costCenterId: (editCostCenterId || null), supplier: (editSupplier || null), notes: (editNotes || null), status: editStatus } }) });
      const j = await r.json();
      const updated = (j.rows || [])[0];
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      cancelEdit();
    } catch {}
  };

  const columns: Column<any>[] = [
    { key: 'title', header: 'Título', sortable: true },
    { 
      key: 'due_date', 
      header: 'Vencimento', 
      sortable: true,
      render: (it) => String(it.due_date).slice(0,10)
    },
    { 
      key: 'amount', 
      header: 'Valor', 
      sortable: true,
      render: (it) => (
        <StatusTag type="error">
          - {formatCurrency(Number(it.amount))}
        </StatusTag>
      )
    },
    { key: 'category', header: 'Categoria', sortable: true, render: (it) => it.category || '—' },
    { 
      key: 'cost_center_id', 
      header: 'Centro', 
      sortable: true,
      render: (it) => (costCenters.find(c=>c.id===it.cost_center_id)?.name) || '—'
    }
  ];

  if (!readOnly) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: (it) => (
        <div className="flex items-center justify-end gap-1.5">
          {deleteConfirmId === it.id ? (
            <>
              <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide mr-1">Excluir?</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}
                className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
              >✓</button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(''); }}
                className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors"
              >✗</button>
            </>
          ) : (
            <>
              <button onClick={(e)=>{ e.stopPropagation(); setMarkingId(it.id); }} title="Liquidar" className="p-1 rounded-full text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                <CheckCircleIcon className="w-5 h-5" />
              </button>
              <button onClick={(e)=>{ e.stopPropagation(); startEdit(it); }} title="Editar" className="p-1 rounded-full text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors">
                <EditIcon className="w-5 h-5" />
              </button>
              <button onClick={(e)=>{ e.stopPropagation(); setDeleteConfirmId(it.id); }} title="Excluir" className="p-1 rounded-full text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                <TrashIcon className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      )
    });
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
      <TableToolbar 
        title="Contas a Pagar"
        filters={
          <>
            <div className="flex bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
              <button type="button" onClick={() => setStatusFilter('open')} className={`px-4 py-1 text-[11px] font-bold tracking-widest uppercase rounded-md transition-all ${statusFilter === 'open' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Abertas</button>
              <button type="button" onClick={() => setStatusFilter('paid')} className={`px-4 py-1 text-[11px] font-bold tracking-widest uppercase rounded-md transition-all ${statusFilter === 'paid' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Pagas</button>
              <button type="button" onClick={() => setStatusFilter('all')} className={`px-4 py-1 text-[11px] font-bold tracking-widest uppercase rounded-md transition-all ${statusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Todas</button>
            </div>
            <input 
              type="month" 
              value={monthFilter} 
              onChange={e=>setMonthFilter(e.target.value)} 
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1 text-[13px] font-bold text-slate-600 dark:text-slate-300 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono h-[30px]" 
            />
          </>
        }
        actions={
          <button 
            type="button"
            onClick={load} 
            className="p-1.5 h-[30px] w-[30px] rounded-lg bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shadow-sm"
            title="Atualizar Tabela"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        }
      />
      
      {/* Main Content Area */}
      <div className="p-6 relative">
          {errorToast && (
              <InlineAlert 
                  type="error" 
                  title="Falha de Conexão" 
                  message={errorToast} 
                  isToast 
                  onClose={() => setErrorToast('')} 
              />
          )}

        {(!hideAddForm && !readOnly) && (
        <form onSubmit={onAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6 bg-slate-50/50 dark:bg-slate-900/10 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-2xl"></div>
          
          <FormField label="Título" className="md:col-span-3">
            <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Aluguel" required />
          </FormField>
          
          <FormField label="Valor" className="md:col-span-2">
            <Input value={amount} onChange={e=>setAmount(e.target.value)} type="number" step="0.01" placeholder="Ex: 50.00" required />
          </FormField>
          
          <div className="md:col-span-3 grid grid-cols-3 gap-2">
            <FormField label="Parc." className="col-span-1">
              <Input value={installments} onChange={e=>setInstallments(parseInt(e.target.value)||1)} type="number" min="1" max="60" placeholder="1" title="Parcelas" />
            </FormField>
            <FormField label="Vencimento" className="col-span-2">
              <Input value={dueDate} onChange={e=>setDueDate(e.target.value)} type="date" required />
            </FormField>
          </div>
          
          <FormField label="Categoria" className="md:col-span-2">
            <Select value={category} onChange={e=>setCategory(e.target.value)}>
              <option value="">Selecione</option>
              {categories.filter(c=>c.type==='Saída').map(c=> (<option key={c.id} value={c.name}>{c.name}</option>))}
            </Select>
          </FormField>
          
          <FormField label="Centro de Custo" className="md:col-span-2">
            <Select value={costCenterId} onChange={e=>setCostCenterId(e.target.value)}>
              <option value="">Selecione</option>
              {costCenters.map(cc=> (<option key={cc.id} value={cc.id}>{cc.name}</option>))}
            </Select>
          </FormField>
          
          <div className="md:col-span-12 flex justify-end mt-2">
            <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[13px] tracking-wide transition-all shadow-sm shadow-indigo-200/50">
              LANÇAR CONTA
            </button>
          </div>
        </form>
        )}

      <DataTable 
        columns={columns}
        data={items}
        keyField="id"
        isLoading={loading}
        emptyMessage="Nenhuma conta a pagar encontrada"
        emptyIcon={DocumentIcon}
        emptyActionLabel={isFiltered ? "Limpar Filtros" : undefined}
        onEmptyAction={isFiltered ? clearFilters : undefined}
        pagination={true}
        rowsPerPage={5}
        rowClassName={(it) => it.status === 'paid'
          ? 'bg-slate-50/20 dark:bg-slate-800/10 hover:bg-slate-100/40 dark:hover:bg-slate-800/20'
          : 'bg-rose-50/20 dark:bg-rose-950/5 hover:bg-rose-100/35 dark:hover:bg-rose-950/15 border-l-2 border-l-rose-300 dark:border-l-rose-800'
        }
      />

      {editId && !readOnly && (
        <form onSubmit={submitEdit} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 p-5 rounded-2xl shadow-sm ring-1 ring-slate-200/50 dark:ring-transparent relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-400 rounded-l-2xl"></div>
          
          <div className="md:col-span-12 border-b border-slate-100 dark:border-slate-800/60 pb-2 mb-2">
            <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Editando Conta</h4>
          </div>

          <FormField label="Título" className="md:col-span-3">
            <Input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Título" required />
          </FormField>
          
          <FormField label="Valor" className="md:col-span-2">
            <Input value={editAmount} onChange={e=>setEditAmount(e.target.value)} placeholder="Valor" />
          </FormField>
          
          <FormField label="Vencimento" className="md:col-span-2">
            <Input value={editDueDate} onChange={e=>setEditDueDate(e.target.value)} type="date" />
          </FormField>
          
          <FormField label="Categoria" className="md:col-span-3">
            <Select value={editCategory} onChange={e=>setEditCategory(e.target.value)}>
              <option value="">Categoria</option>
              {categories.filter(c=>c.type==='Saída').map(c=> (<option key={c.id} value={c.name}>{c.name}</option>))}
            </Select>
          </FormField>
          
          <FormField label="Status" className="md:col-span-2">
            <Select value={editStatus} onChange={e=>setEditStatus(e.target.value)}>
              <option value="open">Aberta</option>
              <option value="paid">Paga</option>
            </Select>
          </FormField>
          
          <FormField label="Fornecedor" className="md:col-span-3">
            <Input value={editSupplier} onChange={e=>setEditSupplier(e.target.value)} placeholder="Fornecedor" />
          </FormField>
          
          <FormField label="Centro de Custo" className="md:col-span-3">
            <Select value={editCostCenterId} onChange={e=>setEditCostCenterId(e.target.value)}>
              <option value="">Centro de Custo</option>
              {costCenters.map(cc=> (<option key={cc.id} value={cc.id}>{cc.name}</option>))}
            </Select>
          </FormField>

          <FormField label="Observações" className="md:col-span-6">
            <Input value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Observações" />
          </FormField>
          
          <div className="md:col-span-12 flex gap-3 justify-end mt-2">
            <button type="button" onClick={cancelEdit} className="px-5 py-2 rounded-xl text-[13px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-xl text-[13px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200/50 transition-all">Salvar Alterações</button>
          </div>
        </form>
      )}

      {markingId && !readOnly && (
        <form onSubmit={onMarkPaid} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 p-5 rounded-2xl shadow-sm ring-1 ring-emerald-200/50 dark:ring-transparent relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l-2xl"></div>
          
          <div className="md:col-span-12 border-b border-emerald-100 dark:border-emerald-800/40 pb-2 mb-2">
            <h4 className="text-[12px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Confirmação de Liquidação</h4>
          </div>

          <FormField label="Conta do Pagamento" className="md:col-span-3">
            <Select value={accountId} onChange={e=>setAccountId(e.target.value)} required>
              <option value="">Selecione a Conta</option>
              {accounts.map(a=> (<option key={a.id} value={a.id}>{a.name}</option>))}
            </Select>
          </FormField>
          
          <FormField label="Valor Efetivamente Pago" className="md:col-span-2">
            <Input value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} type="number" step="0.01" placeholder="Ex: 50.00" />
          </FormField>
          
          <FormField label="Data do Pagamento" className="md:col-span-3">
            <Input value={paidDate} onChange={e=>setPaidDate(e.target.value)} type="date" />
          </FormField>
          
          <FormField label="Método de Pagamento" className="md:col-span-4">
            <Select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
              <option value="">Selecione</option>
              {paymentMethodSuggestions.map(p => (<option key={p} value={p}>{p}</option>))}
            </Select>
          </FormField>
          
          {(paymentMethod === 'Boleto' || paymentMethod === '') && (
            <>
              <FormField label="Desconto Bruto" className="md:col-span-2">
                <Input value={discountAmount} onChange={e=>setDiscountAmount(e.target.value)} type="number" step="0.01" placeholder="R$ 0,00" />
              </FormField>
              <FormField label="Multa / Juros Brutos" className="md:col-span-2">
                <Input value={penaltyAmount} onChange={e=>setPenaltyAmount(e.target.value)} type="number" step="0.01" placeholder="R$ 0,00" />
              </FormField>
            </>
          )}
          
          <div className="md:col-span-12 flex gap-3 justify-end mt-2">
            <button type="button" onClick={()=>setMarkingId('')} className="px-5 py-2 rounded-xl text-[13px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-xl text-[13px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200/50 transition-all flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              Liquidar Pagamento
            </button>
          </div>
        </form>
      )}
      </div>
    </div>
  );
};
