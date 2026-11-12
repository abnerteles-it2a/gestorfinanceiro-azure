import React, { useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, ScrollView, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createScopedApi } from '../services/api';
import { useColorScheme } from 'nativewind';
import { formatCurrency, parseCurrencyInput, formatCurrencyForInput } from '../utils/formatters';
import { Category } from '../types';

interface Payable {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  issue_date?: string;
  category?: string;
  cost_center_id?: string;
  supplier?: string;
  notes?: string;
  status: 'open' | 'paid';
}

export const PayablesScreen = () => {
  const api = useRef(createScopedApi()).current;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Payable[]>([]);
  const [statusFilter, setStatusFilter] = useState<'open' | 'paid' | 'all'>('open');
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  
  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Payable | null>(null);
  
  // Form states
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  
  // Helpers
  const [categories, setCategories] = useState<Category[]>([]);
  const [costCenters, setCostCenters] = useState<{id: string, name: string}[]>([]);
  const [costCenterId, setCostCenterId] = useState('');

  const fetchHelpers = async () => {
    try {
      const res = await api.get('/bootstrap');
      setCategories((res.data.categories || []).filter((c: Category) => c.type === 'Saída'));
      setCostCenters(res.data.cost_centers || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const pStatus = statusFilter === 'all' ? '' : statusFilter;
      const res = await api.post('/query', {
        type: 'payables_list',
        data: { month: monthFilter, status: pStatus }
      });
      setItems(res.data.rows || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar as contas a pagar.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchHelpers();
      fetchData();

      if (route.params?.createDas) {
        setModalVisible(true);
        const now = new Date();
        const m = route.params.monthIndex !== undefined ? route.params.monthIndex : now.getMonth();
        const d = new Date(now.getFullYear(), m, 20);
        const monthName = d.toLocaleString('pt-BR', { month: 'long' });
        
        setTitle(`DAS MEI - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`);
        setAmount('75,00');
        setDueDate(d.toISOString().slice(0, 10));
        setCategory('Impostos');
        setNotes('Gerado automaticamente pelo Módulo MEI');
        navigation.setParams({ createDas: undefined });
      }
    }, [monthFilter, statusFilter, route.params])
  );

  // ─── Métricas de Aging & Inadimplência Real ──────────────────────────────────
  const agingMetrics = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let totalOpen = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let dueTodayAmount = 0;
    let upcomingAmount = 0;
    let totalPaid = 0;

    items.forEach(item => {
      const val = Number(item.amount) || 0;
      if (item.status === 'paid') {
        totalPaid += val;
      } else {
        totalOpen += val;
        const due = String(item.due_date).slice(0, 10);
        if (due < todayStr) {
          overdueAmount += val;
          overdueCount += 1;
        } else if (due === todayStr) {
          dueTodayAmount += val;
        } else {
          upcomingAmount += val;
        }
      }
    });

    const defaultRate = totalOpen > 0 ? (overdueAmount / totalOpen) * 100 : 0;

    return { totalOpen, overdueAmount, overdueCount, dueTodayAmount, upcomingAmount, totalPaid, defaultRate };
  }, [items]);

  const handleSave = async () => {
    if (!title || !amount || !dueDate) {
      Alert.alert('Erro', 'Preencha os campos obrigatórios.');
      return;
    }

    try {
      const payload = {
        title,
        amount: parseCurrencyInput(amount),
        dueDate,
        category: category || null,
        costCenterId: costCenterId || null,
        supplier: supplier || null,
        notes: notes || null
      };

      if (editingItem) {
        await api.post('/query', {
          type: 'payables_update',
          data: { id: editingItem.id, ...payload, status: editingItem.status }
        });
      } else {
        await api.post('/query', {
          type: 'payables_insert',
          data: payload
        });
      }

      setModalVisible(false);
      fetchData();
      resetForm();
    } catch (error) {
      Alert.alert('Erro', 'Falha ao salvar conta a pagar.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Confirmar Exclusão', 'Deseja realmente excluir esta conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            await api.post('/query', { type: 'payables_delete', data: { id } });
            fetchData();
          } catch (e) { Alert.alert('Erro', 'Falha ao excluir'); }
      }}
    ]);
  };

  const handleMarkPaid = (item: Payable) => {
    Alert.alert('Liquidar Conta', `Deseja liquidar "${item.title}" no valor de ${formatCurrency(item.amount)}?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: async () => {
            try {
                const boot = await api.get('/bootstrap');
                const accId = boot.data.accounts?.[0]?.id;
                if (!accId) { Alert.alert('Erro', 'Nenhuma conta encontrada para debitar.'); return; }
                
                await api.post('/query', {
                    type: 'payables_mark_paid',
                    data: {
                        id: item.id,
                        paidAmount: item.amount,
                        paidDate: new Date().toISOString().slice(0, 10),
                        accountId: accId,
                        paymentMethod: 'Boleto',
                        description: `Pagamento: ${item.title}`
                    }
                });
                fetchData();
            } catch (e) { Alert.alert('Erro', 'Falha ao liquidar conta.'); }
        }}
    ]);
  };

  const resetForm = () => {
    setEditingItem(null);
    setTitle('');
    setAmount('');
    setDueDate(new Date().toISOString().slice(0, 10));
    setCategory('');
    setCostCenterId('');
    setSupplier('');
    setNotes('');
  };

  const openEdit = (item: Payable) => {
    setEditingItem(item);
    setTitle(item.title);
    setAmount(formatCurrencyForInput(item.amount));
    setDueDate(item.due_date ? String(item.due_date).slice(0, 10) : '');
    setCategory(item.category || '');
    setCostCenterId(item.cost_center_id || '');
    setSupplier(item.supplier || '');
    setNotes(item.notes || '');
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: Payable }) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueStr = item.due_date ? String(item.due_date).slice(0, 10) : '';
    const isOverdue = item.status === 'open' && dueStr < todayStr;
    const isToday = item.status === 'open' && dueStr === todayStr;

    let borderLeftColor = 'border-teal-500';
    if (item.status === 'paid') borderLeftColor = 'border-emerald-500';
    else if (isOverdue) borderLeftColor = 'border-rose-500';
    else if (isToday) borderLeftColor = 'border-amber-500';

    return (
      <View className={`bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm mb-3 border-l-4 ${borderLeftColor} border border-slate-100 dark:border-slate-800`}>
        <View className="flex-row justify-between items-start">
          <View className="flex-1 mr-2">
            <Text className="font-bold text-slate-900 dark:text-white text-base">{item.title}</Text>
            <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              Vence: {new Date(item.due_date).toLocaleDateString('pt-BR')}
            </Text>
            {item.supplier && <Text className="text-slate-400 text-xs">{item.supplier}</Text>}
          </View>
          <View className="items-end">
              <Text className="font-bold text-slate-900 dark:text-white text-base tabular-nums">
                {formatCurrency(Number(item.amount))}
              </Text>
              <View className={`px-2 py-0.5 rounded-full mt-1 ${
                item.status === 'paid' 
                  ? 'bg-emerald-100 dark:bg-emerald-950/40' 
                  : isOverdue 
                  ? 'bg-rose-100 dark:bg-rose-950/40' 
                  : isToday 
                  ? 'bg-amber-100 dark:bg-amber-950/40' 
                  : 'bg-teal-100 dark:bg-teal-950/40'
              }`}>
                  <Text className={`text-[10px] font-bold ${
                    item.status === 'paid' 
                      ? 'text-emerald-700 dark:text-emerald-300' 
                      : isOverdue 
                      ? 'text-rose-700 dark:text-rose-300' 
                      : isToday 
                      ? 'text-amber-700 dark:text-amber-300' 
                      : 'text-teal-700 dark:text-teal-300'
                  }`}>
                      {item.status === 'paid' ? 'PAGO' : isOverdue ? 'EM ATRASO' : isToday ? 'VENCE HOJE' : 'A VENCER'}
                  </Text>
              </View>
          </View>
        </View>
        
        {item.status === 'open' && (
          <View className="flex-row justify-end mt-3 gap-2">
              <TouchableOpacity onPress={() => handleMarkPaid(item)} className="bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  <Text className="text-emerald-700 dark:text-emerald-300 text-xs font-bold">Liquidar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openEdit(item)} className="bg-teal-50 dark:bg-teal-950/30 px-3 py-1.5 rounded-md border border-teal-200 dark:border-teal-800">
                  <Text className="text-teal-700 dark:text-teal-300 text-xs font-bold">Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} className="bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-800">
                  <Text className="text-rose-700 dark:text-rose-300 text-xs font-bold">Excluir</Text>
              </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 py-3 bg-white dark:bg-slate-900 shadow-sm border-b border-slate-100 dark:border-slate-800 flex-row justify-between items-center">
        <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
                <Ionicons name="arrow-back" size={24} color={colorScheme === 'dark' ? '#fff' : '#0F172A'} />
            </TouchableOpacity>
            <View>
              <Text className="text-lg font-black text-slate-900 dark:text-white">Contas a Pagar</Text>
              <Text className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-widest">Gestão de Passivos</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => { resetForm(); setModalVisible(true); }} className="p-1">
            <Ionicons name="add-circle" size={32} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* Aging & Inadimplência Real Cards */}
      <View className="px-4 pt-3">
        <View className="flex-row gap-2 mb-3">
          <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <Text className="text-[9px] font-bold text-slate-400 uppercase">Em Aberto</Text>
            <Text className="text-sm font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {formatCurrency(agingMetrics.totalOpen)}
            </Text>
          </View>
          <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-rose-100 dark:border-rose-950/50">
            <View className="flex-row justify-between items-center">
              <Text className="text-[9px] font-bold text-rose-500 uppercase">Em Atraso</Text>
              {agingMetrics.overdueCount > 0 && (
                <Text className="text-[9px] font-black text-rose-600 bg-rose-50 dark:bg-rose-950 px-1.5 py-0.2 rounded">
                  {agingMetrics.defaultRate.toFixed(0)}%
                </Text>
              )}
            </View>
            <Text className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
              {formatCurrency(agingMetrics.overdueAmount)}
            </Text>
          </View>
          <View className="flex-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/50">
            <Text className="text-[9px] font-bold text-emerald-500 uppercase">Pago</Text>
            <Text className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
              {formatCurrency(agingMetrics.totalPaid)}
            </Text>
          </View>
        </View>

        {/* Filtros */}
        <View className="flex-row gap-2 mb-2 items-center">
          <TouchableOpacity onPress={() => setStatusFilter('open')} className={`px-3 py-1.5 rounded-full border ${statusFilter === 'open' ? 'bg-teal-600 border-teal-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
              <Text className={statusFilter === 'open' ? 'text-white font-bold text-xs' : 'text-slate-600 dark:text-slate-400 text-xs'}>Abertas</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStatusFilter('paid')} className={`px-3 py-1.5 rounded-full border ${statusFilter === 'paid' ? 'bg-teal-600 border-teal-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
              <Text className={statusFilter === 'paid' ? 'text-white font-bold text-xs' : 'text-slate-600 dark:text-slate-400 text-xs'}>Pagas</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStatusFilter('all')} className={`px-3 py-1.5 rounded-full border ${statusFilter === 'all' ? 'bg-teal-600 border-teal-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
              <Text className={statusFilter === 'all' ? 'text-white font-bold text-xs' : 'text-slate-600 dark:text-slate-400 text-xs'}>Todas</Text>
          </TouchableOpacity>
          <TextInput 
              value={monthFilter}
              onChangeText={setMonthFilter}
              placeholder="YYYY-MM"
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3 py-1 text-center text-xs font-bold text-slate-800 dark:text-slate-200"
          />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
        ListEmptyComponent={<Text className="text-center text-slate-400 mt-10 text-xs">Nenhuma conta encontrada para o filtro selecionado.</Text>}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-slate-50 dark:bg-slate-950 px-5 pb-4" style={{ paddingTop: Platform.OS === 'android' ? insets.top + 16 : 16 }}>
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-xl font-black text-slate-900 dark:text-white">{editingItem ? 'Editar Conta' : 'Nova Conta a Pagar'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text className="text-teal-600 dark:text-teal-400 font-bold">Cancelar</Text>
                </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Título *</Text>
                <TextInput value={title} onChangeText={setTitle} className="mb-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold" placeholder="Ex: Aluguel ou Fornecedor" placeholderTextColor="#94a3b8" />
                
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Valor *</Text>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" className="mb-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold" placeholder="0,00" placeholderTextColor="#94a3b8" />
                
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Vencimento (YYYY-MM-DD) *</Text>
                <TextInput value={dueDate} onChangeText={setDueDate} className="mb-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold" placeholderTextColor="#94a3b8" />
                
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fornecedor</Text>
                <TextInput value={supplier} onChangeText={setSupplier} className="mb-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-bold" placeholder="Nome do fornecedor" placeholderTextColor="#94a3b8" />

                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Observações</Text>
                <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={3} className="mb-6 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" placeholder="Detalhes adicionais" placeholderTextColor="#94a3b8" />

                <TouchableOpacity onPress={handleSave} className="w-full py-4 bg-teal-600 rounded-xl items-center shadow-md" style={{ backgroundColor: '#0D9488' }}>
                    <Text className="text-white font-black text-sm uppercase tracking-widest">Salvar Conta</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
      </Modal>
    </View>
  );
};
