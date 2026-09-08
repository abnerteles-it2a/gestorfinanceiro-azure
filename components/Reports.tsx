import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ListBulletIcon, ArrowUpIcon, ArrowDownIcon, BankIcon, DollarSignIcon, WalletIcon, TrendingUpIcon, AlertTriangleIcon, TrophyIcon, SparklesIcon } from './icons';
import { KpiCard } from './KpiCard';
import { StatusTag } from './ui/StatusTag';
import { EmptyState } from './ui/EmptyState';
import { LoaderState } from './ui/LoaderState';
import { UpgradeScreen } from './UpgradeScreen';
import { calculateMeiFiscal } from '../utils/meiFiscalCalculator';
import { MeiMonthlyClosingPanel } from './MeiMonthlyClosingPanel';

type ReportTab = 'ap' | 'ar' | 'dre' | 'balanco' | 'mei' | 'fluxo' | 'categorias';

type PayableRow = {
    id: string;
    title: string;
    status: string;
    amount: number;
    paid_amount?: number | null;
    due_date: string;
    issue_date?: string | null;
    category?: string | null;
    supplier?: string | null;
    notes?: string | null;
    is_recurring?: boolean;
};

type ReceivableRow = {
    id: string;
    title: string;
    status: string;
    amount: number;
    received_amount?: number | null;
    due_date: string;
    issue_date?: string | null;
    category?: string | null;
    customer?: string | null;
    notes?: string | null;
    is_recurring?: boolean;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabelPtBr = (yyyyMm: string) => {
    try {
        if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm;
        const d = new Date(`${yyyyMm}-01T12:00:00`);
        return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
    } catch {
        return yyyyMm;
    }
};

const toYmd = (v: any) => String(v || '').slice(0, 10);

const isOverdue = (dueYmd: string, todayYmd: string) => dueYmd < todayYmd;

const sumOpen = (rows: Array<{ amount: number; status: string; paid_amount?: number | null; received_amount?: number | null }>) => {
    return rows
        .filter(r => String(r.status || '').toLowerCase() === 'open')
        .reduce((s, r: any) => {
            const paid = Number(r.paid_amount || r.received_amount || 0);
            return s + Math.max(0, Number(r.amount || 0) - paid);
        }, 0);
};

const Reports: React.FC = () => {
    const fd = useFinancialData() as any;
    const { transactions, accounts, investments, fixedIncomeInvestments, marketData, isMei, viewMode, userPreferences, organizationInfo, planInfo, categories, meiOpeningDate } = fd;
    const [tab, setTab] = React.useState<ReportTab>('fluxo');
    const [month, setMonth] = React.useState<string>(() => monthKey(new Date()));
    const [payables, setPayables] = React.useState<PayableRow[]>([]);
    const [receivables, setReceivables] = React.useState<ReceivableRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedAccountId, setSelectedAccountId] = React.useState<string>('all');
    const [isAggregatedView, setIsAggregatedView] = React.useState<boolean>(false);
    const [startDate, setStartDate] = React.useState<string>('');
    const [endDate, setEndDate] = React.useState<string>('');
    const [printCatWithDetails, setPrintCatWithDetails] = React.useState<boolean>(true);
    const [printCatSelection, setPrintCatSelection] = React.useState<Set<string>>(new Set());

    // Sync dates when month changes
    React.useEffect(() => {
        if (month) {
            const [y, m] = month.split('-').map(Number);
            const first = new Date(y, m - 1, 1).toISOString().split('T')[0];
            const last = new Date(y, m, 0).toISOString().split('T')[0];
            setStartDate(first);
            setEndDate(last);
        }
    }, [month]);

    const getAuthHeaders = React.useCallback((): Record<string, string> => {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        try {
            const t = window.localStorage.getItem('gestor_financeiro_app_token') || '';
            if (t) headers['authorization'] = `Bearer ${t}`;
        } catch { }
        if (viewMode) headers['x-view-mode'] = viewMode;
        return headers;
    }, [viewMode]);

    React.useEffect(() => {
        const h = () => { if (window.onbeforeprint !== undefined) document.title = ' '; };
        const a = () => { if (window.onafterprint !== undefined) document.title = 'Gestor Financeiro'; };
        window.addEventListener('beforeprint', h);
        window.addEventListener('afterprint', a);
        return () => {
            window.removeEventListener('beforeprint', h);
            window.removeEventListener('afterprint', a);
        };
    }, []);

    const printTimestamp = React.useMemo(() => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()), []);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const request = (type: 'payables_list' | 'receivables_list') => fetch('/api/query', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ type, data: { month } }),
            }).then(async response => response.ok ? response.json() : { rows: [] }).catch(() => ({ rows: [] }));
            const [payablesResult, receivablesResult] = await Promise.all([
                request('payables_list'),
                request('receivables_list'),
            ]);
            if (!cancelled) {
                setPayables(Array.isArray(payablesResult?.rows) ? payablesResult.rows : []);
                setReceivables(Array.isArray(receivablesResult?.rows) ? receivablesResult.rows : []);
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [getAuthHeaders, month]);

    const todayYmd = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

    const payablesOpen = React.useMemo(() => payables.filter(p => String(p.status || '').toLowerCase() === 'open'), [payables]);
    const receivablesOpen = React.useMemo(() => receivables.filter(r => String(r.status || '').toLowerCase() === 'open'), [receivables]);

    const payablesOverdue = React.useMemo(() => payablesOpen.filter(p => isOverdue(toYmd(p.due_date), todayYmd)), [payablesOpen, todayYmd]);
    const payablesUpcoming = React.useMemo(() => payablesOpen.filter(p => !isOverdue(toYmd(p.due_date), todayYmd)), [payablesOpen, todayYmd]);
    const receivablesOverdue = React.useMemo(() => receivablesOpen.filter(r => isOverdue(toYmd(r.due_date), todayYmd)), [receivablesOpen, todayYmd]);
    const receivablesUpcoming = React.useMemo(() => receivablesOpen.filter(r => !isOverdue(toYmd(r.due_date), todayYmd)), [receivablesOpen, todayYmd]);

    const payablesOpenTotal = React.useMemo(() => sumOpen(payables), [payables]);
    const receivablesOpenTotal = React.useMemo(() => sumOpen(receivables), [receivables]);

    const monthTx = React.useMemo(() => transactions.filter(t => String(t.date || '').slice(0, 7) === month), [transactions, month]);
    const monthIncome = React.useMemo(() => monthTx.filter(t => t.transactionType === 'Entrada').reduce((s, t) => s + Number(t.amount || 0), 0), [monthTx]);
    const monthExpense = React.useMemo(() => monthTx.filter(t => t.transactionType === 'Saída').reduce((s, t) => s + Number(t.amount || 0), 0), [monthTx]);
    const monthNet = React.useMemo(() => monthIncome - monthExpense, [monthIncome, monthExpense]);
    const expenseByCategory = React.useMemo(() => {
        const map: Record<string, number> = {};
        monthTx.forEach(t => {
            if (t.transactionType !== 'Saída' || t.isInternal) return;
            const k = String(t.category || 'Outros');
            map[k] = (map[k] || 0) + Number(t.amount || 0);
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [monthTx]);

    const incomeByCategory = React.useMemo(() => {
        const map: Record<string, number> = {};
        monthTx.forEach(t => {
            if (t.transactionType !== 'Entrada' || t.isInternal) return;
            const k = String(t.category || 'Outros');
            map[k] = (map[k] || 0) + Number(t.amount || 0);
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [monthTx]);

    // ─── Category Analysis ─────────────────────────────────────────────────────
    const categoryData = React.useMemo(() => {
        const map: Record<string, { income: number; expense: number; count: number; txs: typeof monthTx }> = {};
        monthTx.forEach(t => {
            if (t.isInternal) return;
            const k = String(t.category || 'Sem Categoria');
            if (!map[k]) map[k] = { income: 0, expense: 0, count: 0, txs: [] };
            if (t.transactionType === 'Entrada') map[k].income += Number(t.amount || 0);
            else if (t.transactionType === 'Saída') map[k].expense += Number(t.amount || 0);
            map[k].count++;
            map[k].txs.push(t);
        });
        return Object.entries(map)
            .map(([name, d]) => ({
                name,
                income: d.income,
                expense: d.expense,
                net: d.income - d.expense,
                count: d.count,
                expensePct: monthExpense > 0 ? (d.expense / monthExpense) * 100 : 0,
                incomePct: monthIncome > 0 ? (d.income / monthIncome) * 100 : 0,
                txs: d.txs.sort((a, b) => String(a.date).localeCompare(String(b.date))),
            }))
            .sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
    }, [monthTx, monthIncome, monthExpense]);

    // Sync print selection: auto-add new categories, keep user's manual choices
    React.useEffect(() => {
        setPrintCatSelection(prev => {
            const next = new Set(prev);
            categoryData.forEach(c => { if (!next.has(c.name)) next.add(c.name); });
            return next;
        });
    }, [categoryData]);

    // Financial Analysis (DRE)
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
        const balances: Record<string, number> = {};
        accounts.forEach(acc => { balances[acc.id] = Number(acc.initialBalance || 0); });
        [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
            if (balances[t.accountId] === undefined) return;
            if (t.transactionType === 'Entrada') balances[t.accountId] += Number(t.amount || 0);
            else if (t.transactionType === 'Saída') balances[t.accountId] -= Number(t.amount || 0);
            else if (t.transactionType === 'Transferência') {
                balances[t.accountId] -= Number(t.amount || 0);
                if (t.toAccountId && balances[t.toAccountId] !== undefined) balances[t.toAccountId] += Number(t.amount || 0);
            }
        });
        return balances;
    }, [accounts, transactions]);

    const totalBalance = React.useMemo(() => Object.values(accountBalances).reduce((s, v) => s + Number(v || 0), 0), [accountBalances]);

    // Cash Flow Logic
    const cashFlowData = React.useMemo(() => {
        if (!startDate || !endDate) return { initial: 0, final: 0, income: 0, expense: 0, variation: 0, rows: [], aggregated: [] };

        const transactionEffect = (transaction: any) => {
            const amount = Number(transaction.amount || 0);
            if (selectedAccountId === 'all') {
                if (transaction.transactionType === 'Entrada') return amount;
                if (transaction.transactionType === 'Saída') return -amount;
                return 0;
            }

            if (transaction.transactionType === 'Transferência') {
                if (transaction.accountId === selectedAccountId) return -amount;
                if (transaction.toAccountId === selectedAccountId) return amount;
                return 0;
            }

            if (transaction.accountId !== selectedAccountId) return 0;
            if (transaction.transactionType === 'Entrada') return amount;
            if (transaction.transactionType === 'Saída') return -amount;
            return 0;
        };

        const selectedAccounts = selectedAccountId === 'all' ? accounts : accounts.filter(account => account.id === selectedAccountId);
        let runningBalance = selectedAccounts.reduce((sum, account) => sum + Number(account.initialBalance || 0), 0);

        transactions
            .filter(transaction => transaction.date.split('T')[0] < startDate)
            .forEach(transaction => {
                runningBalance += transactionEffect(transaction);
            });

        const initialBalanceOfPeriod = runningBalance;
        const periodTxs = transactions
            .filter(transaction => {
                const day = transaction.date.split('T')[0];
                return day >= startDate && day <= endDate;
            })
            .filter(transaction => selectedAccountId === 'all' || transaction.accountId === selectedAccountId || transaction.toAccountId === selectedAccountId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const rows: any[] = [];
        let currentBalance = initialBalanceOfPeriod;
        let totalIncome = 0;
        let totalExpense = 0;

        periodTxs.forEach(transaction => {
            const effect = transactionEffect(transaction);
            if (effect > 0) totalIncome += effect;
            else if (effect < 0) totalExpense += Math.abs(effect);

            currentBalance += effect;
            rows.push({ ...transaction, currentBalance, effect });
        });

        const aggregated: any[] = [];
        if (isAggregatedView) {
            const groups: Record<string, { date: string; income: number; expense: number; balance: number }> = {};
            periodTxs.forEach(transaction => {
                const day = transaction.date.split('T')[0];
                if (!groups[day]) groups[day] = { date: day, income: 0, expense: 0, balance: 0 };

                const effect = transactionEffect(transaction);
                if (effect > 0) groups[day].income += effect;
                else if (effect < 0) groups[day].expense += Math.abs(effect);
            });

            let aggregatedBalance = initialBalanceOfPeriod;
            Object.keys(groups).sort().forEach(day => {
                const group = groups[day];
                aggregatedBalance += group.income - group.expense;
                aggregated.push({ ...group, balance: aggregatedBalance });
            });
        }

        return {
            initial: initialBalanceOfPeriod,
            final: currentBalance,
            income: totalIncome,
            expense: totalExpense,
            variation: currentBalance - initialBalanceOfPeriod,
            rows,
            aggregated
        };
    }, [transactions, accounts, selectedAccountId, isAggregatedView, startDate, endDate]);
    const variableInvestmentsValue = React.useMemo(() => {
        return investments.reduce((sum, inv) => {
            const price = marketData[inv.ticker]?.price ?? inv.purchasePrice;
            return sum + Number(price || 0) * Number(inv.quantity || 0);
        }, 0);
    }, [investments, marketData]);
    const fixedInvestmentsValue = React.useMemo(() => fixedIncomeInvestments.reduce((sum, inv) => sum + Number(inv.amountInvested || 0), 0), [fixedIncomeInvestments]);
    const totalAssets = React.useMemo(() => totalBalance + variableInvestmentsValue + fixedInvestmentsValue + receivablesOpenTotal, [totalBalance, variableInvestmentsValue, fixedInvestmentsValue, receivablesOpenTotal]);
    const totalLiabilities = React.useMemo(() => payablesOpenTotal, [payablesOpenTotal]);
    const netWorth = React.useMemo(() => totalAssets - totalLiabilities, [totalAssets, totalLiabilities]);

    // Extended Balance Sheet Metrics & Aging
    const balanceMetrics = React.useMemo(() => {
        const currentAssets = totalBalance + receivablesOpenTotal;
        const nonCurrentAssets = variableInvestmentsValue + fixedInvestmentsValue;
        const currentLiabilities = payablesOpenTotal;
        const nonCurrentLiabilities = 0; 

        // Liquidity Ratios
        const currentLiquidity = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : (currentAssets > 0 ? 10 : 0);
        const immediateLiquidity = currentLiabilities > 0 ? (totalBalance / currentLiabilities) : (totalBalance > 0 ? 10 : 0);
        const dryLiquidity = currentLiabilities > 0 ? ((totalBalance + (receivablesOpenTotal * 0.8)) / currentLiabilities) : 10;
        
        const debtToEquity = netWorth !== 0 ? (totalLiabilities / netWorth) : 0;

        // Aging Logic
        const getAging = (rows: any[]) => {
            const now = new Date();
            const buckets = { b30: 0, b60: 0, b90: 0, bPlus: 0 };
            rows.forEach(r => {
                if (String(r.status || '').toLowerCase() !== 'open') return;
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
            receivablesAging: getAging(receivables),
            payablesAging: getAging(payables)
        };
    }, [totalBalance, receivablesOpenTotal, variableInvestmentsValue, fixedInvestmentsValue, payablesOpenTotal, totalLiabilities, netWorth, receivables, payables]);

    const currentYear = new Date().getFullYear();
    const meiFiscal = React.useMemo(
        () => calculateMeiFiscal({ transactions, categories, year: currentYear, openingDate: meiOpeningDate }),
        [transactions, categories, currentYear, meiOpeningDate],
    );

    const reportProfile = React.useMemo(() => (userPreferences?.reportProfile || {}), [userPreferences?.reportProfile]);
    const headerCompany = React.useMemo(() => {
        const v = String(reportProfile.companyName || '').trim();
        if (v) return v;
        const org = String(organizationInfo?.name || '').trim();
        return org || '';
    }, [reportProfile.companyName, organizationInfo?.name]);
    const headerTrade = React.useMemo(() => String(reportProfile.tradeName || '').trim(), [reportProfile.tradeName]);
    const headerCnpj = React.useMemo(() => String(reportProfile.cnpj || '').trim(), [reportProfile.cnpj]);
    const headerEmail = React.useMemo(() => String(reportProfile.email || '').trim(), [reportProfile.email]);
    const headerPhone = React.useMemo(() => String(reportProfile.phone || '').trim(), [reportProfile.phone]);
    const headerAddress = React.useMemo(() => {
        const l1 = String(reportProfile.addressLine1 || '').trim();
        const l2 = String(reportProfile.addressLine2 || '').trim();
        const city = String(reportProfile.city || '').trim();
        const st = String(reportProfile.state || '').trim();
        const zip = String(reportProfile.zip || '').trim();
        const cityLine = [city, st].filter(Boolean).join(' - ');
        const parts = [l1, l2, cityLine, zip ? `CEP: ${zip}` : ''].filter(Boolean);
        return parts;
    }, [reportProfile.addressLine1, reportProfile.addressLine2, reportProfile.city, reportProfile.state, reportProfile.zip]);

    const reportTitle = React.useMemo(() => {
        if (tab === 'ap') return 'Contas a Pagar';
        if (tab === 'ar') return 'Contas a Receber';
        if (tab === 'dre') return 'DRE (Regime de Caixa)';
        if (tab === 'balanco') return 'Balanço Patrimonial';
        if (tab === 'fluxo') return 'Fluxo de Caixa Consolidado';
        if (tab === 'categorias') return 'Análise por Categoria';
        return 'Demonstrativo MEI';
    }, [tab]);

    const generatedAt = React.useMemo(() => {
        try { return new Date().toLocaleString('pt-BR'); } catch { return ''; }
    }, []);

    // ─── DRE: Dedicated Print Document (not a screen print) ───────────────────
    const handlePrintDRE = React.useCallback(() => {
        const company = headerCompany || 'Gestor Financeiro';
        const period  = monthLabelPtBr(month);
        const now     = new Date().toLocaleString('pt-BR');
        const marginPct = (v: number) => monthIncome > 0 ? ((v / monthIncome) * 100).toFixed(1) + '%' : '—';
        const fc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const dreRows = [
            { label: '(+) Receita Bruta de Vendas / Serviços', value: monthIncome,                    indent: 0, bold: true,  total: false },
            { label: '(-) Custo dos Produtos / Serviços Vendidos (CPV)',  value: -dreCalculations.cogs,       indent: 1, bold: false, total: false },
            { label: '(=) RESULTADO BRUTO',                               value: dreCalculations.grossProfit, indent: 0, bold: true,  total: true  },
            { label: '(-) Despesas Operacionais (OPEX)',                   value: -dreCalculations.opex,       indent: 1, bold: false, total: false },
            { label: '(=) EBITDA — Resultado Operacional',                 value: dreCalculations.ebitda,      indent: 0, bold: true,  total: true  },
            { label: '(-) Impostos e Encargos Financeiros',                value: -dreCalculations.taxes,      indent: 1, bold: false, total: false },
            { label: '(=) RESULTADO LÍQUIDO DO PERÍODO',                   value: dreCalculations.netResult,   indent: 0, bold: true,  total: true, highlight: true },
        ];

        const kpis = [
            { label: 'Receita Bruta',    value: fc(monthIncome),                note: 'Total entradas' },
            { label: 'Resultado Bruto',  value: fc(dreCalculations.grossProfit), note: `Margem ${marginPct(dreCalculations.grossProfit)}` },
            { label: 'EBITDA',           value: fc(dreCalculations.ebitda),      note: `Margem ${marginPct(dreCalculations.ebitda)}` },
            { label: 'Resultado Líquido',value: fc(dreCalculations.netResult),   note: `Margem ${marginPct(dreCalculations.netResult)}` },
        ];

        const kpiHtml = kpis.map(k => `
            <div class="kpi-box">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-note">${k.note}</div>
            </div>`).join('');

        const dreTableRows = dreRows.map(r => `
            <tr class="${r.highlight ? 'row-highlight' : r.total ? 'row-total' : 'row-normal'}">
                <td class="col-label" style="padding-left:${r.indent > 0 ? '2.5rem' : '0.75rem'}">${r.label}</td>
                <td class="col-value ${r.value >= 0 ? 'positive' : 'negative'}">${fc(r.value)}</td>
                <td class="col-margin">${r.label.startsWith('(=)') && monthIncome > 0 ? marginPct(r.value) : ''}</td>
            </tr>`).join('');

        const incomeRows = incomeByCategory.map(([name, val]) => `
            <tr class="row-normal">
                <td class="col-label" style="padding-left:0.75rem">${name}</td>
                <td class="col-value positive">${fc(val)}</td>
                <td class="col-margin">${marginPct(val)}</td>
            </tr>`).join('');

        const expenseRows = expenseByCategory.map(([name, val]) => `
            <tr class="row-normal">
                <td class="col-label" style="padding-left:0.75rem">${name}</td>
                <td class="col-value negative">${fc(val)}</td>
                <td class="col-margin">${monthIncome > 0 ? ((val / monthIncome) * 100).toFixed(1) + '%' : '—'}</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>DRE — ${company} — ${period}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 1.5cm 2cm 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── HEADER ── */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10pt; border-bottom: 2pt solid #111; margin-bottom: 14pt; }
  .doc-header-left .company { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #000; }
  .doc-header-left .report-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #555; margin-top: 3pt; }
  .doc-header-left .sub { font-size: 7.5pt; color: #777; margin-top: 2pt; }
  .doc-header-right { text-align: right; }
  .doc-header-right .period { font-size: 11pt; font-weight: 900; text-transform: capitalize; color: #000; }
  .doc-header-right .meta { font-size: 7.5pt; color: #777; margin-top: 4pt; }

  /* ── KPI BOXES ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 18pt; }
  .kpi-box { border: 1pt solid #bbb; padding: 8pt 10pt; }
  .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 4pt; }
  .kpi-value { font-size: 11.5pt; font-weight: 900; color: #000; letter-spacing: -0.02em; }
  .kpi-note  { font-size: 7pt; color: #888; margin-top: 3pt; }

  /* ── SECTION TITLE ── */
  .section-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #555; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; margin-bottom: 0; margin-top: 16pt; }

  /* ── TABLE ── */
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 0; }
  th { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #555; padding: 5pt 8pt; border-bottom: 1pt solid #bbb; text-align: left; background: #f7f7f7; }
  th.right { text-align: right; }
  td { padding: 5pt 8pt; border-bottom: 0.5pt solid #e8e8e8; vertical-align: middle; }
  .col-label { width: 55%; }
  .col-value { width: 25%; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .col-margin { width: 20%; text-align: right; color: #666; font-size: 8.5pt; }
  .positive { color: #000; }
  .negative { color: #444; }

  /* Row variants */
  .row-normal td { background: #fff; }
  .row-total td  { background: #f0f0f0; font-weight: 800; border-top: 1pt solid #999; border-bottom: 1pt solid #999; }
  .row-highlight td { background: #1a1a1a; color: #fff !important; font-weight: 900; border-top: 1.5pt solid #000; }
  .row-highlight .positive, .row-highlight .negative, .row-highlight .col-margin { color: #fff !important; }

  /* ── TWO-COLUMN TABLES ── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-top: 0; }
  .two-col table { width: 100%; }

  /* ── FOOTER ── */
  .doc-footer { margin-top: 18pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

  @media print {
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .section-title { page-break-after: avoid; }
    .two-col { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="doc-header">
  <div class="doc-header-left">
    <div class="company">${company}</div>
    <div class="report-title">DRE — Demonstração do Resultado do Exercício (Regime de Caixa)</div>
    <div class="sub">CNPJ: ${headerCnpj || '—'} &nbsp;|&nbsp; ${headerAddress.join(', ') || 'Endereço não configurado'}</div>
  </div>
  <div class="doc-header-right">
    <div class="period">${period}</div>
    <div class="meta">Emitido em: ${now}</div>
    <div class="meta">${formatDate(startDate)} — ${formatDate(endDate)}</div>
  </div>
</div>

<!-- KPI BOXES -->
<div class="kpi-grid">${kpiHtml}</div>

<!-- DRE STRUCTURE -->
<div class="section-title">Demonstrativo Estruturado — DRE</div>
<table>
  <thead><tr>
    <th class="col-label">Linha</th>
    <th class="right" style="width:25%">Valor (R$)</th>
    <th class="right" style="width:20%">AV (%)</th>
  </tr></thead>
  <tbody>${dreTableRows}</tbody>
</table>

<!-- INCOME + EXPENSE BREAKDOWN -->
<div class="two-col" style="margin-top:16pt">
  <div>
    <div class="section-title">Abertura de Receitas</div>
    <table>
      <thead><tr><th class="col-label">Categoria</th><th class="right" style="width:35%">Valor</th><th class="right" style="width:20%">AV%</th></tr></thead>
      <tbody>${incomeRows}<tr class="row-total"><td class="col-label" style="padding-left:0.75rem">Total Receitas</td><td class="col-value positive">${fc(monthIncome)}</td><td class="col-margin">100%</td></tr></tbody>
    </table>
  </div>
  <div>
    <div class="section-title">Análise Vertical de Despesas</div>
    <table>
      <thead><tr><th class="col-label">Categoria</th><th class="right" style="width:35%">Valor</th><th class="right" style="width:20%">AV%</th></tr></thead>
      <tbody>${expenseRows}<tr class="row-total"><td class="col-label" style="padding-left:0.75rem">Total Despesas</td><td class="col-value negative">${fc(dreCalculations.cogs + dreCalculations.opex + dreCalculations.taxes)}</td><td class="col-margin">${marginPct(dreCalculations.cogs + dreCalculations.opex + dreCalculations.taxes)}</td></tr></tbody>
    </table>
  </div>
</div>

<!-- FOOTER -->
<div class="doc-footer">
  <span>${company} — Documento para fins de consulta interna</span>
  <span>Gestor Financeiro Enterprise · Pág. 1</span>
</div>

<script>window.onload=function(){var o=document.createElement('div');o.id='po';o.style.cssText='position:fixed;inset:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:Segoe UI,Arial,sans-serif;';o.innerHTML='<div style="color:#fff;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 14px;display:block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><div style="font-size:13pt;font-weight:900;letter-spacing:.05em;margin-bottom:6pt">Preparando Impressão</div><div style="font-size:8.5pt;color:#71717a">O diálogo de impressão abrirá em instantes...</div></div>';document.body.appendChild(o);var s=document.createElement('style');s.textContent='@media print{#po{display:none!important}}';document.head.appendChild(s);var done=false;function closeWin(){if(!done){done=true;window.close();}}window.addEventListener('afterprint',closeWin);var mql=window.matchMedia('print');if(mql.addEventListener){mql.addEventListener('change',function(e){if(!e.matches)setTimeout(closeWin,100);});}else{mql.addListener(function(e){if(!e.matches)setTimeout(closeWin,100);});}window.print();};<\/script>
</body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [month, monthIncome, dreCalculations, incomeByCategory, expenseByCategory, headerCompany, headerCnpj, headerAddress, startDate, endDate]);


    // ─── BALANÇO PATRIMONIAL: Dedicated Print Document ─────────────────────────
    const handlePrintBalanco = React.useCallback(() => {
        const company = headerCompany || 'Gestor Financeiro';
        const now     = new Date().toLocaleString('pt-BR');
        const fc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const liq = (v: number) => v >= 1.5 ? 'Excelente' : v >= 1 ? 'Estável' : 'Atenção';

        const kpis = [
            { label: 'Total Ativos',        value: fc(totalAssets),                              note: 'Patrimônio Bruto' },
            { label: 'Total Passivos',       value: fc(totalLiabilities),                         note: 'Obrigações Totais' },
            { label: 'Liquidez Corrente',    value: balanceMetrics.currentLiquidity.toFixed(2),   note: liq(balanceMetrics.currentLiquidity) },
            { label: 'Patrimônio Líquido',   value: fc(netWorth),                                 note: 'Riqueza Real' },
        ];

        const kpiHtml = kpis.map(k => `
            <div class="kpi-box">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-note">${k.note}</div>
            </div>`).join('');

        const accountRowsHtml = accounts.map(acc => `
            <tr class="row-sub2">
                <td class="col-label" style="padding-left:3.5rem">${acc.name}</td>
                <td class="col-value">${fc(accountBalances[acc.id] || 0)}</td>
            </tr>`).join('');

        const assetsHtml = `
            <tr class="row-group"><td class="col-label">1. Ativo Circulante</td><td class="col-value">${fc(balanceMetrics.currentAssets)}</td></tr>
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Disponibilidades (Bancos)</td><td class="col-value">${fc(totalBalance)}</td></tr>
            ${accountRowsHtml}
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Direitos a Receber (A/R)</td><td class="col-value">${fc(receivablesOpenTotal)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">Venc. até 30 dias</td><td class="col-value">${fc(balanceMetrics.receivablesAging.b30)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">31 a 60 dias</td><td class="col-value">${fc(balanceMetrics.receivablesAging.b60)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">Acima de 61 dias</td><td class="col-value">${fc(balanceMetrics.receivablesAging.b90 + balanceMetrics.receivablesAging.bPlus)}</td></tr>
            <tr class="row-divider"><td colspan="2"></td></tr>
            <tr class="row-group"><td class="col-label">2. Ativo Não Circulante</td><td class="col-value">${fc(balanceMetrics.nonCurrentAssets)}</td></tr>
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Investimentos Variáveis (Ações/ETFs)</td><td class="col-value">${fc(variableInvestmentsValue)}</td></tr>
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Renda Fixa / Tesouro</td><td class="col-value">${fc(fixedInvestmentsValue)}</td></tr>`;

        const liabHtml = `
            <tr class="row-group"><td class="col-label">1. Passivo Circulante</td><td class="col-value">${fc(balanceMetrics.currentLiabilities)}</td></tr>
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Obrigações de Curto Prazo (A/P)</td><td class="col-value">${fc(payablesOpenTotal)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">Venc. até 30 dias</td><td class="col-value">${fc(balanceMetrics.payablesAging.b30)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">31 a 60 dias</td><td class="col-value">${fc(balanceMetrics.payablesAging.b60)}</td></tr>
            <tr class="row-sub2"><td class="col-label" style="padding-left:3.5rem">Acima de 61 dias</td><td class="col-value">${fc(balanceMetrics.payablesAging.b90 + balanceMetrics.payablesAging.bPlus)}</td></tr>
            <tr class="row-divider"><td colspan="2"></td></tr>
            <tr class="row-group"><td class="col-label">2. Patrimônio Líquido</td><td class="col-value">${fc(netWorth)}</td></tr>
            <tr class="row-sub1"><td class="col-label" style="padding-left:2rem">Resultado Líquido Acumulado</td><td class="col-value">${fc(netWorth)}</td></tr>`;

        const workingCapital = balanceMetrics.currentAssets - balanceMetrics.currentLiabilities;

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Balanço Patrimonial — ${company}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 1.5cm 2cm 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── HEADER ── */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10pt; border-bottom: 2pt solid #111; margin-bottom: 14pt; }
  .doc-header-left .company { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #000; }
  .doc-header-left .report-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #555; margin-top: 3pt; }
  .doc-header-left .sub { font-size: 7.5pt; color: #777; margin-top: 2pt; }
  .doc-header-right { text-align: right; }
  .doc-header-right .label { font-size: 7.5pt; color: #777; }
  .doc-header-right .meta { font-size: 7.5pt; color: #777; margin-top: 4pt; }

  /* ── KPI BOXES ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 16pt; }
  .kpi-box { border: 1pt solid #bbb; padding: 8pt 10pt; }
  .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 4pt; }
  .kpi-value { font-size: 10.5pt; font-weight: 900; color: #000; letter-spacing: -0.02em; }
  .kpi-note  { font-size: 7pt; color: #888; margin-top: 3pt; }

  /* ── SECTION TITLE ── */
  .section-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #555; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; margin-bottom: 0; margin-top: 0; }

  /* ── BALANCE GRID ── */
  .balance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-bottom: 14pt; }
  .balance-col { border: 0.5pt solid #ccc; }
  .balance-col-header { background: #1a1a1a; color: #fff; padding: 6pt 8pt; font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; }

  /* ── TABLE ── */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  td { padding: 4pt 8pt; border-bottom: 0.5pt solid #efefef; vertical-align: middle; }
  .col-label { width: 65%; }
  .col-value { width: 35%; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tfoot-row td { background: #1a1a1a; color: #fff; font-weight: 900; font-size: 9pt; padding: 6pt 8pt; }
  .tfoot-row .col-value { text-align: right; }

  /* Row types */
  .row-group td { background: #f2f2f2; font-weight: 800; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; border-top: 1pt solid #bbb; }
  .row-sub1 td { background: #fff; font-style: italic; }
  .row-sub2 td { background: #fafafa; font-size: 8pt; color: #555; }
  .row-divider td { padding: 3pt; border: none; background: transparent; }

  /* ── RATIOS SECTION ── */
  .ratios-section { margin-top: 0; }
  .ratio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 0; }
  .ratio-box { border: 0.5pt solid #ccc; padding: 7pt 9pt; }
  .ratio-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #666; letter-spacing: 0.08em; margin-bottom: 3pt; }
  .ratio-value { font-size: 13pt; font-weight: 900; color: #000; }
  .ratio-note { font-size: 7pt; color: #888; margin-top: 2pt; }

  /* ── WORKING CAPITAL ── */
  .wc-bar { display: flex; justify-content: space-between; align-items: center; border: 1pt solid #bbb; padding: 8pt 12pt; margin-top: 8pt; }
  .wc-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: 0.1em; }
  .wc-value { font-size: 13pt; font-weight: 900; color: #000; }
  .wc-debt { text-align: right; font-size: 8pt; color: #555; }

  /* ── FOOTER ── */
  .doc-footer { margin-top: 14pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

  @media print {
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .balance-grid { page-break-inside: avoid; }
    .ratios-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="doc-header">
  <div class="doc-header-left">
    <div class="company">${company}</div>
    <div class="report-title">Balanço Patrimonial — Posição Atual</div>
    <div class="sub">CNPJ: ${headerCnpj || '—'} &nbsp;|&nbsp; ${headerAddress.join(', ') || 'Endereço não configurado'}</div>
  </div>
  <div class="doc-header-right">
    <div class="label">Data-base do Balanço</div>
    <div class="kpi-value" style="font-size:11pt; font-weight:900;">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <div class="meta">Emitido em: ${now}</div>
  </div>
</div>

<!-- KPI BOXES -->
<div class="kpi-grid">${kpiHtml}</div>

<!-- BALANCE SHEET (two columns) -->
<div class="balance-grid">
  <div class="balance-col">
    <div class="balance-col-header">Ativo — Bens e Direitos</div>
    <table>
      <tbody>${assetsHtml}</tbody>
      <tfoot><tr class="tfoot-row"><td class="col-label">TOTAL ATIVO</td><td class="col-value">${fc(totalAssets)}</td></tr></tfoot>
    </table>
  </div>
  <div class="balance-col">
    <div class="balance-col-header">Passivo + Patrimônio Líquido</div>
    <table>
      <tbody>${liabHtml}</tbody>
      <tfoot><tr class="tfoot-row"><td class="col-label">TOTAL PASSIVO + PL</td><td class="col-value">${fc(totalLiabilities + netWorth)}</td></tr></tfoot>
    </table>
  </div>
</div>

<!-- LIQUIDITY RATIOS -->
<div class="section-title" style="margin-top:14pt">Análise de Liquidez &amp; Solvência</div>
<div class="ratios-section">
  <div class="ratio-grid" style="margin-top:8pt">
    <div class="ratio-box">
      <div class="ratio-label">Liquidez Corrente</div>
      <div class="ratio-value">${balanceMetrics.currentLiquidity.toFixed(2)}</div>
      <div class="ratio-note">${liq(balanceMetrics.currentLiquidity)} — Ativo Circ. / Passivo Circ.</div>
    </div>
    <div class="ratio-box">
      <div class="ratio-label">Liquidez Imediata</div>
      <div class="ratio-value">${balanceMetrics.immediateLiquidity.toFixed(2)}</div>
      <div class="ratio-note">Dinheiro em caixa / Passivo Circ.</div>
    </div>
    <div class="ratio-box">
      <div class="ratio-label">Liquidez Seca</div>
      <div class="ratio-value">${balanceMetrics.dryLiquidity.toFixed(2)}</div>
      <div class="ratio-note">(Caixa + 80% A/R) / Passivo Circ.</div>
    </div>
  </div>
  <div class="wc-bar">
    <div>
      <div class="ratio-label">Capital de Giro Disponível</div>
      <div class="wc-value">${fc(workingCapital)}</div>
    </div>
    <div class="wc-debt">
      <div class="ratio-label">Endividamento sobre PL</div>
      <div style="font-size:13pt; font-weight:900">${(balanceMetrics.debtToEquity * 100).toFixed(1)}%</div>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div class="doc-footer">
  <span>${company} — Documento para fins de consulta interna</span>
  <span>Gestor Financeiro Enterprise · Pág. 1</span>
</div>

<script>window.onload=function(){var o=document.createElement('div');o.id='po';o.style.cssText='position:fixed;inset:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:Segoe UI,Arial,sans-serif;';o.innerHTML='<div style="color:#fff;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 14px;display:block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><div style="font-size:13pt;font-weight:900;letter-spacing:.05em;margin-bottom:6pt">Preparando Impressão</div><div style="font-size:8.5pt;color:#71717a">O diálogo de impressão abrirá em instantes...</div></div>';document.body.appendChild(o);var s=document.createElement('style');s.textContent='@media print{#po{display:none!important}}';document.head.appendChild(s);var done=false;function closeWin(){if(!done){done=true;window.close();}}window.addEventListener('afterprint',closeWin);var mql=window.matchMedia('print');if(mql.addEventListener){mql.addEventListener('change',function(e){if(!e.matches)setTimeout(closeWin,100);});}else{mql.addListener(function(e){if(!e.matches)setTimeout(closeWin,100);});}window.print();};<\/script>
</body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [headerCompany, headerCnpj, headerAddress, totalAssets, totalLiabilities, netWorth,
        balanceMetrics, totalBalance, accounts, accountBalances, receivablesOpenTotal,
        variableInvestmentsValue, fixedInvestmentsValue, payablesOpenTotal]);


    // ─── FLUXO DE CAIXA: Dedicated Print Document ──────────────────────────────
    const handlePrintFluxo = React.useCallback(() => {
        const company  = headerCompany || 'Gestor Financeiro';
        const now      = new Date().toLocaleString('pt-BR');
        const fc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const sign = (v: number) => v > 0 ? `+${fc(v)}` : fc(v);

        const accountName = selectedAccountId === 'all'
            ? 'Consolidado (Todas as Contas)'
            : (accounts.find(a => a.id === selectedAccountId)?.name || selectedAccountId);

        const kpis = [
            { label: 'Saldo Inicial',     value: fc(cashFlowData.initial),   note: 'Abertura do período' },
            { label: 'Total Entradas',    value: fc(cashFlowData.income),    note: 'Recebimentos' },
            { label: 'Total Saídas',      value: fc(cashFlowData.expense),   note: 'Pagamentos' },
            { label: 'Variação Líquida',  value: sign(cashFlowData.variation), note: cashFlowData.variation >= 0 ? 'Superávit' : 'Déficit' },
        ];

        const kpiHtml = kpis.map(k => `
            <div class="kpi-box">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-note">${k.note}</div>
            </div>`).join('');

        // Build transaction rows (detailed view)
        const detailRowsHtml = cashFlowData.rows.map((row, i) => {
            const isPositive = row.effect >= 0;
            const accName = accounts.find((a: any) => a.id === row.accountId)?.name || '';
            const toAccName = row.toAccountId ? (accounts.find((a: any) => a.id === row.toAccountId)?.name || '') : '';
            const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
            return `<tr class="${rowClass}">
                <td class="col-date">${new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="col-desc">${row.description || '—'}${row.transactionType === 'Transferência' ? ' <span class="badge-transfer">Transf.</span>' : ''}</td>
                <td class="col-cat">${row.category || '—'}<br/><span class="acc-name">${accName}${toAccName ? ` → ${toAccName}` : ''}</span></td>
                <td class="col-val ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${fc(row.effect)}</td>
                <td class="col-bal">${fc(row.currentBalance)}</td>
            </tr>`;
        }).join('');

        // Aggregated rows
        const aggRowsHtml = cashFlowData.aggregated.map((row, i) => {
            const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
            return `<tr class="${rowClass}">
                <td class="col-date">${new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td class="col-val positive">${row.income > 0 ? fc(row.income) : '—'}</td>
                <td class="col-val negative">${row.expense > 0 ? fc(row.expense) : '—'}</td>
                <td class="col-bal">${fc(row.balance)}</td>
            </tr>`;
        }).join('');

        const theadHtml = isAggregatedView
            ? `<tr><th>Data</th><th class="right">Entradas</th><th class="right">Saídas</th><th class="right">Saldo Acum.</th></tr>`
            : `<tr><th style="width:10%">Data</th><th style="width:30%">Descrição</th><th style="width:25%">Categoria / Conta</th><th class="right" style="width:17%">Valor</th><th class="right" style="width:18%">Saldo Acum.</th></tr>`;

        const tbodyHtml = isAggregatedView ? aggRowsHtml : detailRowsHtml;
        const colSpan = isAggregatedView ? 4 : 5;

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Fluxo de Caixa — ${company}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 1.5cm 2cm 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── HEADER ── */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10pt; border-bottom: 2pt solid #111; margin-bottom: 12pt; }
  .doc-header-left .company { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-header-left .report-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #555; margin-top: 3pt; }
  .doc-header-left .sub { font-size: 7.5pt; color: #777; margin-top: 2pt; }
  .doc-header-right { text-align: right; }
  .doc-header-right .period { font-size: 10pt; font-weight: 900; }
  .doc-header-right .meta { font-size: 7.5pt; color: #777; margin-top: 4pt; }

  /* ── KPI ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-bottom: 12pt; }
  .kpi-box { border: 1pt solid #bbb; padding: 7pt 9pt; }
  .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 3pt; }
  .kpi-value { font-size: 10.5pt; font-weight: 900; color: #000; }
  .kpi-note { font-size: 7pt; color: #888; margin-top: 2pt; }

  /* ── FILTER BAR ── */
  .filter-bar { display: flex; gap: 16pt; font-size: 7.5pt; color: #666; border: 0.5pt solid #ddd; padding: 5pt 8pt; margin-bottom: 10pt; background: #fafafa; }
  .filter-bar span { font-weight: 700; color: #333; }

  /* ── SECTION TITLE ── */
  .section-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #555; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; margin-bottom: 0; }

  /* ── TABLE ── */
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead tr { background: #1a1a1a; color: #fff; }
  th { padding: 5pt 6pt; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: left; }
  th.right { text-align: right; }
  td { padding: 4pt 6pt; border-bottom: 0.5pt solid #efefef; vertical-align: top; }
  .row-even td { background: #fff; }
  .row-odd td  { background: #f8f8f8; }
  .col-date { width: 10%; white-space: nowrap; color: #555; font-size: 8pt; }
  .col-desc { width: 30%; font-weight: 600; }
  .col-cat  { width: 25%; font-size: 8pt; color: #555; }
  .col-val  { width: 17%; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .col-bal  { width: 18%; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .positive { color: #000; }
  .negative { color: #555; }
  .acc-name { font-size: 7.5pt; color: #888; font-style: italic; }
  .badge-transfer { font-size: 6.5pt; font-weight: 800; text-transform: uppercase; background: #e8e8e8; color: #444; padding: 1pt 4pt; border-radius: 2pt; }

  /* ── SUMMARY BAR ── */
  .summary-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-top: 10pt; border-top: 1.5pt solid #111; padding-top: 8pt; }
  .summary-item { }
  .summary-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #666; letter-spacing: 0.1em; }
  .summary-value { font-size: 11pt; font-weight: 900; margin-top: 2pt; }

  /* ── FOOTER ── */
  .doc-footer { margin-top: 12pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

  @media print {
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .summary-bar { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="doc-header">
  <div class="doc-header-left">
    <div class="company">${company}</div>
    <div class="report-title">Fluxo de Caixa Consolidado${isAggregatedView ? ' — Visão Resumo Diário' : ' — Visão Detalhada'}</div>
    <div class="sub">CNPJ: ${headerCnpj || '—'} &nbsp;|&nbsp; ${headerAddress.join(', ') || 'Endereço não configurado'}</div>
  </div>
  <div class="doc-header-right">
    <div class="period">${formatDate(startDate)} — ${formatDate(endDate)}</div>
    <div class="meta">Emitido em: ${now}</div>
  </div>
</div>

<!-- KPI BOXES -->
<div class="kpi-grid">${kpiHtml}</div>

<!-- FILTERS -->
<div class="filter-bar">
  <div>Conta: <span>${accountName}</span></div>
  <div>Lançamentos: <span>${isAggregatedView ? cashFlowData.aggregated.length + ' dias' : cashFlowData.rows.length + ' movimentos'}</span></div>
</div>

<!-- TRANSACTIONS TABLE -->
<div class="section-title">Extrato de Movimentações</div>
<table>
  <thead>${theadHtml}</thead>
  <tbody>
    ${tbodyHtml || `<tr><td colspan="${colSpan}" style="text-align:center;padding:16pt;color:#888;">Nenhuma movimentação no período.</td></tr>`}
  </tbody>
</table>

<!-- SUMMARY -->
<div class="summary-bar">
  <div class="summary-item">
    <div class="summary-label">Saldo Inicial</div>
    <div class="summary-value">${fc(cashFlowData.initial)}</div>
  </div>
  <div class="summary-item">
    <div class="summary-label">Entradas − Saídas</div>
    <div class="summary-value">${fc(cashFlowData.income)} − ${fc(cashFlowData.expense)}</div>
  </div>
  <div class="summary-item" style="text-align:right">
    <div class="summary-label">Saldo Final do Período</div>
    <div class="summary-value">${fc(cashFlowData.initial + cashFlowData.variation)}</div>
  </div>
</div>

<!-- FOOTER -->
<div class="doc-footer">
  <span>${company} — Documento para fins de consulta interna</span>
  <span>Gestor Financeiro Enterprise · Pág. 1</span>
</div>

<script>window.onload=function(){var o=document.createElement('div');o.id='po';o.style.cssText='position:fixed;inset:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:Segoe UI,Arial,sans-serif;';o.innerHTML='<div style="color:#fff;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 14px;display:block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><div style="font-size:13pt;font-weight:900;letter-spacing:.05em;margin-bottom:6pt">Preparando Impressão</div><div style="font-size:8.5pt;color:#71717a">O diálogo de impressão abrirá em instantes...</div></div>';document.body.appendChild(o);var s=document.createElement('style');s.textContent='@media print{#po{display:none!important}}';document.head.appendChild(s);var done=false;function closeWin(){if(!done){done=true;window.close();}}window.addEventListener('afterprint',closeWin);var mql=window.matchMedia('print');if(mql.addEventListener){mql.addEventListener('change',function(e){if(!e.matches)setTimeout(closeWin,100);});}else{mql.addListener(function(e){if(!e.matches)setTimeout(closeWin,100);});}window.print();};<\/script>
</body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [headerCompany, headerCnpj, headerAddress, cashFlowData, accounts,
        selectedAccountId, isAggregatedView, startDate, endDate]);

    // ─── CONTAS A PAGAR / A RECEBER: Dedicated Print Documents ────────────────
    const buildObligationsDoc = React.useCallback((
        type: 'ap' | 'ar',
        rows: typeof payables,
        openTotal: number,
        overdueTotal: number,
        upcomingTotal: number
    ) => {
        const company = headerCompany || 'Gestor Financeiro';
        const now     = new Date().toLocaleString('pt-BR');
        const fc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const todayStr = new Date().toISOString().slice(0, 10);
        const isAP = type === 'ap';
        const title = isAP ? 'Contas a Pagar' : 'Contas a Receber';
        const paidKey = isAP ? 'paid_amount' : 'received_amount';

        const kpis = [
            { label: 'Total em Aberto', value: fc(openTotal),    note: 'Período atual' },
            { label: 'Vencidos',        value: fc(overdueTotal), note: 'Obrigações expiradas' },
            { label: 'A Vencer',        value: fc(upcomingTotal),note: 'Previsão de saída' },
        ];

        const kpiHtml = kpis.map(k => `
            <div class="kpi-box">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-note">${k.note}</div>
            </div>`).join('');

        const sorted = [...rows].sort((a, b) =>
            String(a.due_date || '').localeCompare(String(b.due_date || ''))
        );

        const tableRowsHtml = sorted.map((r, i) => {
            const paidAmt = Number((r as any)[paidKey] || 0);
            const isPaid = String(r.status || '').toLowerCase() === 'paid' || paidAmt >= Number(r.amount || 0);
            const dueStr = String(r.due_date || '').slice(0, 10);
            const isOv   = !isPaid && dueStr < todayStr;
            const status = isPaid ? 'Liquidado' : isOv ? 'Atrasado' : 'Pendente';
            const statusClass = isPaid ? 'status-paid' : isOv ? 'status-late' : 'status-open';
            const amtClass = isPaid ? 'col-val-struck' : '';
            const dueDate = dueStr ? new Date(dueStr + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
            const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
            return `<tr class="${rowClass}">
                <td class="col-title">${r.title || '—'}${r.is_recurring ? ' <span class="badge-rec">Fixo</span>' : ''}</td>
                <td class="col-due">${dueDate}</td>
                <td class="col-cat">${r.category || '—'}</td>
                <td><span class="${statusClass}">${status}</span></td>
                <td class="col-val ${amtClass}">${fc(Number(r.amount || 0))}</td>
            </tr>`;
        }).join('');

        const paidRows   = sorted.filter(r => String(r.status || '').toLowerCase() === 'paid' || Number((r as any)[paidKey] || 0) >= Number(r.amount || 0));
        const openRows   = sorted.filter(r => String(r.status || '').toLowerCase() !== 'paid' && Number((r as any)[paidKey] || 0) < Number(r.amount || 0));
        const totalPaid  = paidRows.reduce((s, r) => s + Number(r.amount || 0), 0);

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${title} — ${company}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 1.5cm 2cm 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10pt; border-bottom: 2pt solid #111; margin-bottom: 12pt; }
  .doc-header-left .company { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-header-left .report-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #555; margin-top: 3pt; }
  .doc-header-left .sub { font-size: 7.5pt; color: #777; margin-top: 2pt; }
  .doc-header-right { text-align: right; }
  .doc-header-right .period { font-size: 10pt; font-weight: 900; }
  .doc-header-right .meta { font-size: 7.5pt; color: #777; margin-top: 4pt; }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-bottom: 12pt; }
  .kpi-box { border: 1pt solid #bbb; padding: 8pt 10pt; }
  .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 3pt; }
  .kpi-value { font-size: 11pt; font-weight: 900; color: #000; }
  .kpi-note { font-size: 7pt; color: #888; margin-top: 2pt; }

  .section-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #555; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead tr { background: #1a1a1a; color: #fff; }
  th { padding: 5pt 6pt; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: left; }
  th.right { text-align: right; }
  td { padding: 4pt 6pt; border-bottom: 0.5pt solid #efefef; vertical-align: middle; }
  .row-even td { background: #fff; }
  .row-odd td  { background: #f8f8f8; }
  .col-title { width: 32%; font-weight: 600; }
  .col-due   { width: 12%; white-space: nowrap; color: #555; font-size: 8pt; }
  .col-cat   { width: 22%; font-size: 8pt; color: #666; }
  .col-val   { width: 18%; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
  .col-val-struck { text-decoration: line-through; color: #aaa; font-weight: 400; }

  .status-paid { font-size: 7pt; font-weight: 800; text-transform: uppercase; background: #e8e8e8; color: #444; padding: 2pt 5pt; border-radius: 2pt; white-space: nowrap; }
  .status-late { font-size: 7pt; font-weight: 800; text-transform: uppercase; background: #2a2a2a; color: #fff; padding: 2pt 5pt; border-radius: 2pt; white-space: nowrap; }
  .status-open { font-size: 7pt; font-weight: 800; text-transform: uppercase; background: #f0f0f0; color: #555; padding: 2pt 5pt; border-radius: 2pt; white-space: nowrap; }
  .badge-rec   { font-size: 6.5pt; font-weight: 800; text-transform: uppercase; background: #e0e0e0; color: #333; padding: 1pt 4pt; border-radius: 2pt; }

  .summary-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-top: 10pt; border-top: 1.5pt solid #111; padding-top: 8pt; }
  .summary-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; color: #666; letter-spacing: 0.1em; }
  .summary-value { font-size: 10.5pt; font-weight: 900; margin-top: 2pt; }

  .doc-footer { margin-top: 12pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

  @media print {
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .summary-bar { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="company">${company}</div>
    <div class="report-title">${title} — Relatório de Obrigações</div>
    <div class="sub">CNPJ: ${headerCnpj || '—'} &nbsp;|&nbsp; ${headerAddress.join(', ') || 'Endereço não configurado'}</div>
  </div>
  <div class="doc-header-right">
    <div class="period">${monthLabelPtBr(month)}</div>
    <div class="meta">Emitido em: ${now}</div>
    <div class="meta">${formatDate(startDate)} — ${formatDate(endDate)}</div>
  </div>
</div>

<div class="kpi-grid">${kpiHtml}</div>

<div class="section-title">Listagem Detalhada — ${title}</div>
<table>
  <thead><tr>
    <th style="width:32%">Descrição</th>
    <th style="width:12%">Vencimento</th>
    <th style="width:22%">Categoria</th>
    <th style="width:16%">Situação</th>
    <th class="right" style="width:18%">Valor</th>
  </tr></thead>
  <tbody>
    ${tableRowsHtml || `<tr><td colspan="5" style="text-align:center;padding:16pt;color:#888;">Nenhum lançamento no período.</td></tr>`}
  </tbody>
</table>

<div class="summary-bar">
  <div>
    <div class="summary-label">Total de Lançamentos</div>
    <div class="summary-value">${rows.length}</div>
  </div>
  <div>
    <div class="summary-label">Liquidados</div>
    <div class="summary-value">${paidRows.length} (${fc(totalPaid)})</div>
  </div>
  <div>
    <div class="summary-label">Em Aberto</div>
    <div class="summary-value">${openRows.length}</div>
  </div>
  <div style="text-align:right">
    <div class="summary-label">Total ${isAP ? 'a Pagar' : 'a Receber'}</div>
    <div class="summary-value">${fc(openTotal)}</div>
  </div>
</div>

<div class="doc-footer">
  <span>${company} — Documento para fins de consulta interna</span>
  <span>Gestor Financeiro Enterprise · Pág. 1</span>
</div>

<script>window.onload=function(){var o=document.createElement('div');o.id='po';o.style.cssText='position:fixed;inset:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:Segoe UI,Arial,sans-serif;';o.innerHTML='<div style="color:#fff;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 14px;display:block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><div style="font-size:13pt;font-weight:900;letter-spacing:.05em;margin-bottom:6pt">Preparando Impressão</div><div style="font-size:8.5pt;color:#71717a">O diálogo de impressão abrirá em instantes...</div></div>';document.body.appendChild(o);var s=document.createElement('style');s.textContent='@media print{#po{display:none!important}}';document.head.appendChild(s);var done=false;function closeWin(){if(!done){done=true;window.close();}}window.addEventListener('afterprint',closeWin);var mql=window.matchMedia('print');if(mql.addEventListener){mql.addEventListener('change',function(e){if(!e.matches)setTimeout(closeWin,100);});}else{mql.addListener(function(e){if(!e.matches)setTimeout(closeWin,100);});}window.print();};<\/script>
</body></html>`;
    }, [headerCompany, headerCnpj, headerAddress, month, startDate, endDate]);

    const handlePrintAP = React.useCallback(() => {
        const html = buildObligationsDoc('ap', payables, payablesOpenTotal, sumOpen(payablesOverdue), sumOpen(payablesUpcoming));
        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [buildObligationsDoc, payables, payablesOpenTotal, payablesOverdue, payablesUpcoming]);

    const handlePrintAR = React.useCallback(() => {
        const html = buildObligationsDoc('ar', receivables as any, receivablesOpenTotal, sumOpen(receivablesOverdue), sumOpen(receivablesUpcoming));
        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [buildObligationsDoc, receivables, receivablesOpenTotal, receivablesOverdue, receivablesUpcoming]);


    // ─── CATEGORIAS: Dedicated Print Document ──────────────────────────────────
    const handlePrintCategorias = React.useCallback(() => {
        const company = headerCompany || 'Gestor Financeiro';
        const now     = new Date().toLocaleString('pt-BR');
        const fc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pct = (v: number) => v.toFixed(1) + '%';

        const kpis = [
            { label: 'Categorias Ativas',  value: String(categoryData.length),   note: 'No período' },
            { label: 'Total de Receitas',  value: fc(monthIncome),                note: 'Entradas consolidadas' },
            { label: 'Total de Despesas',  value: fc(monthExpense),               note: 'Saídas consolidadas' },
        ];
        const kpiHtml = kpis.map(k => `
            <div class="kpi-box">
                <div class="kpi-label">${k.label}</div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-note">${k.note}</div>
            </div>`).join('');

        // Ranking table
        const rankingRows = categoryData.map((c, i) => `
            <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
                <td class="col-rank">${i + 1}</td>
                <td class="col-name">${c.name}</td>
                <td class="col-count">${c.count}</td>
                <td class="col-val positive">${c.income > 0 ? fc(c.income) : '—'}</td>
                <td class="col-val negative">${c.expense > 0 ? fc(c.expense) : '—'}</td>
                <td class="col-val ${c.net >= 0 ? 'positive' : 'negative'}">${fc(c.net)}</td>
                <td class="col-pct">${c.income > 0 ? pct(c.incomePct) : c.expense > 0 ? pct(c.expensePct) : '—'}</td>
            </tr>`).join('');

        // Detail blocks — filtered by user's selection
        const detailBlocks = !printCatWithDetails ? '' : categoryData.filter(c => printCatSelection.has(c.name)).map(c => {
            const txRows = c.txs.map((t, i) => `
                <tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">
                    <td class="col-date">${new Date(String(t.date).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td class="col-desc">${t.description || '—'}</td>
                    <td class="col-type">${t.transactionType}</td>
                    <td class="col-val ${t.transactionType === 'Entrada' ? 'positive' : 'negative'}">${t.transactionType === 'Entrada' ? '+' : '-'}${fc(Number(t.amount || 0))}</td>
                </tr>`).join('');
            return `
            <div class="cat-block">
                <div class="cat-block-header">
                    <span>${c.name}</span>
                    <span>${c.count} lançamentos</span>
                </div>
                <table>
                    <thead><tr>
                        <th style="width:13%">Data</th>
                        <th style="width:47%">Descrição</th>
                        <th style="width:15%">Tipo</th>
                        <th class="right" style="width:25%">Valor</th>
                    </tr></thead>
                    <tbody>${txRows}</tbody>
                    <tfoot><tr class="tfoot-row">
                        <td colspan="3" class="col-label">Subtotal — ${c.name}</td>
                        <td class="col-val right">${c.income > 0 && c.expense === 0 ? '+' + fc(c.income) : c.expense > 0 && c.income === 0 ? '-' + fc(c.expense) : fc(c.net)}</td>
                    </tr></tfoot>
                </table>
            </div>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Análise por Categoria — ${company}</title>
<style>
  @page { size: A4 portrait; margin: 1.8cm 1.5cm 2cm 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10pt; border-bottom: 2pt solid #111; margin-bottom: 12pt; }
  .doc-header-left .company { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-header-left .report-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #555; margin-top: 3pt; }
  .doc-header-left .sub { font-size: 7.5pt; color: #777; margin-top: 2pt; }
  .doc-header-right { text-align: right; }
  .doc-header-right .period { font-size: 10pt; font-weight: 900; }
  .doc-header-right .meta { font-size: 7.5pt; color: #777; margin-top: 4pt; }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; margin-bottom: 12pt; }
  .kpi-box { border: 1pt solid #bbb; padding: 8pt 10pt; }
  .kpi-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #666; margin-bottom: 3pt; }
  .kpi-value { font-size: 11pt; font-weight: 900; color: #000; }
  .kpi-note { font-size: 7pt; color: #888; margin-top: 2pt; }

  .section-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: #555; border-bottom: 1pt solid #ccc; padding-bottom: 4pt; margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead tr { background: #1a1a1a; color: #fff; }
  th { padding: 5pt 6pt; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: left; }
  th.right { text-align: right; }
  td { padding: 4pt 6pt; border-bottom: 0.5pt solid #efefef; vertical-align: middle; }
  .row-even td { background: #fff; }
  .row-odd td  { background: #f8f8f8; }
  .col-rank  { width: 5%; color: #999; font-size: 8pt; }
  .col-name  { width: 28%; font-weight: 700; }
  .col-count { width: 8%; text-align: center; color: #666; }
  .col-val   { width: 15%; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .col-pct   { width: 10%; text-align: right; color: #666; font-size: 8pt; }
  .col-date  { width: 13%; white-space: nowrap; color: #555; font-size: 8pt; }
  .col-desc  { width: 47%; }
  .col-type  { width: 15%; font-size: 8pt; color: #666; }
  .col-label { font-weight: 700; }
  .right { text-align: right; }
  .positive { color: #000; }
  .negative { color: #444; }
  .tfoot-row td { background: #f0f0f0; font-weight: 800; border-top: 1pt solid #aaa; font-size: 8.5pt; }

  .cat-block { margin-top: 12pt; page-break-inside: avoid; }
  .cat-block-header { display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; color: #fff; padding: 5pt 8pt; font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0; }

  .doc-footer { margin-top: 12pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

  @media print {
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .cat-block { page-break-inside: avoid; }
    .section-title { page-break-after: avoid; }
  }
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="company">${company}</div>
    <div class="report-title">Análise por Categoria — Breakdown Gerencial</div>
    <div class="sub">CNPJ: ${headerCnpj || '—'} &nbsp;|&nbsp; ${headerAddress.join(', ') || 'Endereço não configurado'}</div>
  </div>
  <div class="doc-header-right">
    <div class="period">${monthLabelPtBr(month)}</div>
    <div class="meta">Emitido em: ${now}</div>
    <div class="meta">${formatDate(startDate)} — ${formatDate(endDate)}</div>
  </div>
</div>

<div class="kpi-grid">${kpiHtml}</div>

<div class="section-title">Ranking de Categorias</div>
<table>
  <thead><tr>
    <th style="width:5%">#</th>
    <th style="width:28%">Categoria</th>
    <th style="width:8%; text-align:center">Qtd.</th>
    <th class="right" style="width:15%">Entradas</th>
    <th class="right" style="width:15%">Saídas</th>
    <th class="right" style="width:15%">Líquido</th>
    <th class="right" style="width:10%">AV%</th>
  </tr></thead>
  <tbody>${rankingRows}</tbody>
</table>

<div class="section-title" style="margin-top:16pt">Detalhe por Categoria${printCatWithDetails && printCatSelection.size < categoryData.length ? ` (${printCatSelection.size} de ${categoryData.length} selecionadas)` : ''}</div>
${printCatWithDetails ? detailBlocks || '<p style="color:#aaa;font-size:8pt;margin-top:8pt">Nenhuma categoria selecionada para detalhe.</p>' : '<p style="color:#aaa;font-size:8pt;margin-top:8pt;font-style:italic">Detalhe por categoria não incluído nesta impressão.</p>'}

<div class="doc-footer">
  <span>${company} — Documento para fins de consulta interna</span>
  <span>Gestor Financeiro Enterprise · Pág. 1</span>
</div>

<script>window.onload=function(){var o=document.createElement('div');o.id='po';o.style.cssText='position:fixed;inset:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-family:Segoe UI,Arial,sans-serif;';o.innerHTML='<div style="color:#fff;text-align:center"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 14px;display:block"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><div style="font-size:13pt;font-weight:900;letter-spacing:.05em;margin-bottom:6pt">Preparando Impressão</div><div style="font-size:8.5pt;color:#71717a">O diálogo de impressão abrirá em instantes...</div></div>';document.body.appendChild(o);var s=document.createElement('style');s.textContent='@media print{#po{display:none!important}}';document.head.appendChild(s);var done=false;function closeWin(){if(!done){done=true;window.close();}}window.addEventListener('afterprint',closeWin);var mql=window.matchMedia('print');if(mql.addEventListener){mql.addEventListener('change',function(e){if(!e.matches)setTimeout(closeWin,100);});}else{mql.addListener(function(e){if(!e.matches)setTimeout(closeWin,100);});}window.print();};<\/script>
</body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (w) { w.document.write(html); w.document.close(); }
    }, [headerCompany, headerCnpj, headerAddress, month, startDate, endDate,
        categoryData, monthIncome, monthExpense, printCatWithDetails, printCatSelection]);

    const renderList = (rows: Array<{ id: string; title: string; due_date: string; amount: number; category?: string | null; status?: string; is_recurring?: boolean; isOverdue?: boolean; paid_amount?: number | null; received_amount?: number | null }>, emptyText: string) => {
        if (!rows.length) return <EmptyState title="Nenhuma Movimentação" description={emptyText} variant="no_results" icon={<ListBulletIcon />} />;
        return (
            <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm overflow-hidden">
                <table className="w-full text-sm divide-y divide-slate-100 dark:divide-slate-800/60">
                    <thead className="bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Item / Vencimento</th>
                            <th className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Status</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Categoria</th>
                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {rows.map(r => {
                            const isPaid = String(r.status || '').toLowerCase() === 'paid' || 
                                           (Number(r.paid_amount || r.received_amount || 0) >= Number(r.amount || 0));
                            const overdue = !isPaid && r.isOverdue;
                            const isRecurring = !!r.is_recurring;
                            
                            return (
                                <tr key={r.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-all">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-slate-900 dark:text-slate-100 font-bold group-hover:text-indigo-600 transition-colors">{r.title}</span>
                                                {isRecurring && (
                                                    <span title="Lançamento Recurrente (Fixo)" className="text-indigo-500">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider tabular-nums">Venc: {formatDate(r.due_date)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {isPaid ? (
                                            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-[10px] font-black uppercase tracking-tighter rounded-full border border-emerald-100 dark:border-emerald-800/50">Liquidado</span>
                                        ) : overdue ? (
                                            <span className="px-2.5 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-[10px] font-black uppercase tracking-tighter rounded-full border border-red-100 dark:border-red-800/50 shadow-[0_0_8px_rgba(239,68,68,0.1)]">Atrasado</span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 text-[10px] font-black uppercase tracking-tighter rounded-full border border-indigo-100 dark:border-indigo-800/50">Pendente</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-[0.1em] rounded group-hover:bg-indigo-100/50 transition-all">{String(r.category || '—')}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`text-sm font-black tabular-nums ${isPaid ? 'text-slate-400 line-through decoration-1' : 'text-slate-900 dark:text-white'}`}>
                                            {formatCurrency(Number(r.amount || 0))}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const isTabLocked = (planInfo?.tier === 'starter') && (tab === 'ap' || tab === 'ar' || tab === 'dre' || tab === 'balanco' || tab === 'mei');

    return (
        <div className="ReportsContainer space-y-8 animate-in fade-in duration-700 font-sans pb-10 px-1">
            {/* Global Print Styles - Forcing Light Theme & Ink Savings */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { margin: 1.5cm 1cm 2.3cm 1cm; size: auto; }
                    
                    .report-print-layout {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        border-spacing: 0 !important;
                    }
                    .report-print-layout td {
                        vertical-align: top !important;
                    }
                    .report-print-layout > tbody > tr > td {
                        border: none !important;
                        padding: 0 !important;
                    }
                    .report-print-layout thead {
                        display: table-header-group !important;
                    }
                    .report-print-layout tbody {
                        display: table-row-group !important;
                    }
                    .report-print-layout thead td {
                        padding: 0.25cm 0 0.4cm 0 !important;
                        background: #fff !important;
                        border: none !important;
                        border-bottom: 1px solid #e2e8f0 !important;
                    }
                    .report-print-layout tfoot {
                        display: table-footer-group !important;
                    }

                    .report-print-footer {
                        margin-top: 0.9cm !important;
                    }

                    .ReportsContainer .overflow-x-auto.rounded-xl {
                        border: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }

                    .ReportsContainer .overflow-hidden {
                        border: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }

                    /* Remove outer cards/molduras to evitar grade sobrando entre páginas */
                    .ReportsContainer .rounded-xl,
                    .ReportsContainer [class*="rounded-"],
                    .ReportsContainer .border,
                    .ReportsContainer [class*="border-"],
                    .ReportsContainer .shadow,
                    .ReportsContainer [class*="shadow-"] {
                        border: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                    }

                    .ReportsContainer {
                        display: block !important;
                        width: 100% !important;
                    }
                    
                    tbody tr { break-inside: avoid !important; page-break-inside: avoid !important; }
                    thead { display: table-header-group !important; }
                    
                    /* Typography Fixes */
                    .text-display-lg, .text-display-sm { color: #000 !important; font-weight: 800 !important; }
                    .text-slate-500, .text-gray-400 { color: #475569 !important; }

                    /* Force clear background for all cards in print */
                    .bg-white, .bg-slate-50, .dark\\:bg-slate-800, .dark\\:bg-slate-900 { 
                        background-color: #fff !important; 
                    }
                    
                    .ReportsContainer, .ReportsContainer div { 
                        overflow: visible !important; 
                        height: auto !important; 
                        max-height: none !important;
                        scrollbar-width: none !important;
                    }

                    .ReportsContainer { 
                        padding: 0.5cm !important; 
                        margin: 0 !important; 
                        max-width: 100% !important; 
                    }
                    
                    /* Grid and Layout - Keep side by side in print and align to content */
                    .grid-cols-4, .lg\\:grid-cols-4 { 
                        display: grid !important; 
                        grid-template-columns: repeat(4, 1fr) !important; 
                        gap: 0.5rem !important;
                    }
                    .grid-cols-3, .lg\\:grid-cols-3 { 
                        display: grid !important; 
                        grid-template-columns: repeat(3, 1fr) !important; 
                        gap: 0.75rem !important;
                    }
                    .grid-cols-2, .lg\\:grid-cols-2 { 
                        display: grid !important; 
                        grid-template-columns: repeat(2, 1fr) !important; 
                        gap: 1rem !important;
                    }
                    .grid { gap: 1rem !important; }
                    .grid > * { margin-bottom: 0 !important; width: auto !important; }

                    /* Compact KPI Cards specifically for print - Proportional fit */
                    .KpiCard, [class*="KpiCard"] {
                        padding-left: 0.2rem !important;
                        padding-right: 0.2rem !important;
                        min-height: 0 !important;
                        border: none !important;
                        background: transparent !important;
                    }
                    .KpiCard h3 { font-size: 7.5px !important; white-space: nowrap !important; letter-spacing: 0 !important; }
                    .KpiCard p { font-size: 12px !important; white-space: nowrap !important; }
                    .KpiCard .bg-slate-100\\/80 { padding: 0.25rem !important; margin-right: 0.3rem !important; border-radius: 4px !important; }
                    .KpiCard svg { width: 1rem !important; height: 1rem !important; }
                    .KpiCard p[class*="mt-1.5"] { font-size: 8px !important; } /* subtext */
                    
                    /* Spacing between sections */
                    .space-y-10 > * + * { margin-top: 2rem !important; }

                    /* Force charts to be responsive or visible */
                    .recharts-responsive-container { 
                        width: 100% !important; 
                        height: 300px !important; 
                        min-height: 300px !important;
                    }
                }
            `}} />

            <table className="report-print-layout w-full">
            <thead>
                <tr>
                    <td>
                        <div className="print-only">
                            <div className="flex justify-between items-center">
                                <div className="flex gap-5 items-center">
                                    <img src="/logo.png" alt="IT2A Logo" className="h-6 w-auto object-contain opacity-90" />
                                    <div className="border-l border-slate-300 pl-5">
                                        <h1 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em] leading-none mb-1">Gestor Financeiro</h1>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none">{reportTitle}</p>
                                        <div className="mt-2 text-[11px] font-black uppercase tracking-tight text-slate-800">
                                            {headerCompany || 'Gestor Financeiro Premium'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Referência</p>
                                    <p className="text-xs font-black text-slate-900 uppercase leading-none">{monthLabelPtBr(month)}</p>
                                    <p className="text-[9px] text-slate-500 font-bold mt-2 tabular-nums">{formatDate(startDate)} — {formatDate(endDate)}</p>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
            {/* Header: Camada de Título (Enterprise Style) */}
            <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 px-1">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-label-caps !text-slate-400">Relatórios & Inteligência</h1>
                        <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full uppercase tracking-widest border border-indigo-100 dark:border-indigo-800">
                            Relatórios e análise
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-relaxed">
                        Análise Consolidada de Performance e Saúde Patrimonial
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-xl flex items-center border border-slate-200 dark:border-slate-800 shadow-inner">
                        <label htmlFor="reports-month" className="sr-only">Mês do relatório</label>
                        <input
                            id="reports-month"
                            name="reports-month"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-transparent border-none px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:ring-0 outline-none cursor-pointer"
                        />
                    </div>
                    {!isTabLocked && (
                        <button
                            onClick={() => tab === 'ap' ? handlePrintAP() : tab === 'ar' ? handlePrintAR() : tab === 'dre' ? handlePrintDRE() : tab === 'balanco' ? handlePrintBalanco() : tab === 'fluxo' ? handlePrintFluxo() : tab === 'categorias' ? handlePrintCategorias() : window.print()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                        >
                            <BankIcon className="h-4 w-4" />
                            {tab === 'ap' ? 'Imprimir Pagar' : 
                             tab === 'ar' ? 'Imprimir Receber' : 
                             tab === 'dre' ? 'Imprimir DRE' : 
                             tab === 'balanco' ? 'Imprimir Balanço' : 
                             tab === 'fluxo' ? 'Imprimir Fluxo' : 
                             tab === 'categorias' ? 'Imprimir Categorias' : 'Imprimir MEI'}
                        </button>
                    )}
                </div>
            </div>

            {/* Workbench Toolbar: Navegação de Relatórios */}
            <div role="tablist" aria-label="Tipos de relatório" className="responsive-tab-strip no-print bg-slate-50/50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-1 mb-8">
                <button role="tab" aria-selected={tab === 'fluxo'} aria-controls="report-panel-fluxo" onClick={() => setTab('fluxo')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-colors ${tab === 'fluxo' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Fluxo</button>
                <button onClick={() => setTab('categorias')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'categorias' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Categorias</button>
                <button onClick={() => setTab('ap')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'ap' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    Pagar {planInfo?.tier === 'starter' && '🔒'}
                </button>
                <button onClick={() => setTab('ar')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'ar' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    Receber {planInfo?.tier === 'starter' && '🔒'}
                </button>
                <button onClick={() => setTab('dre')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'dre' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    DRE {planInfo?.tier === 'starter' && '🔒'}
                </button>
                <button onClick={() => setTab('balanco')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'balanco' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    Balanço {planInfo?.tier === 'starter' && '🔒'}
                </button>
                {isMei && (
                    <button onClick={() => setTab('mei')} className={`flex-1 min-w-[120px] px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'mei' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        MEI {planInfo?.tier === 'starter' && '🔒'}
                    </button>
                )}
            </div>

            {loading && (
                <div className="no-print">
                    <LoaderState message="Verificando carteira e pendências..." />
                </div>
            )}

            {tab === 'ap' && (
                planInfo?.tier === 'starter' ? (
                    <UpgradeScreen
                        title="Relatório de Contas a Pagar"
                        description="Visualize análises detalhadas de seus compromissos, custos fixos vs variáveis, projeções de saídas e histórico completo de pagamentos."
                        requiredTier="plus"
                    />
                ) : (
                    <div className="space-y-10 focus:outline-none">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <KpiCard 
                                title="Total Aberto (Mês)" 
                                value={formatCurrency(payablesOpenTotal)} 
                                icon={<AlertTriangleIcon className="h-6 w-6" />} 
                                variant="primary"
                                color="rose"
                                subtext="DDA e Boletos Pendentes"
                            />
                            <KpiCard 
                                title="Vencidos" 
                                value={formatCurrency(sumOpen(payablesOverdue))} 
                                icon={<AlertTriangleIcon className="h-6 w-6" />} 
                                color="rose"
                                subtext="Obrigações Expiradas"
                            />
                            <KpiCard 
                                title="A Vencer" 
                                value={formatCurrency(sumOpen(payablesUpcoming))} 
                                icon={<WalletIcon className="h-6 w-6" />} 
                                color="slate"
                                subtext="Previsão de Saída"
                            />
                        </div>

                        {/* Breakdown Widget */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Análise de Custos Fixos</h3>
                                    <div className="p-1 px-2 bg-indigo-50 dark:bg-indigo-900/30 rounded text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Fixo vs Variável</div>
                                </div>
                                <div className="space-y-4">
                                    {(() => {
                                        const fixed = payables.filter(p => !!p.is_recurring).reduce((s, p) => s + Number(p.amount || 0), 0);
                                        const variable = payables.filter(p => !p.is_recurring).reduce((s, p) => s + Number(p.amount || 0), 0);
                                        const total = fixed + variable;
                                        const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
                                        
                                        return (
                                            <>
                                                <div className="flex items-end justify-between">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Fixo (Burn Rate)</span>
                                                        <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(fixed)}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Proporção</span>
                                                        <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{fixedPct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                                    <div style={{ width: `${fixedPct}%` }} className="h-full bg-indigo-500" />
                                                    <div style={{ width: `${100 - fixedPct}%` }} className="h-full bg-slate-200 dark:bg-slate-600" />
                                                </div>
                                                <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                                    <span className="text-indigo-500">Fixo ({formatCurrency(fixed)})</span>
                                                    <span className="text-slate-400 text-right">Variável ({formatCurrency(variable)})</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div className="bg-indigo-600 p-6 rounded-xl border border-indigo-500 shadow-md flex flex-col justify-center text-white">
                                 <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-white/20 rounded-lg">
                                        <SparklesIcon className="h-5 w-5" />
                                    </div>
                                    <h4 className="text-xs font-black uppercase tracking-widest">InSIGHT Financeiro</h4>
                                 </div>
                                 <p className="text-xs font-medium text-indigo-100 leading-relaxed">
                                    {(() => {
                                        const fixed = payables.filter(p => !!p.is_recurring).reduce((s, p) => s + Number(p.amount || 0), 0);
                                        const total = payables.reduce((s, p) => s + Number(p.amount || 0), 0);
                                        const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
                                        
                                        if (isMei) {
                                            if (fixedPct > 60) return "Atenção! Mais de 60% dos seus compromissos são fixos (Burn Rate). Isso reduz sua margem de manobra em meses de baixo faturamento.";
                                            if (fixedPct < 30) return "Excelente! Seus custos fixos são baixos em relação ao total, garantindo alta flexibilidade financeira para o negócio.";
                                            return "Seu equilíbrio entre despesas fixas e variáveis está saudável. Continue monitorando o impacto nos meses seguintes.";
                                        } else {
                                            if (fixedPct > 50) return "Alerta: Seu custo de vida fixo está consumindo grande parte do seu orçamento. Tente reduzir assinaturas ou gastos recorrentes para aumentar sua reserva.";
                                            if (fixedPct < 25) return "Ótimo! Você tem poucos custos fixos, o que permite maior foco em investimentos ou lazer planejado.";
                                            return "Seu custo de vida está equilibrado. Mantenha os seus gastos variáveis sob controle para atingir suas metas mais rápido.";
                                        }
                                    })()}
                                 </p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                                <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.2em]">Listagem Detalhada de Obrigações</h3>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ordenado por Vencimento</span>
                            </div>
                            <div className="p-0">
                                {renderList([
                                    ...payablesOverdue.map(p => ({ ...p, isOverdue: true })), 
                                    ...payablesUpcoming.map(p => ({ ...p, isOverdue: false })),
                                    ...payables.filter(p => String(p.status || '').toLowerCase() === 'paid').map(p => ({ ...p, isOverdue: false }))
                                ].sort((a,b) => toYmd(a.due_date).localeCompare(toYmd(b.due_date))), 'Nenhuma conta encontrada no período.')}
                            </div>
                        </div>
                    </div>
                )
            )}

            {tab === 'ar' && (
                planInfo?.tier === 'starter' ? (
                    <UpgradeScreen
                        title="Relatório de Contas a Receber"
                        description="Acompanhe sua receita recorrente (MRR), inadimplência de clientes, histórico de recebimentos e previsibilidade de caixa."
                        requiredTier="plus"
                    />
                ) : (
                    <div className="space-y-10 focus:outline-none">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <KpiCard 
                                title="Total Aberto (Mês)" 
                                value={formatCurrency(receivablesOpenTotal)} 
                                icon={<TrophyIcon className="h-6 w-6 text-emerald-500" />} 
                                subtext="Créditos a Receber"
                                subtextColor="text-emerald-600"
                            />
                            <KpiCard 
                                title="Créditos Vencidos" 
                                value={formatCurrency(sumOpen(receivablesOverdue))} 
                                icon={<AlertTriangleIcon className="h-6 w-6 text-amber-500" />} 
                                subtext="Pendências de Clientes"
                                subtextColor="text-amber-600"
                            />
                            <KpiCard 
                                title="Previsão de Caixa" 
                                value={formatCurrency(sumOpen(receivablesUpcoming))} 
                                icon={<TrendingUpIcon className="h-6 w-6 text-slate-400" />} 
                                subtext="Entradas Futuras"
                                subtextColor="text-slate-400"
                            />
                        </div>

                        {/* Breakdown Widget for Receivables */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Receita Recorrente (MRR)</h3>
                                    <div className="p-1 px-2 bg-emerald-50 dark:bg-emerald-900/30 rounded text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Previsibilidade</div>
                                </div>
                                <div className="space-y-4">
                                    {(() => {
                                        const fixed = receivables.filter(r => !!r.is_recurring).reduce((s, r) => s + Number(r.amount || 0), 0);
                                        const variable = receivables.filter(r => !r.is_recurring).reduce((s, r) => s + Number(r.amount || 0), 0);
                                        const total = fixed + variable;
                                        const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
                                        
                                        return (
                                            <>
                                                <div className="flex items-end justify-between">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Base Recorrente</span>
                                                        <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(fixed)}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Impacto no Mix</span>
                                                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{fixedPct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                                    <div style={{ width: `${fixedPct}%` }} className="h-full bg-emerald-500" />
                                                    <div style={{ width: `${100 - fixedPct}%` }} className="h-full bg-slate-200 dark:bg-slate-600" />
                                                </div>
                                                <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                                    <span className="text-emerald-500">Recorrente ({formatCurrency(fixed)})</span>
                                                    <span className="text-slate-400 text-right">Avulso ({formatCurrency(variable)})</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div className="bg-emerald-600 p-6 rounded-xl border border-emerald-500 shadow-md flex flex-col justify-center text-white">
                                 <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-white/20 rounded-lg">
                                        <SparklesIcon className="h-5 w-5" />
                                    </div>
                                    <h4 className="text-xs font-black uppercase tracking-widest">Saúde da Carteira</h4>
                                 </div>
                                 <p className="text-xs font-medium text-emerald-100 leading-relaxed">
                                    {(() => {
                                        const fixed = receivables.filter(r => !!r.is_recurring).reduce((s, r) => s + Number(r.amount || 0), 0);
                                        const total = receivables.reduce((s, r) => s + Number(r.amount || 0), 0);
                                        const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
                                        
                                        if (isMei) {
                                            if (fixedPct > 70) return "Sua receita é altamente previsível! Isso permite planos de investimento a longo prazo com baixo risco.";
                                            if (fixedPct < 20) return "Aviso: Sua receita depende majoritariamente de vendas novas. Considere criar modelos de assinatura ou serviços recorrentes.";
                                            return "Sua base de receita misturando avulsos e recorrentes está equilibrada. Foque em aumentar a retenção para subir o MRR.";
                                        } else {
                                            if (fixedPct > 80) return "Sua renda é majoritariamente garantida (Salário/Renda Fixa). Planos de longo prazo são mais seguros para você.";
                                            if (fixedPct < 30) return "Atenção: Sua renda este mês depende de ganhos extras ou variables. Mantenha uma reserva de emergência sólida.";
                                            return "Você tem uma boa mescla entre renda fixa e entradas extras. Aproveite os ganhos variables para acelerar seus sonhos.";
                                        }
                                    })()}
                                 </p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
                                <h3 className="text-[10px] font-black text-emerald-900 uppercase tracking-[0.2em]">Listagem Detalhada de Recebíveis</h3>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ordenado por Vencimento</span>
                            </div>
                            <div className="p-0">
                                {renderList([
                                    ...receivablesOverdue.map(r => ({ ...r, isOverdue: true })), 
                                    ...receivablesUpcoming.map(r => ({ ...r, isOverdue: false })),
                                    ...receivables.filter(r => String(r.status || '').toLowerCase() === 'paid').map(r => ({ ...r, isOverdue: false }))
                                ].sort((a,b) => toYmd(a.due_date).localeCompare(toYmd(b.due_date))), 'Nenhum crédito encontrado no período.')}
                            </div>
                        </div>
                    </div>
                )
            )}

            {tab === 'dre' && (
                planInfo?.tier === 'starter' ? (
                    <UpgradeScreen
                        title="Demonstrativo do Resultado do Exercício (DRE)"
                        description="Analise sua Receita Bruta, EBITDA, Custos (COGS), Despesas Operacionais (OPEX) e Resultado Líquido com margens detalhadas."
                        requiredTier="plus"
                    />
                ) : (
                    <div className="space-y-10 focus:outline-none animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                                                <tr className="bg-slate-50/30 dark:bg-slate-900/20 font-black">
                                                    <td className="px-6 py-4 text-xs uppercase text-slate-500">Receita Bruta Total</td>
                                                    <td className="px-6 py-4 text-right text-emerald-600 border-t-2 border-slate-100 dark:border-slate-700">{formatCurrency(monthIncome)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Estrutura de DRE */}
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Demonstrativo Estruturado</h3>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-900/30">
                                            <tr className="bg-emerald-50/30 dark:bg-emerald-900/10 font-bold">
                                                <td className="px-6 py-4 text-emerald-700 dark:text-emerald-400">(=) Receita Bruta de Vendas/Serviços</td>
                                                <td className="px-6 py-4 text-right text-emerald-700">{formatCurrency(monthIncome)}</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-600 dark:text-slate-400 pl-10">(-) Custo dos Serviços/Produtos (COGS)</td>
                                                <td className="px-6 py-3 text-right text-red-500 font-medium">{formatCurrency(dreCalculations.cogs)}</td>
                                            </tr>
                                            <tr className="bg-slate-50/30 dark:bg-slate-700/20 font-black border-y border-slate-100 dark:border-slate-800">
                                                <td className="px-6 py-4 text-indigo-600">(=) RESULTADO BRUTO</td>
                                                <td className="px-6 py-4 text-right text-indigo-600">{formatCurrency(dreCalculations.grossProfit)}</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-600 dark:text-slate-400 pl-10">(-) Despesas Administrativas/Vendas (OPEX)</td>
                                                <td className="px-6 py-3 text-right text-red-500 font-medium">{formatCurrency(dreCalculations.opex)}</td>
                                            </tr>
                                            <tr className="bg-slate-50/30 dark:bg-slate-700/20 font-black border-y border-slate-100 dark:border-slate-800">
                                                <td className="px-6 py-4 text-indigo-600">(=) EBITDA (Operacional)</td>
                                                <td className="px-6 py-4 text-right text-indigo-600">{formatCurrency(dreCalculations.ebitda)}</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-600 dark:text-slate-400 pl-10">(-) Impostos e Encargos Financeiros</td>
                                                <td className="px-6 py-3 text-right text-red-500 font-medium">{formatCurrency(dreCalculations.taxes)}</td>
                                            </tr>
                                            <tr className="bg-indigo-600 font-black text-white">
                                                <td className="px-6 py-4">(=) RESULTADO LÍQUIDO DO PERÍODO</td>
                                                <td className="px-6 py-4 text-right">{formatCurrency(dreCalculations.netResult)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
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
                )
            )}

            {tab === 'balanco' && (
                planInfo?.tier === 'starter' ? (
                    <UpgradeScreen
                        title="Balanço Patrimonial"
                        description="Veja a abertura consolidada de seus Ativos (Bens e Direitos), Passivos (Obrigações), Liquidez (Imediata, Seca e Corrente), Endividamento e Patrimônio Líquido."
                        requiredTier="plus"
                    />
                ) : (
                    <div className="space-y-10 focus:outline-none animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                                value={formatCurrency(netWorth)} 
                                icon={<BankIcon className="h-6 w-6 text-indigo-500" />} 
                                subtext="Riqueza Real"
                            />
                        </div>

                        {/* Detalhamento de Ativos e Passivos */}
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
                                                <tr className="bg-slate-50/30 dark:bg-slate-700/10 border-t-2 border-slate-100 dark:border-slate-700">
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
                                                <tr className="bg-slate-50/30 dark:bg-slate-700/10 border-t-2 border-slate-100 dark:border-slate-700">
                                                    <td className="px-6 py-3 text-slate-500 uppercase text-[10px] font-bold">2. Patrimônio Líquido</td>
                                                    <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(netWorth)}</td>
                                                </tr>
                                                <tr>
                                                    <td className="px-10 py-3 text-slate-600 dark:text-slate-400 font-medium">Resultado Líquido Acumulado</td>
                                                    <td className="px-6 py-3 text-right font-bold text-indigo-600">{formatCurrency(netWorth)}</td>
                                                </tr>
                                            </tbody>
                                            <tfoot className="bg-slate-900 dark:bg-slate-900 text-white font-black">
                                                <tr>
                                                    <td className="px-6 py-4 text-xs uppercase tracking-widest text-slate-300">Total de Passivos + Patrimônio</td>
                                                    <td className="px-6 py-4 text-right text-lg">{formatCurrency(totalLiabilities + netWorth)}</td>
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
                                            <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-100 shadow-sm">
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
                )
            )}

            {tab === 'categorias' && (
                <div className="space-y-8 focus:outline-none animate-fade-in">
                    {/* KPI Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <KpiCard title="Categorias Ativas" value={String(categoryData.length)} icon={<TrendingUpIcon className="h-6 w-6 text-indigo-500" />} subtext="No mês selecionado" />
                        <KpiCard title="Total de Receitas" value={formatCurrency(monthIncome)} icon={<ArrowUpIcon className="h-6 w-6 text-emerald-500" />} subtext="Entradas por categoria" subtextColor="text-emerald-600" />
                        <KpiCard title="Total de Despesas" value={formatCurrency(monthExpense)} icon={<ArrowDownIcon className="h-6 w-6 text-red-500" />} subtext="Saídas por categoria" subtextColor="text-red-600" />
                    </div>

                    {/* Print Control Panel */}
                    <div className="no-print bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Configuração de Impressão</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Escolha o que incluir no relatório impresso</p>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={printCatWithDetails}
                                        onChange={e => setPrintCatWithDetails(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-indigo-600 transition-all after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white shadow-inner" />
                                </div>
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                                    {printCatWithDetails ? 'Detalhe incluído' : 'Só resumo'}
                                </span>
                            </label>
                        </div>

                        {printCatWithDetails && categoryData.length > 0 && (
                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        Categorias no detalhe — <span className="text-indigo-600">{printCatSelection.size} de {categoryData.length}</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPrintCatSelection(new Set(categoryData.map(c => c.name)))}
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider px-3 py-1 rounded-lg border border-indigo-200 hover:border-indigo-400 transition-all"
                                        >
                                            Marcar todas
                                        </button>
                                        <button
                                            onClick={() => setPrintCatSelection(new Set())}
                                            className="text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-wider px-3 py-1 rounded-lg border border-slate-200 hover:border-slate-400 transition-all"
                                        >
                                            Desmarcar
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {categoryData.map(c => {
                                        const checked = printCatSelection.has(c.name);
                                        return (
                                            <label
                                                key={c.name}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-[10px] font-bold uppercase tracking-wide select-none
                                                    ${checked
                                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={e => {
                                                        setPrintCatSelection(prev => {
                                                            const next = new Set(prev);
                                                            e.target.checked ? next.add(c.name) : next.delete(c.name);
                                                            return next;
                                                        });
                                                    }}
                                                    className="w-3 h-3 rounded text-indigo-600 border-slate-300 focus:ring-0"
                                                />
                                                {c.name}
                                                <span className="text-[9px] font-normal opacity-60">({c.count})</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Ranking Table */}
                    {categoryData.length === 0 ? (
                        <EmptyState title="Sem movimentações" description="Não há transações categorizadas no período selecionado." variant="no_results" icon={<ListBulletIcon />} />
                    ) : (
                        <>
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Ranking por Categoria</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Ordenado por volume total (entradas + saídas)</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider w-8">#</th>
                                                <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Categoria</th>
                                                <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Qtd.</th>
                                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Entradas</th>
                                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Saídas</th>
                                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Líquido</th>
                                                <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">AV%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                            {categoryData.map((c, i) => (
                                                <tr key={c.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                                    <td className="px-4 py-3 text-slate-400 font-bold text-xs">{i + 1}</td>
                                                    <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{c.name}</td>
                                                    <td className="px-4 py-3 text-center text-slate-500 font-medium">{c.count}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">{c.income > 0 ? formatCurrency(c.income) : '—'}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-red-500 tabular-nums">{c.expense > 0 ? formatCurrency(c.expense) : '—'}</td>
                                                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${c.net >= 0 ? 'text-slate-800 dark:text-white' : 'text-red-500'}`}>{formatCurrency(c.net)}</td>
                                                    <td className="px-4 py-3 text-right text-slate-500 font-medium text-xs tabular-nums">
                                                        {c.income > 0 ? c.incomePct.toFixed(1) + '%' : c.expense > 0 ? c.expensePct.toFixed(1) + '%' : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Per-category detail */}
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Detalhe por Categoria</h3>
                                {categoryData.map(c => (
                                    <div key={c.name} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        <div className="flex items-center justify-between px-6 py-3 bg-slate-900 dark:bg-slate-950">
                                            <span className="text-[11px] font-black text-white uppercase tracking-widest">{c.name}</span>
                                            <div className="flex items-center gap-4">
                                                {c.income > 0 && <span className="text-[10px] font-bold text-emerald-400">+{formatCurrency(c.income)}</span>}
                                                {c.expense > 0 && <span className="text-[10px] font-bold text-red-400">-{formatCurrency(c.expense)}</span>}
                                                <span className="text-[10px] font-black text-slate-300">{c.count} lançamentos</span>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Data</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Descrição</th>
                                                        <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipo</th>
                                                        <th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                    {c.txs.map((t, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/20 transition-colors">
                                                            <td className="px-6 py-3 text-slate-500 text-xs tabular-nums">{formatDate(String(t.date).slice(0,10))}</td>
                                                            <td className="px-6 py-3 text-slate-800 dark:text-slate-100 font-medium">{t.description || '—'}</td>
                                                            <td className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{t.transactionType}</td>
                                                            <td className={`px-6 py-3 text-right font-bold tabular-nums ${t.transactionType === 'Entrada' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {t.transactionType === 'Entrada' ? '+' : '-'}{formatCurrency(Number(t.amount || 0))}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                                        <td colSpan={3} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Subtotal — {c.name}</td>
                                                        <td className={`px-6 py-3 text-right font-black tabular-nums ${c.net >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>{formatCurrency(c.net)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === 'fluxo' && (
                <div className="space-y-10 focus:outline-none">
                    <div className="no-print bg-slate-50/50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                        <div className="col-span-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Conta Bancária</label>
                            <select 
                                value={selectedAccountId}
                                onChange={(e) => setSelectedAccountId(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-sm font-bold text-slate-700 shadow-sm focus:ring-0"
                            >
                                <option value="all">Todas as Contas</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Período de Análise</label>
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="flex-1 bg-transparent border-none p-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 focus:ring-0 outline-none"
                                />
                                <span className="text-[10px] text-slate-300 font-bold uppercase">A</span>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="flex-1 bg-transparent border-none p-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 focus:ring-0 outline-none"
                                />
                            </div>
                        </div>
                        <div className="col-span-1 pb-1">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input 
                                        type="checkbox"
                                        checked={isAggregatedView}
                                        onChange={(e) => setIsAggregatedView(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-indigo-600 transition-all after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white shadow-inner" />
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">Modo Resumo Diário</span>
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KpiCard 
                            title="Saldo Inicial" 
                            value={formatCurrency(cashFlowData.initial)} 
                            icon={<BankIcon className="h-6 w-6 text-slate-400" />} 
                            subtext="Abertura de Período"
                            subtextColor="text-slate-400"
                        />
                        <KpiCard 
                            title="Entradas" 
                            value={formatCurrency(cashFlowData.income)} 
                            icon={<ArrowUpIcon className="h-6 w-6 text-emerald-500" />} 
                            subtext="Recebimentos"
                            subtextColor="text-emerald-600"
                        />
                        <KpiCard 
                            title="Saídas" 
                            value={formatCurrency(cashFlowData.expense)} 
                            icon={<ArrowDownIcon className="h-6 w-6 text-red-500" />} 
                            subtext="Pagamentos"
                            subtextColor="text-red-600"
                        />
                        <KpiCard 
                            title="Variação Líquida" 
                            value={formatCurrency(cashFlowData.variation)} 
                            icon={<TrendingUpIcon className="h-6 w-6 text-indigo-500" />} 
                            subtext="Resultado de Fluxo"
                            subtextColor={cashFlowData.variation >= 0 ? "text-indigo-600" : "text-red-600"}
                        />
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Data</th>
                                        {isAggregatedView ? (
                                            <>
                                                <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Entradas</th>
                                                <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saídas</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Descrição</th>
                                                <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Categoria / Conta</th>
                                                <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                                            </>
                                        )}
                                        <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saldo Acumulado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {isAggregatedView ? (
                                        cashFlowData.aggregated.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium tabular-nums">{formatDate(row.date)}</td>
                                                <td className="px-6 py-4 text-right text-emerald-600 font-bold tabular-nums">{row.income > 0 ? formatCurrency(row.income) : '—'}</td>
                                                <td className="px-6 py-4 text-right text-red-600 font-bold tabular-nums">{row.expense > 0 ? formatCurrency(row.expense) : '—'}</td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(row.balance)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        cashFlowData.rows.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                                <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium tabular-nums">{formatDate(row.date)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="text-slate-800 dark:text-slate-100 font-semibold">{row.description || 'Sem descrição'}</div>
                                                    {row.transactionType === 'Transferência' && (
                                                        <div className="text-[9px] uppercase text-indigo-500 font-extrabold tracking-widest mt-0.5">Transferência Interna</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{row.category}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium italic mt-0.5">
                                                        {accounts.find(a => a.id === row.accountId)?.name}
                                                        {row.toAccountId && ` → ${accounts.find(a => a.id === row.toAccountId)?.name}`}
                                                    </div>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-bold tabular-nums ${row.effect >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {row.effect > 0 ? '+' : ''}{formatCurrency(row.effect)}
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(row.currentBalance)}</td>
                                            </tr>
                                        ))
                                    )}
                                    {!isAggregatedView && cashFlowData.rows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">Nenhum lançamento no período para os filtros selecionados.</td>
                                        </tr>
                                    )}
                                    {isAggregatedView && cashFlowData.aggregated.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-slate-400 font-medium">Nenhuma movimentação no período.</td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="print-only">
                                    <tr>
                                        <td colSpan={isAggregatedView ? 4 : 5} className="p-0">
                                            <div className="h-[10px]" />
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'mei' && isMei && (
                planInfo?.tier === 'starter' ? (
                    <UpgradeScreen
                        title="Demonstrativo MEI e Declaração DASN"
                        description="Planeje sua Declaração Anual do MEI (DASN-SIMEI), acompanhe o teto de faturamento anual de forma automática e calcule a parcela isenta de IRPF."
                        requiredTier="plus"
                    />
                ) : (
                    <div className="space-y-10 focus:outline-none animate-fade-in">
                        <div className="no-print bg-indigo-50/50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-sm">
                            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                                Base fiscal MEI
                            </h3>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">O demonstrativo considera apenas receitas e despesas marcadas como empresariais. Classifique as categorias de receita para detalhar as atividades.</p>
                            {meiFiscal.unclassifiedBusinessRevenueAmount > 0 && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold mt-3">{formatCurrency(meiFiscal.unclassifiedBusinessRevenueAmount)} em receita empresarial ainda não classificada por atividade.</p>
                            )}
                        </div>

                        <MeiMonthlyClosingPanel />

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <KpiCard 
                                title="Receita Anual"
                                value={formatCurrency(meiFiscal.annualRevenue)}
                                icon={<TrendingUpIcon className="h-6 w-6 text-indigo-500" />}
                                subtext="Total Bruto (Todas Fontes)"
                            />
                            <KpiCard 
                                title="Teto Permitido" 
                                value={formatCurrency(meiFiscal.effectiveAnnualLimit)}
                                icon={<TrophyIcon className="h-6 w-6 text-slate-400" />} 
                                subtext="Limite Anual Vigente"
                            />
                             <KpiCard 
                                title="Margem Livre (CNPJ)" 
                                value={formatCurrency(meiFiscal.effectiveAnnualLimit - meiFiscal.annualRevenue)}
                                icon={<DollarSignIcon className="h-6 w-6 text-emerald-500" />} 
                                subtext="Quanto ainda pode faturar"
                                subtextColor="text-emerald-600"
                            />
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Uso do Limite</span>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${meiFiscal.annualRevenue > meiFiscal.effectiveAnnualLimit ? 'bg-red-500' : 'bg-indigo-600'}`}
                                        style={{ width: `${Math.min((meiFiscal.annualRevenue/meiFiscal.effectiveAnnualLimit)*100, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center font-black text-[10px] text-slate-500 uppercase">
                                    <span>{((meiFiscal.annualRevenue/meiFiscal.effectiveAnnualLimit)*100).toFixed(1)}%</span>
                                    <span className={meiFiscal.annualRevenue > (meiFiscal.effectiveAnnualLimit * 0.8) ? 'text-amber-600' : ''}>
                                        {meiFiscal.annualRevenue > (meiFiscal.effectiveAnnualLimit * 0.8) ? 'Alerta Teto' : 'Seguro'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Guia para DASN-SIMEI (CNPJ)</h3>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            <tr>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">Receita de Comércio / Indústria</td>
                                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">{formatCurrency(meiFiscal.revenueByActivity.commerce + meiFiscal.revenueByActivity.industry)}</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">Receita de Prestação de Serviços</td>
                                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">{formatCurrency(meiFiscal.revenueByActivity.service)}</td>
                                            </tr>
                                            <tr className="bg-indigo-600 text-white font-black">
                                                <td className="px-6 py-4 text-xs uppercase tracking-widest">RECEITA BRUTA TOTAL</td>
                                                <td className="px-6 py-4 text-right">{formatCurrency(meiFiscal.annualRevenue)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div className="p-4 bg-indigo-50/30 dark:bg-indigo-900/10">
                                        <p className="text-[9px] text-indigo-500 font-bold uppercase leading-relaxed">
                                            Nota: Estes valores consolidam somente receitas empresariais marcadas no ano fiscal de {currentYear}. Receitas sem atividade aparecem como não classificadas e devem ser revisadas antes da declaração.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                    <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Auxílio Declaração IRPF (CPF)</h3>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm">
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            <tr>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">Lucro Líquido do MEI (Receita - Despesas)</td>
                                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">{formatCurrency(meiFiscal.grossBusinessProfit)}</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">
                                                    Parcela Isenta de IRPF <span className="text-[9px] bg-slate-100 px-1 rounded">
                                                        Por atividade classificada
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-emerald-600">{formatCurrency(meiFiscal.irpfExemptAmount)}</td>
                                            </tr>
                                            <tr className="bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-800">
                                                <td className="px-6 py-4 text-amber-800 dark:text-amber-400 font-black">RENDIMENTO TRIBUTÁVEL ESTIMADO</td>
                                                <td className="px-6 py-4 text-right font-black text-amber-800 dark:text-amber-400">{formatCurrency(meiFiscal.estimatedTaxableAmount)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-3 text-red-500">
                                            <AlertTriangleIcon className="h-4 w-4" />
                                            <p className="text-[9px] font-bold uppercase leading-relaxed">
                                                Atenção: Se o rendimento tributável exceder o teto da Receita Federal para pessoa física (aprox. R$ 30.639,00), você deve declarar IRPF.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Acompanhamento Mensal ({currentYear})</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800">
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase">Mês</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase">Receita Bruto</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase">Status Limite</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {meiFiscal.monthlyRevenue.map(data => (
                                            <tr key={data.month} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all">
                                                <td className="px-6 py-3 font-bold text-slate-700 dark:text-slate-300 capitalize">{monthLabelPtBr(data.month).split(' de ')[0]}</td>
                                                <td className="px-6 py-3 text-right font-black tabular-nums">{formatCurrency(data.total)}</td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-widest ${data.total > (meiFiscal.effectiveAnnualLimit / 12) ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        {data.total > (meiFiscal.effectiveAnnualLimit / 12) ? 'Acima da Média' : 'Dentro da Média'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            )}

                    </td>
                </tr>
            </tbody>
            </table>
            {/* Rodapé de Impressão */}
            <div className="print-only report-print-footer mt-12 pt-6 border-t border-slate-200 text-center">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Relatório gerado em {printTimestamp} • {organizationInfo?.name || 'Gestor Financeiro'} • Documento para fins de consulta interna
                </p>
            </div>
        </div>
    );
};

export default Reports;
