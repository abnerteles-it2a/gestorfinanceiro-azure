import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, TextInput, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { createScopedApi } from '../services/api';
import { readFinancialBootstrap } from '../utils/financialBootstrap';
import { Transaction, BankAccount, CostCenter } from '../types';
import { useAuth } from '../context/AuthContext';
import { useColorScheme } from 'nativewind';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFinancialData } from '../context/FinancialDataContext';

export const CashFlowScreen: React.FC = () => {
  const api = useRef(createScopedApi()).current;
  const { user } = useAuth();
  const { recurrences, projectedBalance } = useFinancialData();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Helper to get current month range
  const getInitialFilters = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      search: '',
      startDate: start,
      endDate: end,
      accountId: 'all',
      costCenterId: 'all' as string // Cast to string if needed
    } as { search: string; startDate: Date | null; endDate: Date | null; accountId: string; costCenterId: string; };
  };

  // Filter State
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [filters, setFilters] = useState(getInitialFilters);
  const [tempFilters, setTempFilters] = useState(filters);

  const formatSelectedDate = (date: Date | null) => {
    if (!date) return 'Selecionar Data';
    return date.toLocaleDateString('pt-BR');
  };

  const applyFilters = (txs: Transaction[], currentFilters: typeof filters) => {
    let filtered = [...txs];

    // Search filter
    if (currentFilters.search) {
      const searchLower = currentFilters.search.toLowerCase();
      filtered = filtered.filter(t => 
        (t.description || '').toLowerCase().includes(searchLower) || 
        (t.category || '').toLowerCase().includes(searchLower)
      );
    }

    // Account filter
    if (currentFilters.accountId !== 'all') {
      filtered = filtered.filter(t => t.accountId === currentFilters.accountId);
    }

    // Cost Center filter
    if (currentFilters.costCenterId !== 'all') {
      filtered = filtered.filter(t => t.costCenterId === currentFilters.costCenterId);
    }

    // Date range filter
    if (currentFilters.startDate) {
      filtered = filtered.filter(t => new Date(t.date) >= currentFilters.startDate!);
    }
    if (currentFilters.endDate) {
      const endOfDay = new Date(currentFilters.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.date) <= endOfDay);
    }

    setFilteredTransactions(filtered);

    // Recalculate totals based on FILTERED transactions
    const income = filtered.reduce((sum, t) => {
        const type = (t.transactionType || '').toLowerCase();
        return ['entrada', 'income', 'receita'].includes(type) ? sum + Number(t.amount || 0) : sum;
    }, 0);
    const expense = filtered.reduce((sum, t) => {
        const type = (t.transactionType || '').toLowerCase();
        return ['saída', 'saida', 'expense', 'despesa'].includes(type) ? sum + Number(t.amount || 0) : sum;
    }, 0);

    setTotalIncome(income);
    setTotalExpense(expense);
  };

  const openFilterModal = () => {
    setTempFilters(filters);
    setFilterModalVisible(true);
  };

  const closeFilterModal = () => {
    setFilterModalVisible(false);
  };

  const saveFilters = () => {
    setFilters(tempFilters);
    applyFilters(transactions, tempFilters);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    const emptyFilters = {
        search: '',
        startDate: null,
        endDate: null,
        accountId: 'all',
        costCenterId: 'all'
    };
    setFilters(emptyFilters);
    setTempFilters(emptyFilters);
    applyFilters(transactions, emptyFilters);
    setFilterModalVisible(false); // Optional: close modal on clear? Or keep open? User usually expects clear to apply immediately or reset form.
    // Let's reset the form and apply immediately if called from outside modal.
    // If called from inside modal (button), we might want to just reset tempFilters?
    // The UI has a "Limpar" button in the modal and outside.
    // Let's assume this is for the "outside" clear.
    // For inside modal, we might need another handler or check visibility.
    // Actually the UI code calls `clearFilters` for both.
    // If modal is open, we should probably just reset tempFilters?
    // But `clearFilters` as implemented resets `filters` and applies them.
    // So if called from modal, it clears everything immediately. That's fine.
  };

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      const response = await api.get(`/bootstrap?userId=${user.id}`);
      const data = response.data;
      const complete = readFinancialBootstrap(data);

      // Filtered totals require the full ledger, not the history page.
      const txs: Transaction[] = complete.financialTransactions.map((t: any) => ({
        id: t.id || String(Math.random()),
        date: t.date || new Date().toISOString(),
        accountId: t.account_id || '',
        toAccountId: t.to_account_id || '',
        transactionType: t.transaction_type || 'Saída',
        category: t.category || 'Geral',
        description: t.description || 'Transação',
        amount: Number(t.amount) || 0,
        paymentMethod: t.payment_method || '',
        costCenterId: t.cost_center_id || '',
      }));

      // Map accounts with computed balance
      const accs: BankAccount[] = (data.accounts || []).map((a: any) => {
        const initial = Number(a.initial_balance) || 0;
        return {
          id: a.id,
          name: a.name || 'Conta',
          bank: a.bank || '',
          initialBalance: initial,
          currentBalance: complete.balances.get(a.id)!,
        };
      });

      const ccs: CostCenter[] = data.cost_centers || [];

      setAccounts(accs);
      setCostCenters(ccs);

      txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const balance = accs.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
      setTransactions(txs);
      setTotalBalance(balance);

      // Apply current filters to new data
      applyFilters(txs, filters);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  // ─── Helpers (defined before any early return — hooks rule) ──────────────────
  const isIncome = (type: string) => ['entrada', 'income', 'receita'].includes((type || '').toLowerCase());
  const isExpense = (type: string) => ['saída', 'saida', 'expense', 'despesa'].includes((type || '').toLowerCase());

  // Group transactions by date for daily balance display
  // MUST be before any early return to comply with Rules of Hooks
  const groupedByDay = useMemo(() => {
    const groups: { dateStr: string; label: string; txs: Transaction[]; dayNet: number }[] = [];
    const map = new Map<string, Transaction[]>();

    filteredTransactions.forEach(t => {
      const d = new Date(t.date);
      const key = d.toISOString().split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });

    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([key, txs]) => {
        const d = new Date(key);
        const dayNet = txs.reduce((sum, t) => {
          if (isIncome(t.transactionType)) return sum + Number(t.amount);
          if (isExpense(t.transactionType)) return sum - Number(t.amount);
          return sum;
        }, 0);
        groups.push({
          dateStr: key,
          label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
          txs,
          dayNet,
        });
      });

    // Running balance per day (backwards from current total)
    let runningBalance = totalBalance;
    return groups.map(g => {
      const result = { ...g, runningBalance };
      runningBalance -= g.dayNet;
      return result;
    });
  }, [filteredTransactions, totalBalance]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <View className="px-4 pb-4 pt-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 mb-2">
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">Fluxo de Caixa</Text>
            <TouchableOpacity onPress={openFilterModal} className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-full">
                <Ionicons name="filter" size={20} color={colorScheme === 'dark' ? '#818cf8' : '#4F46E5'} />
            </TouchableOpacity>
          </View>
          <View className="items-end">
              <View className="items-end">
                <Text className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Saldo Atual</Text>
                <Text className="text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(totalBalance)}</Text>
              </View>
              <View className="items-end mt-1">
                <Text className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Projetado 30d</Text>
                <Text className={`text-sm font-bold tabular-nums ${
                  projectedBalance >= totalBalance ? 'text-emerald-500' : 'text-rose-500'
                }`}>{formatCurrency(projectedBalance)}</Text>
              </View>
          </View>
        </View>

        {/* Filter Indicator */}
        {(filters.search || filters.startDate || filters.endDate || filters.accountId !== 'all' || filters.costCenterId !== 'all') && (
            <View className="mb-2 flex-row items-center flex-wrap">
                <Text className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Filtros ativos: </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {filters.search && `"${filters.search}" `}
                    {filters.accountId !== 'all' && `• Conta `}
                    {filters.costCenterId !== 'all' && `• Centro `}
                    {(filters.startDate || filters.endDate) && `• Data`}
                </Text>
                <TouchableOpacity onPress={clearFilters} className="ml-2">
                    <Text className="text-xs text-red-500 font-bold">Limpar</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Summary Cards */}
        <View className="flex-row justify-between">
            <View className="flex-1 bg-green-50 dark:bg-green-900/20 p-3 rounded-xl mr-2 border border-green-100 dark:border-green-800">
                <Text className="text-xs text-green-700 dark:text-green-400 font-medium">Entradas</Text>
                <Text className="text-base font-bold text-green-700 dark:text-green-400">{formatCurrency(totalIncome)}</Text>
            </View>
            <View className="flex-1 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl ml-2 border border-red-100 dark:border-red-800">
                <Text className="text-xs text-red-700 dark:text-red-400 font-medium">Saídas</Text>
                <Text className="text-base font-bold text-red-700 dark:text-red-400">{formatCurrency(totalExpense)}</Text>
            </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
      >
        {groupedByDay.length === 0 && (
          <Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhuma transação encontrada.</Text>
        )}

        {groupedByDay.map(group => (
          <View key={group.dateStr} className="mb-4">
            {/* Day Header with balance */}
            <View className="flex-row justify-between items-center py-2 px-1 mb-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {group.label}
                </Text>
                <View className={`px-2 py-0.5 rounded-full ${
                  group.dayNet >= 0
                    ? 'bg-green-100 dark:bg-green-900/40'
                    : 'bg-red-100 dark:bg-red-900/40'
                }`}>
                  <Text className={`text-[10px] font-bold ${
                    group.dayNet >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                  }`}>
                    {group.dayNet >= 0 ? '+' : ''}{formatCurrency(group.dayNet)}
                  </Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Saldo</Text>
                <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  {formatCurrency(group.runningBalance)}
                </Text>
              </View>
            </View>

            {/* Transactions for the day */}
            <View className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
              {group.txs.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => navigation.navigate('TransactionForm', { transaction: item, user })}
                  className={`p-4 flex-row justify-between items-center ${
                    idx < group.txs.length - 1 ? 'border-b border-gray-50 dark:border-gray-700/50' : ''
                  }`}
                >
                  <View className="flex-row items-center flex-1 mr-2">
                    <View className={`w-8 h-8 rounded-xl justify-center items-center mr-3 ${
                      isIncome(item.transactionType)
                        ? 'bg-green-50 dark:bg-green-900/30'
                        : isExpense(item.transactionType)
                        ? 'bg-red-50 dark:bg-red-900/30'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      <Ionicons
                        name={isIncome(item.transactionType) ? 'arrow-up' : isExpense(item.transactionType) ? 'arrow-down' : 'swap-horizontal'}
                        size={13}
                        color={isIncome(item.transactionType) ? '#16a34a' : isExpense(item.transactionType) ? '#dc2626' : '#6b7280'}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-900 dark:text-white text-sm" numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                        {item.category} • {item.paymentMethod}
                      </Text>
                    </View>
                  </View>
                  <Text className={`font-bold text-sm ${
                    isIncome(item.transactionType)
                      ? 'text-green-600 dark:text-green-400'
                      : isExpense(item.transactionType)
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {isIncome(item.transactionType) ? '+' : isExpense(item.transactionType) ? '-' : ''}{formatCurrency(Number(item.amount))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* ─── Próximos Lançamentos ─── */}
        {(() => {
          const today = new Date().getDate();
          const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
          const now = new Date();
          const upcoming = recurrences
            .filter(r => r.active && (r.dayOfMonth || 1) > today)
            .sort((a, b) => (a.dayOfMonth || 1) - (b.dayOfMonth || 1));
          if (upcoming.length === 0) return null;
          return (
            <View className="px-4 mt-4 mb-2">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Próximos Lançamentos
                </Text>
                <View className="bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                  <Text className="text-[9px] font-black text-indigo-500 uppercase tracking-wide">
                    {upcoming.length} recorrências
                  </Text>
                </View>
              </View>

              {/* Projected balance strip */}
              <View className="flex-row items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 rounded-2xl mb-3 border border-indigo-100 dark:border-indigo-800/40">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="trending-up-outline" size={16} color="#6366f1" />
                  <Text className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Saldo projetado (fim do mês)</Text>
                </View>
                <Text className={`text-sm font-black tabular-nums ${
                  projectedBalance >= totalBalance ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {formatCurrency(projectedBalance)}
                </Text>
              </View>

              {/* Upcoming recurrences list */}
              <View className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-gray-700">
                {upcoming.map((r, idx) => {
                  const dueDate = new Date(now.getFullYear(), now.getMonth(), r.dayOfMonth || 1);
                  const daysLeft = (r.dayOfMonth || 1) - today;
                  return (
                    <View
                      key={r.id}
                      className={`px-4 py-3 flex-row items-center ${
                        idx < upcoming.length - 1 ? 'border-b border-slate-50 dark:border-gray-700/40' : ''
                      }`}
                    >
                      <View className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-900/20 justify-center items-center mr-3">
                        <Ionicons name="calendar-outline" size={13} color="#f97316" />
                      </View>
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-900 dark:text-white" numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text className="text-[10px] text-gray-400 font-medium mt-0.5">
                          {r.category} • Dia {r.dayOfMonth}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-black text-rose-500">
                          -{formatCurrency(r.amount)}
                        </Text>
                        <Text className="text-[9px] text-slate-400 font-semibold mt-0.5">
                          em {daysLeft}d
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View className="h-4" />
            </View>
          );
        })()}

      </ScrollView>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeFilterModal}
      >
        <View className="flex-1 bg-gray-50 dark:bg-gray-900">
            <View className="p-4 border-b border-gray-200 dark:border-gray-800 flex-row justify-between items-center bg-white dark:bg-gray-800">
                <Text className="text-lg font-bold text-gray-900 dark:text-white">Filtrar Transações</Text>
                <TouchableOpacity onPress={closeFilterModal}>
                    <Text className="text-indigo-600 font-bold">Cancelar</Text>
                </TouchableOpacity>
            </View>
            <ScrollView className="p-4">
                <Text className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Buscar</Text>
                <TextInput
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-3 mb-4 text-gray-900 dark:text-white"
                    placeholder="Descrição ou Categoria"
                    placeholderTextColor="#9CA3AF"
                    value={tempFilters.search}
                    onChangeText={(text) => setTempFilters({...tempFilters, search: text})}
                />

                <Text className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Período</Text>
                <View className="flex-row gap-4 mb-4">
                    <View className="flex-1">
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">De</Text>
                        <TouchableOpacity 
                            onPress={() => setShowDatePicker('start')}
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                        >
                            <Text className="text-gray-900 dark:text-white">{formatSelectedDate(tempFilters.startDate)}</Text>
                        </TouchableOpacity>
                    </View>
                    <View className="flex-1">
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">Até</Text>
                        <TouchableOpacity 
                            onPress={() => setShowDatePicker('end')}
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-3"
                        >
                            <Text className="text-gray-900 dark:text-white">{formatSelectedDate(tempFilters.endDate)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {showDatePicker && (
                    <DateTimePicker
                        value={showDatePicker === 'start' ? (tempFilters.startDate || new Date()) : (tempFilters.endDate || new Date())}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, selectedDate) => {
                            const currentMode = showDatePicker;
                            setShowDatePicker(null);
                            if (selectedDate && event.type !== 'dismissed') {
                                if (currentMode === 'start') {
                                    setTempFilters({...tempFilters, startDate: selectedDate});
                                } else {
                                    setTempFilters({...tempFilters, endDate: selectedDate});
                                }
                            }
                        }}
                    />
                )}

                <Text className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Conta</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                    <TouchableOpacity
                        onPress={() => setTempFilters({...tempFilters, accountId: 'all'})}
                        className={`mr-2 px-4 py-2 rounded-full border ${tempFilters.accountId === 'all' ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}
                    >
                        <Text className={tempFilters.accountId === 'all' ? 'text-white font-bold' : 'text-gray-700 dark:text-gray-300'}>Todas</Text>
                    </TouchableOpacity>
                    {accounts.map(acc => (
                        <TouchableOpacity
                            key={acc.id}
                            onPress={() => setTempFilters({...tempFilters, accountId: acc.id})}
                            className={`mr-2 px-4 py-2 rounded-full border ${tempFilters.accountId === acc.id ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}
                        >
                            <Text className={tempFilters.accountId === acc.id ? 'text-white font-bold' : 'text-gray-700 dark:text-gray-300'}>{acc.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Centro de Custo</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                    <TouchableOpacity
                        onPress={() => setTempFilters({...tempFilters, costCenterId: 'all'})}
                        className={`mr-2 px-4 py-2 rounded-full border ${tempFilters.costCenterId === 'all' ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}
                    >
                        <Text className={tempFilters.costCenterId === 'all' ? 'text-white font-bold' : 'text-gray-700 dark:text-gray-300'}>Todos</Text>
                    </TouchableOpacity>
                    {costCenters.map(cc => (
                        <TouchableOpacity
                            key={cc.id}
                            onPress={() => setTempFilters({...tempFilters, costCenterId: cc.id})}
                            className={`mr-2 px-4 py-2 rounded-full border ${tempFilters.costCenterId === cc.id ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}
                        >
                            <Text className={tempFilters.costCenterId === cc.id ? 'text-white font-bold' : 'text-gray-700 dark:text-gray-300'}>{cc.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <TouchableOpacity 
                    onPress={saveFilters}
                    className="bg-indigo-600 p-4 rounded-xl items-center mb-3"
                >
                    <Text className="text-white font-bold text-lg">Aplicar Filtros</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={clearFilters}
                    className="bg-transparent p-4 rounded-xl items-center border border-red-500"
                >
                    <Text className="text-red-500 font-bold text-lg">Limpar Filtros</Text>
                </TouchableOpacity>
                <View className="h-20" />
            </ScrollView>
        </View>
      </Modal>
    </View>
  );
};
