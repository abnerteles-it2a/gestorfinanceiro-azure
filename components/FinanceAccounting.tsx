import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { isIncomeTx, isExpenseTx, isTransferTx, calculateAccountBalances } from '../utils/transactionHelpers';
import { PayablesList } from './PayablesList';
import { ReceivablesList } from './ReceivablesList';
import CashFlowView from './CashFlowView';
import { KpiCard } from './KpiCard';
import { PlusIcon, TrendingUpIcon, BankIcon, ListBulletIcon, ArrowUpIcon, ArrowDownIcon, TrophyIcon, WalletIcon, AlertTriangleIcon, SparklesIcon } from './icons';
import { Modal } from './shared/Modal';
import { DEFAULT_CATEGORY_EMOJIS } from './SettingsModal';
import { useToast } from '../context/ToastContext';
import { UpgradeScreen } from './UpgradeScreen';
import { PredictiveCashFlow } from './PredictiveCashFlow';
import { SubscriptionAuditor } from './SubscriptionAuditor';

interface FinanceAccountingProps {
  activeSubTab: 'cashflow' | 'obligations' | 'accounting';
  setActiveSubTab: (tab: 'cashflow' | 'obligations' | 'accounting') => void;
  onEditTransaction?: (transaction: any) => void;
}

const FinanceAccounting: React.FC<FinanceAccountingProps> = ({
  activeSubTab,
  setActiveSubTab,
  onEditTransaction
}) => {
  const { showToast } = useToast();
  const tab = activeSubTab;
  const setTab = setActiveSubTab;

  const [showModal, setShowModal] = React.useState(false);
  const [accountingTab, setAccountingTab] = React.useState<'dre' | 'balanco'>('dre');
  const [obligationsTab, setObligationsTab] = React.useState<'payables' | 'receivables'>('payables');
  const [newType, setNewType] = React.useState<'ap'|'ar'>('ap');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [aiAuditReport, setAiAuditReport] = React.useState<string | null>(null);
  const [isGeneratingAudit, setIsGeneratingAudit] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce?.detail?.tab && ['cashflow', 'obligations', 'accounting'].includes(ce.detail.tab)) {
        setTab(ce.detail.tab);
      }
      if (ce?.detail?.obligationsTab && ['payables', 'receivables'].includes(ce.detail.obligationsTab)) {
        setObligationsTab(ce.detail.obligationsTab);
      }
      if (ce?.detail?.accountingTab && ['dre', 'balanco'].includes(ce.detail.accountingTab)) {
        setAccountingTab(ce.detail.accountingTab);
      }
    };
    window.addEventListener('gestor_financeiro_set_finance_tab', handler as EventListener);
    return () => window.removeEventListener('gestor_financeiro_set_finance_tab', handler as EventListener);
  }, [setTab]);
  const [title, setTitle] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [dueDate, setDueDate] = React.useState(() => new Date().toISOString().slice(0,10));
  const [issueDate, setIssueDate] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [costCenterId, setCostCenterId] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [party, setParty] = React.useState('');
  const [notes, setNotes] = React.useState('');
  
  // Category Creation State
  const [isNewCategoryOpen, setIsNewCategoryOpen] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newCategoryIcon, setNewCategoryIcon] = React.useState('');
  const [emojiFilter, setEmojiFilter] = React.useState('');
  const [newCategoryType, setNewCategoryType] = React.useState<'Entrada'|'Saída'>('Saída');

  const { 
    categories, 
    costCenters, 
    accounts, 
    totalBalance, 
    marketData, 
    transactions, 
    investments, 
    fixedIncomeInvestments, 
    viewMode,
    addCategory,
    planInfo,
    subscriptionInfo
  } = useFinancialData();
  const isTrialActive = !!(subscriptionInfo?.isTrial && !subscriptionInfo?.isExpired);
  const isStarterLocked = (planInfo?.tier === 'starter') && !isTrialActive;
  const [snapshotReceivables, setSnapshotReceivables] = React.useState<any[]>([]);
  const [snapshotPayables, setSnapshotPayables] = React.useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = React.useState(() => new Date().toISOString().slice(0,7));

  // Token readiness: poll localStorage until JWT is available, then load snapshots
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

  const getAuthHeaders = React.useCallback((): Record<string,string> => {
    const headers: Record<string,string> = { 'content-type': 'application/json' };
    try { const t = window.localStorage.getItem('gestor_financeiro_app_token') || ''; if (t) headers['authorization'] = `Bearer ${t}`; } catch {}
    if (viewMode) headers['x-view-mode'] = viewMode;
    return headers;
  }, [viewMode]);

  const loadSnapshots = React.useCallback(async () => {
    try {
      const r1 = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'receivables_list', data: { status: 'open' } }) });
      const j1 = await r1.json();
      setSnapshotReceivables(j1.rows || []);
    } catch { setSnapshotReceivables([]); }
    try {
      const r2 = await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ type: 'payables_list', data: { status: 'open' } }) });
      const j2 = await r2.json();
      setSnapshotPayables(j2.rows || []);
    } catch { setSnapshotPayables([]); }
  }, [getAuthHeaders]);

  React.useEffect(() => {
    if (hasToken) loadSnapshots();
  }, [loadSnapshots, hasToken]);


  const variableInvestmentsValue = React.useMemo(() => {
    return investments.reduce((sum, inv) => {
      const price = marketData[inv.ticker]?.price ?? inv.purchasePrice;
      return sum + price * inv.quantity;
    }, 0);
  }, [investments, marketData]);
  const fixedInvestmentsValue = React.useMemo(() => {
    return fixedIncomeInvestments.reduce((sum, inv) => sum + inv.amountInvested, 0);
  }, [fixedIncomeInvestments]);
  const receivablesOpenTotal = React.useMemo(() => {
    return snapshotReceivables.reduce((s, r) => s + Number((r.amount || 0) - (r.received_amount || 0)), 0);
  }, [snapshotReceivables]);
  const nowMs = new Date().getTime();
  const payablesShort = React.useMemo(() => {
    return snapshotPayables.filter(p => {
      const dueMs = new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime();
      const diffDays = Math.round((dueMs - nowMs) / (24*60*60*1000));
      return diffDays <= 30;
    });
  }, [snapshotPayables]);
  const payablesLong = React.useMemo(() => {
    return snapshotPayables.filter(p => {
      const dueMs = new Date(String(p.due_date).slice(0,10)+'T12:00:00').getTime();
      const diffDays = Math.round((dueMs - nowMs) / (24*60*60*1000));
      return diffDays > 30;
    });
  }, [snapshotPayables]);
  const sumByCategory = (list: any[]) => {
    const map: Record<string, number> = {};
    list.forEach(p => {
      const name = String(p.category || 'Outros');
      map[name] = (map[name] || 0) + Number((p.amount || 0) - (p.paid_amount || 0));
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  };

  const shortByCategory = React.useMemo(() => sumByCategory(payablesShort), [payablesShort]);
  const longByCategory = React.useMemo(() => sumByCategory(payablesLong), [payablesLong]);
  const shortTotal = React.useMemo(() => payablesShort.reduce((s,p)=> s + Number((p.amount||0) - (p.paid_amount||0)), 0), [payablesShort]);
  const longTotal = React.useMemo(() => payablesLong.reduce((s,p)=> s + Number((p.amount||0) - (p.paid_amount||0)), 0), [payablesLong]);
  const totalAssets = React.useMemo(() => totalBalance + variableInvestmentsValue + fixedInvestmentsValue + receivablesOpenTotal, [totalBalance, variableInvestmentsValue, fixedInvestmentsValue, receivablesOpenTotal]);
  const totalLiabilities = React.useMemo(() => shortTotal + longTotal, [shortTotal, longTotal]);
  const netEquityCalc = React.useMemo(() => totalAssets - totalLiabilities, [totalAssets, totalLiabilities]);
  const monthTx = React.useMemo(() => transactions.filter(t => (t.date || '').slice(0,7) === selectedMonth), [transactions, selectedMonth]);
  
  const monthIncome = React.useMemo(() => monthTx.filter(t => isIncomeTx(t.transactionType)).reduce((s, t) => s + Number(t.amount || 0), 0), [monthTx]);
  const monthExpense = React.useMemo(() => monthTx.filter(t => isExpenseTx(t.transactionType)).reduce((s, t) => s + Number(t.amount || 0), 0), [monthTx]);
  
  const expenseByCategory = React.useMemo(() => {
    const map: Record<string, number> = {};
    monthTx.forEach(t => {
      if (!isExpenseTx(t.transactionType) || (t as any).isInternal) return;
      const k = String(t.category || 'Outros');
      map[k] = (map[k] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthTx]);

  const incomeByCategory = React.useMemo(() => {
    const map: Record<string, number> = {};
    monthTx.forEach(t => {
      if (!isIncomeTx(t.transactionType) || (t as any).isInternal) return;
      const k = String(t.category || 'Outros');
      map[k] = (map[k] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthTx]);

  const cogsKeywords = ['Materia Prima', 'Mercadoria', 'Frete', 'Comissao', 'Insumos', 'Producao'];
  const dreCalculations = React.useMemo(() => {
    let cogs = 0;
    let opex = 0;
    let taxes = 0;

    expenseByCategory.forEach(([cat, val]) => {
      const normalized = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (cogsKeywords.some(k => normalized.includes(k.toLowerCase()))) {
        cogs += val;
      } else if (normalized.includes('imposto') || normalized.includes('taxa')) {
        taxes += val;
      } else {
        opex += val;
      }
    });

    const grossProfit = monthIncome - cogs;
    const ebitda = grossProfit - opex;
    const netResult = ebitda - taxes;

    return { cogs, opex, taxes, grossProfit, ebitda, netResult };
  }, [expenseByCategory, monthIncome]);

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(accounts, transactions);
  }, [accounts, transactions]);

  const payablesOpenTotal = React.useMemo(() => {
    return snapshotPayables.reduce((s, p) => s + Math.max(0, Number(p.amount || 0) - Number(p.paid_amount || 0)), 0);
  }, [snapshotPayables]);

  const todayYmd = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const toYmd = (v: any) => String(v || '').slice(0, 10);
  const isOverdue = (dueYmd: string, todayYmd: string) => dueYmd < todayYmd;

  const balanceMetrics = React.useMemo(() => {
    const currentAssets = totalBalance + receivablesOpenTotal;
    const nonCurrentAssets = variableInvestmentsValue + fixedInvestmentsValue;
    const currentLiabilities = payablesOpenTotal;
    const nonCurrentLiabilities = 0; 

    // Liquidity Ratios
    const currentLiquidity = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : (currentAssets > 0 ? 10 : 0);
    const immediateLiquidity = currentLiabilities > 0 ? (totalBalance / currentLiabilities) : (totalBalance > 0 ? 10 : 0);
    const dryLiquidity = currentLiabilities > 0 ? ((totalBalance + (receivablesOpenTotal * 0.8)) / currentLiabilities) : 10;
    
    const debtToEquity = netEquityCalc !== 0 ? (totalLiabilities / netEquityCalc) : 0;

    // Aging Logic
    const getAging = (rows: any[]) => {
      const now = new Date();
      const buckets = { b30: 0, b60: 0, b90: 0, bPlus: 0 };
      rows.forEach(r => {
        const due = new Date(r.due_date);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const unpaid = Math.max(0, Number(r.amount || 0) - Number(r.paid_amount || r.received_amount || 0));
        
        if (diffDays <= 30) buckets.b30 += unpaid;
        else if (diffDays <= 60) buckets.b60 += unpaid;
        else if (diffDays <= 90) buckets.b90 += unpaid;
        else buckets.bPlus += unpaid;
      });
      return buckets;
    };

    return { 
      currentAssets, 
      nonCurrentAssets, 
      currentLiabilities, 
      nonCurrentLiabilities, 
      currentLiquidity, 
      immediateLiquidity,
      dryLiquidity,
      debtToEquity,
      receivablesAging: getAging(snapshotReceivables),
      payablesAging: getAging(snapshotPayables)
    };
  }, [totalBalance, receivablesOpenTotal, variableInvestmentsValue, fixedInvestmentsValue, payablesOpenTotal, totalLiabilities, netEquityCalc, snapshotReceivables, snapshotPayables]);

  const variationRows = React.useMemo(() => {
    const rows: { group: string; cat: string; cc: string; inc: number; exp: number; net: number }[] = [];
    monthTx.forEach(t => {
      const cc = String(t.costCenterId || '');
      const cat = String(t.category || '');
      const key = `${cat}|${cc}`;
      let row = rows.find(r => `${r.cat}|${r.cc}` === key);
      if (!row) { row = { group: '', cat, cc, inc: 0, exp: 0, net: 0 }; rows.push(row); }
      if (isIncomeTx(t.transactionType)) row.inc += t.amount;
      else if (isExpenseTx(t.transactionType)) row.exp += t.amount;
      row.net = row.inc - row.exp;
    });
    rows.forEach(r => { r.group = r.inc > 0 && r.exp === 0 ? 'Receitas Totais' : r.exp > 0 && r.inc === 0 ? 'Despesas Totais' : 'Misto'; });
    return rows.sort((a,b)=> Math.abs(b.net) - Math.abs(a.net));
  }, [monthTx]);
  
  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = newType === 'ap'
        ? { type: 'payables_insert', data: { title, amount: Number(amount || 0), issueDate: (issueDate || null), dueDate, category: (category || null), costCenterId: (costCenterId || null), supplier: (party || null), notes: (notes || null) } }
        : { type: 'receivables_insert', data: { title, amount: Number(amount || 0), issueDate: (issueDate || null), dueDate, category: (category || null), costCenterId: (costCenterId || null), customer: (party || null), notes: (notes || null) } };
      await fetch('/api/query', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      setShowModal(false);
      setTitle(''); setAmount(''); setIssueDate(''); setCategory(''); setCostCenterId(''); setParty(''); setNotes('');
      setReloadKey(k => k + 1);
      loadSnapshots();
    } catch {}
  };
  const handleGenerateAiAudit = async () => {
    setIsGeneratingAudit(true);
    setAiAuditReport(null);
    try {
      const token = window.localStorage.getItem('gestor_financeiro_app_token');
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers['authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/advice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          kind: 'accounting_audit',
          accounting: {
            month: selectedMonth,
            grossRevenue: monthIncome,
            cogs: dreCalculations.cogs,
            grossProfit: dreCalculations.grossProfit,
            operatingExpenses: dreCalculations.opex,
            netProfit: dreCalculations.netResult,
            topCategories: expenseByCategory.slice(0, 5),
          }
        })
      });
      const json = await res.json();
      if (json.text) {
        setAiAuditReport(json.text);
        showToast('Parecer Contábil emitido com sucesso pela IA!', 'success');
      } else {
        showToast('Não foi possível gerar o parecer no momento.', 'warning');
      }
    } catch (e: any) {
      showToast(e.message || 'Erro ao gerar parecer contábil', 'error');
    } finally {
      setIsGeneratingAudit(false);
    }
  };

  return (
    <div className="space-y-5 lg:space-y-6 animate-fade-in pb-6 px-0.5 sm:px-1">

      {/* Workbench Toolbar: Alternância de Visão */}

      <div className="flex flex-col gap-4">
        <div className="bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-slate-800/80 self-start flex items-center gap-1 shadow-xs overflow-x-auto max-w-full">
            <button 
                onClick={() => setTab('cashflow')}
                className={`px-3.5 sm:px-5 py-1.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${tab === 'cashflow' ? 'bg-[#2E7D32] text-white shadow-xs ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
                Fluxo de Caixa & Projeção
            </button>
            <button 
                onClick={() => setTab('obligations')}
                className={`px-3.5 sm:px-5 py-1.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${tab === 'obligations' ? 'bg-[#1565C0] text-white shadow-xs ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
                Contas a Pagar e Receber
            </button>
            <button 
                onClick={() => setTab('accounting')}
                className={`px-3.5 sm:px-5 py-1.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${tab === 'accounting' ? 'bg-[#0097A7] text-white shadow-xs ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
                Visão Contábil
            </button>
        </div>

        {tab === 'cashflow' && (
          <div className="animate-slide-up space-y-8">
            <PredictiveCashFlow />
            <CashFlowView onEditTransaction={onEditTransaction || (() => {})} />
            <SubscriptionAuditor />
          </div>
        )}
        {tab === 'obligations' && (
          isStarterLocked ? (
            <UpgradeScreen
              title="Contas a Pagar e Receber"
              description="Gerencie seus compromissos financeiros e previsões de receitas. Tenha controle total de vencimentos, fluxo de caixa futuro projetado e conciliação de parcelas."
              requiredTier="plus"
            />
          ) : (
            <div className="space-y-6 animate-slide-up">
              {/* Sub-navegação Pagar / Receber */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner self-start">
                  <button
                    onClick={() => setObligationsTab('payables')}
                    className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      obligationsTab === 'payables'
                        ? 'bg-rose-500 text-white shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    🔴 Contas a Pagar
                  </button>
                  <button
                    onClick={() => setObligationsTab('receivables')}
                    className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      obligationsTab === 'receivables'
                        ? 'bg-emerald-600 text-white shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    🟢 Contas a Receber
                  </button>
                </div>
              </div>

              {/* Lista Full-width */}
              {obligationsTab === 'payables' && (
                <div className="animate-fade-in">
                  <PayablesList reloadKey={reloadKey} />
                </div>
              )}
              {obligationsTab === 'receivables' && (
                <div className="animate-fade-in">
                  <ReceivablesList reloadKey={reloadKey} />
                </div>
              )}
            </div>
          )
        )}

        {tab === 'accounting' && (
          isStarterLocked ? (
            <UpgradeScreen
              title="Visão Contábil (DRE & Balanço)"
              description="Acesse demonstrativos de resultados contábeis completos, margens operacionais de lucro, EBITDA e Balanço Patrimonial automatizados."
              requiredTier="plus"
            />
          ) : (
            <div className="space-y-8 animate-slide-up focus:outline-none">
              {/* Contábil Sub-navigation and Month Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
                  <button
                    onClick={() => setAccountingTab('dre')}
                    className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      accountingTab === 'dre'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    📊 DRE Estruturada
                  </button>
                  <button
                    onClick={() => setAccountingTab('balanco')}
                    className={`px-5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      accountingTab === 'balanco'
                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    🏦 Balanço Patrimonial
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês de Referência:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 shadow-sm focus:ring-0 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* DRE Tab */}
              {accountingTab === 'dre' && (
                <div className="space-y-4 sm:space-y-5 focus:outline-none animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <KpiCard 
                      title="Receitas Brutas" 
                      value={formatCurrency(monthIncome)} 
                      icon={<ArrowUpIcon className="h-6 w-6 text-emerald-500" />} 
                      subtext="Total em Entradas"
                    />
                    <KpiCard 
                      title="Resultado Bruto" 
                      value={formatCurrency(dreCalculations.grossProfit)} 
                      icon={<TrophyIcon className="h-6 w-6 text-indigo-500" />} 
                      subtext={`Margem: ${monthIncome > 0 ? ((dreCalculations.grossProfit / monthIncome) * 100).toFixed(1) : 0}%`}
                    />
                    <KpiCard 
                      title="EBITDA" 
                      value={formatCurrency(dreCalculations.ebitda)} 
                      icon={<TrendingUpIcon className="h-6 w-6 text-amber-500" />} 
                      subtext="Resultado Operacional"
                    />
                    <KpiCard 
                      title="Resultado Líquido" 
                      value={formatCurrency(dreCalculations.netResult)} 
                      icon={<WalletIcon className="h-6 w-6 text-indigo-600" />} 
                      subtext={`Margem Líquida: ${monthIncome > 0 ? ((dreCalculations.netResult / monthIncome) * 100).toFixed(1) : 0}%`}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                    {/* Receitas Breakdown */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Abertura de Receitas</h3>
                      </div>
                      <div className="p-0">
                        {!incomeByCategory.length ? (
                          <div className="p-12 text-center text-slate-400 text-sm font-medium">Sem faturamento no período.</div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                              {incomeByCategory.map(([name, val]) => (
                                <tr key={name}>
                                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium">{name}</td>
                                  <td className="px-6 py-3 text-right font-bold text-emerald-600">{formatCurrency(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Despesas Breakdown */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Abertura de Despesas</h3>
                      </div>
                      <div className="p-0">
                        {!expenseByCategory.length ? (
                          <div className="p-12 text-center text-slate-400 text-sm font-medium">Sem despesas no período.</div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                              {expenseByCategory.map(([name, val]) => (
                                <tr key={name}>
                                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium">{name}</td>
                                  <td className="px-6 py-3 text-right font-bold text-rose-500">{formatCurrency(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DRE Completa */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Demonstrativo de Resultado de Exercício (DRE)</h3>
                        <p className="text-[10px] text-slate-400">Análise de margens, custos e resultado operacional do período</p>
                      </div>
                      <button
                        onClick={handleGenerateAiAudit}
                        disabled={isGeneratingAudit}
                        className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
                      >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        <span>{isGeneratingAudit ? 'Auditando...' : 'Emitir Parecer Contábil IA'}</span>
                      </button>
                    </div>

                    {/* AI Audit Report Drawer if generated */}
                    {aiAuditReport && (
                      <div className="p-6 bg-teal-50/20 dark:bg-teal-950/20 border-b border-teal-200/50 dark:border-teal-800/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
                            <SparklesIcon className="w-4 h-4" />
                            <h4 className="text-xs font-black uppercase tracking-wider">Parecer Contábil & Auditoria de DRE</h4>
                          </div>
                          <button
                            onClick={() => setAiAuditReport(null)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 uppercase font-bold"
                          >
                            Fechar
                          </button>
                        </div>
                        <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line bg-white/70 dark:bg-slate-900/70 p-4 rounded-xl border border-teal-100 dark:border-teal-900/50 font-sans">
                          {aiAuditReport}
                        </div>
                      </div>
                    )}
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/10">
                            <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conta</th>
                            <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                          <tr>
                            <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-semibold">(=) RECEITA BRUTA</td>
                            <td className="px-6 py-3 text-right font-bold text-emerald-600">{formatCurrency(monthIncome)}</td>
                          </tr>
                          <tr>
                            <td className="px-6 py-3 text-slate-500 dark:text-slate-400 pl-10">(-) Custo dos Serviços/Mercadorias (COGS)</td>
                            <td className="px-6 py-3 text-right font-bold text-rose-400">({formatCurrency(dreCalculations.cogs)})</td>
                          </tr>
                          <tr className="bg-slate-50/50 dark:bg-slate-900/10 font-bold">
                            <td className="px-6 py-3 text-slate-900 dark:text-white">(=) RESULTADO BRUTO</td>
                            <td className="px-6 py-3 text-right">{formatCurrency(dreCalculations.grossProfit)}</td>
                          </tr>
                          <tr>
                            <td className="px-6 py-3 text-slate-500 dark:text-slate-400 pl-10">(-) Despesas Administrativas/Vendas (OPEX)</td>
                            <td className="px-6 py-3 text-right font-bold text-rose-400">({formatCurrency(dreCalculations.opex)})</td>
                          </tr>
                          <tr className="bg-slate-50/50 dark:bg-slate-900/10 font-bold">
                            <td className="px-6 py-3 text-slate-900 dark:text-white">(=) EBITDA</td>
                            <td className="px-6 py-3 text-right text-indigo-600 dark:text-indigo-400">{formatCurrency(dreCalculations.ebitda)}</td>
                          </tr>
                          <tr>
                            <td className="px-6 py-3 text-slate-500 dark:text-slate-400 pl-10">(-) Impostos e Taxas</td>
                            <td className="px-6 py-3 text-right font-bold text-rose-400">({formatCurrency(dreCalculations.taxes)})</td>
                          </tr>
                          <tr className="bg-slate-100/50 dark:bg-slate-900/30 font-black text-base border-t-2 border-slate-200 dark:border-slate-700">
                            <td className="px-6 py-4 text-slate-950 dark:text-white">(=) RESULTADO LÍQUIDO DO PERÍODO</td>
                            <td className="px-6 py-4 text-right text-indigo-650 dark:text-indigo-450">{formatCurrency(dreCalculations.netResult)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>



                {/* Despesas Detail */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Análise Vertical de Despesas</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoria / Grupos</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Montante (R$)</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">AV (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                        {expenseByCategory.map(([name, val]) => (
                          <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium">{name}</td>
                            <td className="px-6 py-3 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(val)}</td>
                            <td className="px-6 py-3 text-right text-slate-400 font-bold">
                              {monthIncome > 0 ? ((val / monthIncome) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Balanço Patrimonial Tab */}
            {accountingTab === 'balanco' && (
              <div className="space-y-4 sm:space-y-5 focus:outline-none animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <KpiCard 
                    title="Total Ativos" 
                    value={formatCurrency(totalAssets)} 
                    icon={<TrophyIcon className="h-6 w-6 text-emerald-500" />} 
                    subtext="Patrimônio Bruto"
                  />
                  <KpiCard 
                    title="Total Passivos" 
                    value={formatCurrency(totalLiabilities)} 
                    icon={<AlertTriangleIcon className="h-6 w-6 text-red-500" />} 
                    subtext="Obrigações Totais"
                  />
                  <KpiCard 
                    title="Liquidez Corrente" 
                    value={balanceMetrics.currentLiquidity.toFixed(2)} 
                    icon={<TrendingUpIcon className="h-6 w-6 text-indigo-600" />} 
                    subtext={balanceMetrics.currentLiquidity >= 1.5 ? "Saúde Excelente" : balanceMetrics.currentLiquidity >= 1 ? "Saúde Estável" : "Risco de Caixa"}
                  />
                  <KpiCard 
                    title="Patrimônio Líquido" 
                    value={formatCurrency(netEquityCalc)} 
                    icon={<BankIcon className="h-6 w-6 text-indigo-500" />} 
                    subtext="Riqueza Real"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Ativos Section */}
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ativos (Bens e Direitos)</h3>
                      </div>
                      <div className="p-0">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                            {/* Circulante */}
                            <tr className="bg-slate-50/30 dark:bg-slate-700/10">
                              <td className="px-6 py-3 text-slate-500 uppercase text-[10px] font-bold">1. Ativo Circulante</td>
                              <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(balanceMetrics.currentAssets)}</td>
                            </tr>
                            <tr>
                              <td className="px-10 py-2 text-slate-600 dark:text-slate-400 font-medium italic">Disponibilidades (Bancos)</td>
                              <td className="px-6 py-2 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(totalBalance)}</td>
                            </tr>
                            {accounts.map(acc => (
                              <tr key={acc.id}>
                                <td className="px-14 py-1.5 text-slate-500 dark:text-slate-500 text-[11px]">{acc.name}</td>
                                <td className="px-6 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(accountBalances[acc.id] || 0)}</td>
                              </tr>
                            ))}
                            <tr>
                              <td className="px-10 py-2 text-slate-600 dark:text-slate-400 font-medium italic">Direitos a Receber (Aging)</td>
                              <td className="px-6 py-2 text-right font-bold text-emerald-600">{formatCurrency(receivablesOpenTotal)}</td>
                            </tr>
                            {/* Sub-tabela Aging Ativo */}
                            <tr className="text-[10px] bg-emerald-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Prazo: Até 30 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-emerald-600/80">{formatCurrency(balanceMetrics.receivablesAging.b30)}</td>
                            </tr>
                            <tr className="text-[10px] bg-emerald-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Prazo: 31 a 60 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-emerald-600/80">{formatCurrency(balanceMetrics.receivablesAging.b60)}</td>
                            </tr>
                            <tr className="text-[10px] bg-emerald-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Prazo: Acima de 61 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-emerald-600/80">{formatCurrency(balanceMetrics.receivablesAging.b90 + balanceMetrics.receivablesAging.bPlus)}</td>
                            </tr>
                            
                            {/* Não Circulante */}
                            <tr className="bg-slate-50/30 dark:bg-slate-700/10 border-t-2 border-slate-100 dark:border-slate-800">
                              <td className="px-6 py-3 text-slate-500 uppercase text-[10px] font-bold">2. Ativo Não Circulante</td>
                              <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(balanceMetrics.nonCurrentAssets)}</td>
                            </tr>
                            <tr>
                              <td className="px-10 py-2 text-slate-600 dark:text-slate-400 font-medium">Investimentos Variáveis (Ações/ETFs)</td>
                              <td className="px-6 py-2 text-right font-semibold text-indigo-500">{formatCurrency(variableInvestmentsValue)}</td>
                            </tr>
                            <tr>
                              <td className="px-10 py-2 text-slate-600 dark:text-slate-400 font-medium">Renda Fixa / Tesouro (LP)</td>
                              <td className="px-6 py-2 text-right font-semibold text-indigo-500">{formatCurrency(fixedInvestmentsValue)}</td>
                            </tr>
                          </tbody>
                          <tfoot className="bg-slate-900 dark:bg-slate-900 text-white font-black">
                            <tr>
                              <td className="px-6 py-4 text-xs uppercase tracking-widest text-slate-300">Total de Ativos (Bens + Direitos)</td>
                              <td className="px-6 py-4 text-right text-lg">{formatCurrency(totalAssets)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Passivos Section */}
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Passivos (Obrigações)</h3>
                      </div>
                      <div className="p-0">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                            {/* Circulante */}
                            <tr className="bg-red-50/30 dark:bg-red-900/10">
                              <td className="px-6 py-3 text-red-700 dark:text-red-400 uppercase text-[10px] font-bold">1. Passivo Circulante</td>
                              <td className="px-6 py-3 text-right font-bold text-red-700">{formatCurrency(balanceMetrics.currentLiabilities)}</td>
                            </tr>
                            <tr>
                              <td className="px-10 py-2 text-slate-600 dark:text-slate-400 font-medium italic">Obrigações de Curto Prazo (Aging)</td>
                              <td className="px-6 py-2 text-right font-bold text-red-600">{formatCurrency(payablesOpenTotal)}</td>
                            </tr>
                            {/* Sub-tabela Aging Passivo */}
                            <tr className="text-[10px] bg-red-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Vencimento: Até 30 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-red-600/80">{formatCurrency(balanceMetrics.payablesAging.b30)}</td>
                            </tr>
                            <tr className="text-[10px] bg-red-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Vencimento: 31 a 60 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-red-600/80">{formatCurrency(balanceMetrics.payablesAging.b60)}</td>
                            </tr>
                            <tr className="text-[10px] bg-red-50/10">
                              <td className="px-14 py-2 font-bold text-slate-400 uppercase tracking-wider">Vencimento: Acima de 61 dias</td>
                              <td className="px-6 py-2 text-right font-bold text-red-600/80">{formatCurrency(balanceMetrics.payablesAging.b90 + balanceMetrics.payablesAging.bPlus)}</td>
                            </tr>

                            {/* Patrimônio Líquido */}
                            <tr className="bg-slate-50/30 dark:bg-slate-700/10 border-t-2 border-slate-100 dark:border-slate-800">
                              <td className="px-6 py-3 text-slate-500 uppercase text-[10px] font-bold">2. Patrimônio Líquido</td>
                              <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(netEquityCalc)}</td>
                            </tr>
                            <tr>
                              <td className="px-10 py-3 text-slate-600 dark:text-slate-400 font-medium">Resultado Líquido Acumulado</td>
                              <td className="px-6 py-3 text-right font-bold text-indigo-600">{formatCurrency(netEquityCalc)}</td>
                            </tr>
                          </tbody>
                          <tfoot className="bg-slate-900 dark:bg-slate-900 text-white font-black">
                            <tr>
                              <td className="px-6 py-4 text-xs uppercase tracking-widest text-slate-300">Total de Passivos + Patrimônio</td>
                              <td className="px-6 py-4 text-right text-lg">{formatCurrency(totalLiabilities + netEquityCalc)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                    
                    {/* Análise de Índices Avançada */}
                    <div className="bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Análise de Liquidez & Solvência</h4>
                      <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Liquidez Imediata (Dinheiro Vivo)</p>
                          <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{balanceMetrics.immediateLiquidity.toFixed(2)}</p>
                          <div className="h-1 w-full bg-slate-200 mt-1 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all" style={{width: `${Math.min(balanceMetrics.immediateLiquidity * 50, 100)}%`}} />
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Liquidez Seca (Disponível + 80% AR)</p>
                          <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{balanceMetrics.dryLiquidity.toFixed(2)}</p>
                          <div className="h-1 w-full bg-slate-200 mt-1 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all" style={{width: `${Math.min(balanceMetrics.dryLiquidity * 50, 100)}%`}} />
                          </div>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Capital de Giro Disponível</p>
                              <p className={`text-lg font-black ${balanceMetrics.currentAssets - balanceMetrics.currentLiabilities >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {formatCurrency(balanceMetrics.currentAssets - balanceMetrics.currentLiabilities)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Endividamento</p>
                              <p className="text-xs font-bold text-slate-600">{(balanceMetrics.debtToEquity * 100).toFixed(1)}% do PL</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}
      </div>

      {/* Modernized Modal for Title Insertion */}
      <Modal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        title="Gestão de Títulos (AP/AR)"
        size="lg"
      >
        <div className="space-y-8 p-2">
          {/* Type indicator — set automatically from the active sub-tab */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${newType === 'ap' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>
              {newType === 'ap' ? '🔴 Conta a Pagar' : '🟢 Conta a Receber'}
            </span>
          </div>

          <form onSubmit={submitNew} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Descrição do Título</label>
                <input 
                  value={title} 
                  onChange={e=>setTitle(e.target.value)} 
                  className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none" 
                  placeholder="Ex: Nota Fiscal 1234"
                  required 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Montante Financeiro (R$)</label>
                <input 
                  value={amount} 
                  onChange={e=>setAmount(e.target.value)} 
                  type="number" 
                  step="0.01" 
                  className="w-full h-11 px-4 text-sm font-bold tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none" 
                  placeholder="0,00"
                  required 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Data de Vencimento</label>
                <input 
                  value={dueDate} 
                  onChange={e=>setDueDate(e.target.value)} 
                  type="date" 
                  className="w-full h-11 px-4 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none" 
                  required 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Data de Emissão (Opcional)</label>
                <input 
                  value={issueDate} 
                  onChange={e=>setIssueDate(e.target.value)} 
                  type="date" 
                  className="w-full h-11 px-4 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none" 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Classificação Categórica</label>
                <div className="flex gap-2">
                    <select 
                    value={category} 
                    onChange={e=>{
                        const v = e.target.value;
                        if (v === '__new_category__') {
                            setNewCategoryType(newType === 'ap' ? 'Saída' : 'Entrada');
                            setIsNewCategoryOpen(true);
                            return;
                        }
                        setCategory(v)
                    }} 
                    className="flex-1 h-11 px-4 text-sm font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none"
                    >
                    <option value="">Selecione...</option>
                    <option value="__new_category__">+ Nova categoria...</option>
                    {(newType==='ap'? categories.filter(c=>c.type==='Saída') : categories.filter(c=>c.type==='Entrada')).map(c=> (<option key={c.id} value={c.name}>{c.name}</option>))}
                    </select>
                    <button 
                        type="button" 
                        onClick={() => {
                            setNewCategoryType(newType === 'ap' ? 'Saída' : 'Entrada');
                            setIsNewCategoryOpen(true);
                        }} 
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors" 
                        title="Nova Categoria"
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Centro de Responsabilidade (CC)</label>
                <select 
                  value={costCenterId} 
                  onChange={e=>setCostCenterId(e.target.value)} 
                  className="w-full h-11 px-4 text-sm font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none"
                >
                  <option value="">Sem vínculo</option>
                  {costCenters.map(cc=> (<option key={cc.id} value={cc.id}>{cc.name}</option>))}
                </select>
              </div>
              <div className="space-y-2.5 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{newType==='ap'?'Fornecedor / Stakeholder':'Cliente / Fonte de Recursos'}</label>
                <input 
                  value={party} 
                  onChange={e=>setParty(e.target.value)} 
                  className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none" 
                  placeholder={newType==='ap'?'Ex: Empresa Logística S.A.':'Ex: Cliente VIP'} 
                />
              </div>
              <div className="space-y-2.5 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Notas Administrativas</label>
                <textarea 
                  value={notes} 
                  onChange={e=>setNotes(e.target.value)} 
                  rows={2}
                  className="w-full px-4 py-3 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#0D9488]/20 focus:border-[#0D9488] transition-all outline-none resize-none" 
                  placeholder="Informações complementares para reconciliação..." 
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button" 
                onClick={()=>setShowModal(false)}
                className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
              >
                Descartar
              </button>
              <button 
                type="submit" 
                className="px-8 py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md shadow-[#0D9488]/20"
              >
                Confirmar Lançamento
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Inline Category Creation Modal */}
      <Modal isOpen={isNewCategoryOpen} onClose={() => setIsNewCategoryOpen(false)} title="Nova Categoria Rápida" size="md">
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newCategoryName.trim();
                    if (!name) return;
                    const type = newCategoryType;
                    const existing = categories.find(c => c.type === type && c.name.toLowerCase() === name.toLowerCase());
                    if (existing) {
                        setCategory(existing.name);
                        setIsNewCategoryOpen(false);
                        setNewCategoryName('');
                        setNewCategoryIcon('');
                        setEmojiFilter('');
                        showToast?.('Categoria já existe. Selecionada no lançamento.', 'info');
                        return;
                    }
                    try {
                        await addCategory({ name, type, icon: newCategoryIcon });
                        setCategory(name);
                        setIsNewCategoryOpen(false);
                        setNewCategoryName('');
                        setNewCategoryIcon('');
                        setEmojiFilter('');
                        showToast?.('Categoria criada com sucesso!', 'success');
                    } catch {
                        showToast?.('Falha ao criar categoria.', 'error');
                    }
                }}
                className="space-y-6"
            >
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nome da Categoria</label>
                    <input type="text" value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white" required placeholder="Ex: Assinaturas Digitais" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Emoji / Ícone</label>
                        <select value={newCategoryIcon} onChange={(e)=>setNewCategoryIcon(e.target.value)} className="w-full h-11 px-4 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white">
                            <option value="">Sem ícone</option>
                            {DEFAULT_CATEGORY_EMOJIS.filter(opt => {
                                const q = emojiFilter.trim().toLowerCase();
                                if (!q) return true;
                                return opt.label.toLowerCase().includes(q) || opt.emoji.toLowerCase().includes(q);
                            }).map(opt => (
                                <option key={opt.emoji} value={opt.emoji}>{opt.emoji} {opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Buscar Emoji</label>
                        <input type="text" value={emojiFilter} onChange={(e)=>setEmojiFilter(e.target.value)} className="w-full h-11 px-4 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder:text-slate-400" placeholder="Filtrar..." />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Tipo de Natureza</label>
                    <select value={newCategoryType} onChange={(e)=>setNewCategoryType(e.target.value as any)} className="w-full h-11 px-4 text-sm font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50 text-slate-900 dark:text-white">
                        <option value="Entrada">Receita (Entrada)</option>
                        <option value="Saída">Despesa (Saída)</option>
                    </select>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button type="button" onClick={()=>setIsNewCategoryOpen(false)} className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Descartar</button>
                    <button type="submit" className="px-8 py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-[11px] font-bold uppercase tracking-widest rounded-xl shadow-md">Criar Categoria</button>
                </div>
            </form>
      </Modal>
    </div>
  );
};

export default FinanceAccounting;
