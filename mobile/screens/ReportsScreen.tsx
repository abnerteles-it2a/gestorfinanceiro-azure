import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useFinancialData } from '../context/FinancialDataContext';
import { api } from '../services/api';
import { TransactionType } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const pct = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const MONTHS_PT = [
  'Jan','Fev','Mar','Abr','Mai','Jun',
  'Jul','Ago','Set','Out','Nov','Dez',
];

type Tab = 'mensal' | 'extrato' | 'carteira' | 'contas';

// ─── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3 mt-6 ml-1">
      {title}
    </Text>
  );
}

function StatCard({
  label,
  value,
  color = 'slate',
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon: string;
}) {
  const bg: Record<string, string> = {
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800',
    red: 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800',
    blue: 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800',
    slate: 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800',
  };
  const iconColor: Record<string, string> = {
    green: '#10b981', red: '#f43f5e', blue: '#0D9488', slate: '#64748b',
  };
  return (
    <View className={`flex-1 rounded-2xl border p-4 ${bg[color]}`}>
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons name={icon as any} size={14} color={iconColor[color]} />
        <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</Text>
      </View>
      <Text
        className="text-base font-black text-slate-900 dark:text-white"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Tab: Mensal ───────────────────────────────────────────────────────────────
function MensalTab() {
  const { transactions, loading } = useFinancialData();
  const now = new Date();

  // Current month transactions
  const current = useMemo(() =>
    transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }), [transactions]);

  // Previous month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = useMemo(() =>
    transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === prevDate.getMonth() && d.getFullYear() === prevDate.getFullYear();
    }), [transactions]);

  const income = current.filter(t => t.transactionType === TransactionType.INCOME)
    .reduce((s, t) => s + t.amount, 0);
  const expense = current.filter(t => t.transactionType === TransactionType.EXPENSE)
    .reduce((s, t) => s + t.amount, 0);
  const result = income - expense;

  const prevExpense = previous.filter(t => t.transactionType === TransactionType.EXPENSE)
    .reduce((s, t) => s + t.amount, 0);
  const expenseDelta = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : 0;

  // Top 5 expense categories
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    current
      .filter(t => t.transactionType === TransactionType.EXPENSE)
      .forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [current]);

  const maxCat = byCategory[0]?.[1] ?? 1;

  if (loading) {
    return <ActivityIndicator size="large" color="#0D9488" className="mt-16" />;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionHeader title={`${MONTHS_PT[now.getMonth()]} ${now.getFullYear()} — DRE Resumido`} />

      {/* KPI row */}
      <View className="flex-row gap-3">
        <StatCard label="Receitas" value={currency(income)} color="green" icon="arrow-up-circle-outline" />
        <StatCard label="Despesas" value={currency(expense)} color="red" icon="arrow-down-circle-outline" />
      </View>

      {/* Result card */}
      <View className={`mt-3 rounded-2xl border p-5 ${result >= 0
        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800'
        : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800'}`}>
        <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Resultado do Mês</Text>
        <Text className={`text-2xl font-black ${result >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {currency(result)}
        </Text>
        <Text className="text-[10px] text-slate-400 font-semibold mt-1">
          Despesas {expenseDelta >= 0 ? '↑' : '↓'} {Math.abs(expenseDelta).toFixed(1)}% vs mês anterior
        </Text>
      </View>

      {/* Top categories */}
      {byCategory.length > 0 && (
        <>
          <SectionHeader title="Top 5 Categorias de Despesa" />
          <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
            {byCategory.map(([cat, val], idx) => {
              const barPct = (val / maxCat) * 100;
              return (
                <View
                  key={cat}
                  className={`px-4 py-3 ${idx < byCategory.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/50' : ''}`}
                >
                  <View className="flex-row justify-between items-center mb-1.5">
                    <Text className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1 mr-2" numberOfLines={1}>
                      {cat}
                    </Text>
                    <Text className="text-xs font-black text-slate-900 dark:text-white">{currency(val)}</Text>
                  </View>
                  <View className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {byCategory.length === 0 && (
        <View className="items-center py-12">
          <Ionicons name="bar-chart-outline" size={40} color="#cbd5e1" />
          <Text className="text-sm text-slate-400 font-semibold mt-3">Nenhuma despesa este mês</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tab: Extrato ──────────────────────────────────────────────────────────────
function ExtratoTab() {
  const { transactions, loading } = useFinancialData();
  const [search, setSearch] = useState('');

  // Last 60 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const filtered = useMemo(() =>
    transactions
      .filter(t => new Date(t.date) >= cutoff)
      .filter(t =>
        !search ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 100),
    [transactions, search]);

  if (loading) return <ActivityIndicator size="large" color="#4F46E5" className="mt-16" />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionHeader title="Extrato — Últimos 60 dias" />

      {/* Search */}
      <View className="bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-2xl flex-row items-center px-4 py-3 mb-4">
        <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
        <Text
          className="text-sm text-slate-400 flex-1"
          onPress={() => {}} // handled by TextInput — placeholder for now
        >
          {search || 'Buscar descrição ou categoria...'}
        </Text>
      </View>

      {filtered.length === 0 && (
        <View className="items-center py-12">
          <Ionicons name="receipt-outline" size={40} color="#cbd5e1" />
          <Text className="text-sm text-slate-400 font-semibold mt-3">Nenhuma transação encontrada</Text>
        </View>
      )}

      <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
        {filtered.map((t, idx) => {
          const isIncome = t.transactionType === TransactionType.INCOME;
          const d = new Date(t.date);
          return (
            <View
              key={t.id}
              className={`px-4 py-3.5 flex-row items-center ${idx < filtered.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''}`}
            >
              <View className={`w-8 h-8 rounded-xl justify-center items-center mr-3 ${isIncome ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}`}>
                <Ionicons
                  name={isIncome ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={isIncome ? '#10b981' : '#f43f5e'}
                />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-xs font-bold text-slate-800 dark:text-slate-100" numberOfLines={1}>
                  {t.description}
                </Text>
                <Text className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {t.category} • {d.getDate()}/{MONTHS_PT[d.getMonth()]}
                </Text>
              </View>
              <Text className={`text-sm font-black ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {isIncome ? '+' : '-'}{currency(t.amount)}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Tab: Carteira ─────────────────────────────────────────────────────────────
function CarteiraTab() {
  const { investments, fixedIncomeInvestments, loading } = useFinancialData();

  const totalVariable = investments.reduce((s, i) => s + i.purchasePrice * i.quantity, 0);
  const totalFixed = fixedIncomeInvestments.reduce((s, i) => s + i.amountInvested, 0);
  const total = totalVariable + totalFixed;

  // Composition by type
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    investments.forEach(i => {
      map[i.type] = (map[i.type] || 0) + i.purchasePrice * i.quantity;
    });
    if (totalFixed > 0) map['Renda Fixa'] = totalFixed;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [investments, fixedIncomeInvestments]);

  const TYPE_COLORS: Record<string, string> = {
    'Ação': '#4F46E5',
    'Fundo Imobiliário': '#0D9488',
    'Renda Fixa': '#F59E0B',
    'Criptomoeda': '#8B5CF6',
    'Ação Internacional': '#06B6D4',
    'REIT': '#EC4899',
  };

  if (loading) return <ActivityIndicator size="large" color="#4F46E5" className="mt-16" />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionHeader title="Posição da Carteira" />

      {/* Total */}
      <View className="bg-indigo-600 rounded-2xl p-5 mb-4">
        <Text className="text-[9px] font-black uppercase tracking-widest text-indigo-200 mb-1">
          Patrimônio Investido Total
        </Text>
        <Text className="text-3xl font-black text-white">{currency(total)}</Text>
        <View className="flex-row gap-4 mt-3">
          <View>
            <Text className="text-[9px] text-indigo-300 uppercase font-bold tracking-wider">Renda Variável</Text>
            <Text className="text-sm font-black text-white">{currency(totalVariable)}</Text>
          </View>
          <View>
            <Text className="text-[9px] text-indigo-300 uppercase font-bold tracking-wider">Renda Fixa</Text>
            <Text className="text-sm font-black text-white">{currency(totalFixed)}</Text>
          </View>
        </View>
      </View>

      {/* Composition */}
      {byType.length > 0 && (
        <>
          <SectionHeader title="Composição por Classe" />
          <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
            {byType.map(([type, val], idx) => {
              const pctVal = total > 0 ? (val / total) * 100 : 0;
              const color = TYPE_COLORS[type] ?? '#64748b';
              return (
                <View
                  key={type}
                  className={`px-4 py-3.5 flex-row items-center ${idx < byType.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''}`}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 12 }} />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">{type}</Text>
                    <View className="h-1 bg-slate-100 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                      <View style={{ width: `${pctVal}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
                    </View>
                  </View>
                  <View className="items-end ml-3">
                    <Text className="text-xs font-black text-slate-900 dark:text-white">{currency(val)}</Text>
                    <Text className="text-[10px] text-slate-400 font-semibold">{pctVal.toFixed(1)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Renda Fixa detail */}
      {fixedIncomeInvestments.length > 0 && (
        <>
          <SectionHeader title="Renda Fixa" />
          <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
            {fixedIncomeInvestments.map((fi, idx) => (
              <View
                key={fi.id}
                className={`px-4 py-3.5 ${idx < fixedIncomeInvestments.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''}`}
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs font-bold text-slate-800 dark:text-slate-100" numberOfLines={1}>{fi.name}</Text>
                    <Text className="text-[10px] text-slate-400 font-medium mt-0.5">{fi.issuer} • {fi.yieldRate}</Text>
                  </View>
                  <Text className="text-xs font-black text-amber-600 dark:text-amber-400">
                    {currency(fi.amountInvested)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {total === 0 && (
        <View className="items-center py-12">
          <Ionicons name="trending-up-outline" size={40} color="#cbd5e1" />
          <Text className="text-sm text-slate-400 font-semibold mt-3">Nenhum investimento cadastrado</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tab: Contas (A Pagar e A Receber) ────────────────────────────────────────
function ContasTab() {
  const [payables, setPayables] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const now = new Date();
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      try {
        const [payRes, recRes] = await Promise.all([
          api.post('/query', { type: 'payables_list', data: { month: currentMonth, status: 'open' } }),
          api.post('/query', { type: 'receivables_list', data: { month: currentMonth, status: 'open' } }),
        ]);
        setPayables(payRes.data?.rows || []);
        setReceivables(recRes.data?.rows || []);
      } catch (e) {
        console.error('ContasTab load error:', e);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [currentMonth]);

  const totalPagar = payables.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalReceber = receivables.reduce((s, t) => s + Number(t.amount || 0), 0);

  const isOverdue = (dueDate: string) => new Date(dueDate) < now;

  if (loadingData) return <ActivityIndicator size="large" color="#4F46E5" className="mt-16" />;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Summary */}
      <SectionHeader title="Visão Geral" />
      <View className="flex-row gap-3 mb-2">
        <StatCard label="A Pagar" value={currency(totalPagar)} color="red" icon="card-outline" />
        <StatCard label="A Receber" value={currency(totalReceber)} color="green" icon="cash-outline" />
      </View>

      {/* Payables */}
      <SectionHeader title={`Contas a Pagar — ${payables.length} abertas`} />
      {payables.length === 0 ? (
        <View className="items-center py-8">
          <Ionicons name="checkmark-circle-outline" size={36} color="#10b981" />
          <Text className="text-sm text-slate-400 font-semibold mt-2">Nenhuma conta a pagar este mês</Text>
        </View>
      ) : (
        <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
          {payables.map((item, idx) => {
            const due = new Date(item.due_date);
            const overdue = isOverdue(item.due_date);
            const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return (
              <View
                key={item.id}
                className={`px-4 py-3.5 flex-row items-center ${
                  idx < payables.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''
                }`}
              >
                <View className={`w-8 h-8 rounded-xl justify-center items-center mr-3 ${
                  overdue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-50 dark:bg-orange-900/20'
                }`}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={overdue ? '#dc2626' : '#f97316'}
                  />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-bold text-slate-800 dark:text-slate-100" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {item.category || 'Geral'} • Vence {due.getDate()}/{MONTHS[due.getMonth()]}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs font-black text-rose-600 dark:text-rose-400">
                    {currency(Number(item.amount))}
                  </Text>
                  <Text className={`text-[10px] font-semibold mt-0.5 ${
                    overdue ? 'text-red-500' : 'text-slate-400'
                  }`}>
                    {overdue ? `${Math.abs(daysLeft)}d atraso` : daysLeft === 0 ? 'Hoje' : daysLeft === 1 ? 'Amanhã' : `em ${daysLeft}d`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Receivables */}
      <SectionHeader title={`Contas a Receber — ${receivables.length} abertas`} />
      {receivables.length === 0 ? (
        <View className="items-center py-8">
          <Ionicons name="information-circle-outline" size={36} color="#94a3b8" />
          <Text className="text-sm text-slate-400 font-semibold mt-2">Nenhuma conta a receber este mês</Text>
        </View>
      ) : (
        <View className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-100 dark:border-gray-700 overflow-hidden">
          {receivables.map((item, idx) => {
            const due = new Date(item.due_date);
            const overdue = isOverdue(item.due_date);
            return (
              <View
                key={item.id}
                className={`px-4 py-3.5 flex-row items-center ${
                  idx < receivables.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''
                }`}
              >
                <View className="w-8 h-8 rounded-xl justify-center items-center mr-3 bg-emerald-50 dark:bg-emerald-900/30">
                  <Ionicons name="arrow-up" size={14} color="#10b981" />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-bold text-slate-800 dark:text-slate-100" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {item.category || 'Geral'} • Vence {due.getDate()}/{MONTHS[due.getMonth()]}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                    +{currency(Number(item.amount))}
                  </Text>
                  {overdue && (
                    <Text className="text-[10px] text-amber-500 font-semibold mt-0.5">Em atraso</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View className="h-6" />
    </ScrollView>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────────
export const ReportsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [activeTab, setActiveTab] = useState<Tab>('mensal');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'mensal', label: 'Mensal', icon: 'calendar-outline' },
    { key: 'extrato', label: 'Extrato', icon: 'receipt-outline' },
    { key: 'carteira', label: 'Carteira', icon: 'pie-chart-outline' },
    { key: 'contas', label: 'Contas', icon: 'card-outline' },
  ];

  return (
    <View className="flex-1 bg-slate-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Relatórios
        </Text>
        <Text className="text-2xl font-black text-gray-900 dark:text-white mt-0.5">
          Análise Financeira
        </Text>
      </View>

      {/* Tab selector — 4 tabs compact row */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <View className="flex-row bg-white dark:bg-gray-800 rounded-2xl p-1 border border-slate-100 dark:border-gray-700">
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{ flex: 1 }}
              className={`flex-row items-center justify-center py-2.5 rounded-xl gap-1 ${
                activeTab === tab.key ? 'bg-teal-600' : ''
              }`}
              activeOpacity={0.8}
            >
              <Ionicons
                name={tab.icon as any}
                size={12}
                color={activeTab === tab.key ? '#ffffff' : colorScheme === 'dark' ? '#9ca3af' : '#6b7280'}
              />
              <Text className={`text-[9px] font-black uppercase tracking-wider ${
                activeTab === tab.key ? 'text-white' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      <View className="flex-1 px-5 pb-4">
        {activeTab === 'mensal' && <MensalTab />}
        {activeTab === 'extrato' && <ExtratoTab />}
        {activeTab === 'carteira' && <CarteiraTab />}
        {activeTab === 'contas' && <ContasTab />}
      </View>
    </View>
  );
};
