import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createScopedApi } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { BankAccount } from '../types';
import { useColorScheme } from 'nativewind';
import { parseCurrencyInput, formatCurrencyForInput, formatInputMoney } from '../utils/formatters';

import { VoiceTransactionModal } from '../components/VoiceTransactionModal';

export const TransactionFormScreen = () => {
  const api = useRef(createScopedApi()).current;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { transaction, user, prefilled } = (route.params as any) ?? {};

  const [description, setDescription] = useState(prefilled?.description || transaction?.description || '');
  const [amount, setAmount] = useState(
    prefilled?.amount ? formatCurrencyForInput(Number(prefilled.amount)) : transaction?.amount ? formatCurrencyForInput(transaction.amount) : ''
  );
  const [type, setType] = useState<'Entrada' | 'Saída' | 'Transferência'>(prefilled?.type || transaction?.transaction_type || 'Saída');
  const [accountId, setAccountId] = useState(prefilled?.accountId || transaction?.account_id || '');
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id || '');
  const [category, setCategory] = useState(prefilled?.category || transaction?.category || '');
  const [date, setDate] = useState(prefilled?.date || (transaction?.date ? new Date(transaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]));
  
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string, icon?: string}[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState(prefilled?.paymentMethod || transaction?.payment_method || 'PIX');
  const [costCenters, setCostCenters] = useState<{id: string, name: string}[]>([]);
  const [costCenterId, setCostCenterId] = useState(transaction?.cost_center_id || '');
  const [isBusinessRevenue, setIsBusinessRevenue] = useState(!!transaction?.is_business_revenue);
  const [isBusinessExpense, setIsBusinessExpense] = useState(!!transaction?.is_business_expense);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accRes] = await Promise.all([
        api.get('/bootstrap'), 
      ]);
      
      const data = accRes.data;
      setAccounts(data.accounts || []);
      setCategories(data.categories || []);
      setCostCenters(data.cost_centers || []);
      setPaymentMethods(data.payment_methods || ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência']);
      
      if (!accountId && data.accounts.length > 0) {
        setAccountId(data.accounts[0].id);
      }
      if (!category && data.categories.length > 0) {
        setCategory(data.categories[0].name);
      }

    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir esta transação?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);
              await api.post('/query', {
                type: 'transactions_delete',
                data: { id: transaction.id }
              });
              Alert.alert('Sucesso', 'Transação excluída com sucesso');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir transação');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const handleSubmit = async () => {
    if (!description || !amount || !accountId || !category) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        description,
        amount: parseCurrencyInput(amount),
        transactionType: type,
        accountId: accountId,
        toAccountId: type === 'Transferência' ? toAccountId : null,category,
        paymentMethod,
        costCenterId,
        isBusinessRevenue: type === 'Entrada' && isBusinessRevenue,
        isBusinessExpense: type === 'Saída' && isBusinessExpense,
        date,
        // userId is handled by token on backend
      };

      if (transaction?.id) {
        // Edit
        await api.post('/query', {
          type: 'transactions_update',
          data: {
            id: transaction.id,
            ...payload
          }
        });
      } else {
        // Create
        await api.post('/query', {
          type: 'transactions_insert',
          data: payload
        });
      }
      
      Alert.alert('Sucesso', 'Transação salva com sucesso');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Falha ao salvar transação');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-gray-900"><ActivityIndicator size="large" color="#4F46E5" /></View>;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row justify-between items-center mb-6 mt-2">
            <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={colorScheme === 'dark' ? '#fff' : '#374151'} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{transaction ? 'Editar' : 'Nova'} Transação</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
                <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
                <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
            )}
            </TouchableOpacity>
        </View>

        {/* Type Selector */}
        <View className="flex-row bg-gray-200 dark:bg-gray-700 p-1 rounded-lg mb-4">
            {['Entrada', 'Saída', 'Transferência'].map((t) => (
            <TouchableOpacity 
                key={t} 
                onPress={() => setType(t as any)}
                className={`flex-1 py-2 items-center rounded-md ${type === t ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
            >
                <Text className={`font-medium ${type === t ? 'text-indigo-600 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{t}</Text>
            </TouchableOpacity>
            ))}
        </View>

        {/* Botão de Preenchimento por Voz & IA */}
        <TouchableOpacity
            onPress={() => setVoiceModalOpen(true)}
            className="flex-row items-center justify-center gap-2 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 p-3 rounded-2xl mb-5 shadow-sm"
        >
            <Ionicons name="mic" size={18} color="#0D9488" />
            <Text className="text-teal-800 dark:text-teal-300 font-black text-xs uppercase tracking-wider">
                Preencher com Comando de Voz / IA
            </Text>
        </TouchableOpacity>

        {/* Amount */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Valor</Text>
            <View className="flex-row items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <Text className="text-2xl font-bold text-gray-400 mr-2">R$</Text>
                <TextInput 
                    className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={(t) => setAmount(formatInputMoney(t))}
                    placeholder="0,00"
                    placeholderTextColor="#9ca3af"
                />
            </View>
        </View>

        {/* Description */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Descrição</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={description}
                onChangeText={setDescription}
                placeholder="Ex: Supermercado"
                placeholderTextColor="#9ca3af"
            />
        </View>

        {/* Category */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {categories.map(cat => (
                    <TouchableOpacity 
                        key={cat.id} 
                        onPress={() => setCategory(cat.name)}
                        className={`px-4 py-2 rounded-full border mr-2 ${category === cat.name ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Text className={category === cat.name ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>
                            {cat.icon && !/^[a-z0-9-]+$/.test(cat.icon) ? cat.icon + ' ' : ''}{cat.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        {/* Payment Method */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Forma de Pagamento</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {paymentMethods.map(pm => (
                    <TouchableOpacity 
                        key={pm} 
                        onPress={() => setPaymentMethod(pm)}
                        className={`px-4 py-2 rounded-full border mr-2 ${paymentMethod === pm ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Text className={paymentMethod === pm ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{pm}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        {/* Cost Center */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Centro de Custo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                <TouchableOpacity 
                    onPress={() => setCostCenterId('')}
                    className={`px-4 py-2 rounded-full border mr-2 ${costCenterId === '' ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                >
                    <Text className={costCenterId === '' ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>Nenhum</Text>
                </TouchableOpacity>
                {costCenters.map(cc => (
                    <TouchableOpacity 
                        key={cc.id} 
                        onPress={() => setCostCenterId(cc.id)}
                        className={`px-4 py-2 rounded-full border mr-2 ${costCenterId === cc.id ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Text className={costCenterId === cc.id ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{cc.name}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        {type === 'Entrada' && (
          <TouchableOpacity onPress={() => setIsBusinessRevenue(value => !value)} className="mb-5 flex-row items-center">
            <Ionicons name={isBusinessRevenue ? 'checkbox' : 'square-outline'} size={22} color="#0D9488" />
            <Text className="ml-2 text-sm text-gray-700 dark:text-gray-300">Receita empresarial (compõe faturamento MEI)</Text>
          </TouchableOpacity>
        )}
        {type === 'Saída' && (
          <TouchableOpacity onPress={() => setIsBusinessExpense(value => !value)} className="mb-5 flex-row items-center">
            <Ionicons name={isBusinessExpense ? 'checkbox' : 'square-outline'} size={22} color="#0D9488" />
            <Text className="ml-2 text-sm text-gray-700 dark:text-gray-300">Despesa empresarial (considerar no resultado MEI)</Text>
          </TouchableOpacity>
        )}

        {/* Account */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{type === 'Transferência' ? 'Conta Origem' : 'Conta'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {accounts.map(acc => (
                    <TouchableOpacity 
                        key={acc.id} 
                        onPress={() => setAccountId(acc.id)}
                        className={`px-4 py-2 rounded-full border mr-2 ${accountId === acc.id ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Text className={accountId === acc.id ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{acc.name}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        {/* To Account (Transfer) */}
        {type === 'Transferência' && (
            <View className="mb-5">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Conta Destino</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {accounts.map(acc => (
                        <TouchableOpacity 
                            key={acc.id} 
                            onPress={() => setToAccountId(acc.id)}
                            className={`px-4 py-2 rounded-full border mr-2 ${toAccountId === acc.id ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                        >
                            <Text className={toAccountId === acc.id ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{acc.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        )}

        {/* Date */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Data</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
            />
        </View>

        {transaction && (
            <TouchableOpacity 
                onPress={handleDelete}
                className="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl items-center border border-red-200 dark:border-red-800 mt-4 mb-8"
            >
                <Text className="text-red-600 dark:text-red-400 font-bold text-lg">Excluir Transação</Text>
            </TouchableOpacity>
        )}

      </ScrollView>

      <VoiceTransactionModal 
        visible={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onNavigateToForm={(prefilledData) => {
          if (prefilledData.description) setDescription(prefilledData.description);
          if (prefilledData.amount) setAmount(formatCurrencyForInput(Number(prefilledData.amount)));
          if (prefilledData.type) setType(prefilledData.type);
          if (prefilledData.category) setCategory(prefilledData.category);
          if (prefilledData.accountId) setAccountId(prefilledData.accountId);
          if (prefilledData.paymentMethod) setPaymentMethod(prefilledData.paymentMethod);
          if (prefilledData.date) setDate(prefilledData.date);
        }}
      />
    </View>
  );
};
