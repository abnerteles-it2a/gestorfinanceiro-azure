import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { BankAccount } from '../types';
import { useColorScheme } from 'nativewind';
import { parseCurrencyInput, formatCurrencyForInput, formatInputMoney } from '../utils/formatters';

export const RecurrenceFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { recurrence } = route.params as any || {};

  const [label, setLabel] = useState(recurrence?.label || '');
  const [amount, setAmount] = useState(recurrence?.amount ? formatCurrencyForInput(Math.abs(recurrence.amount)) : '');
  const [type, setType] = useState<'Receita' | 'Despesa'>(recurrence?.amount && recurrence.amount < 0 ? 'Despesa' : 'Despesa'); // Default to Despesa
  const [accountId, setAccountId] = useState(recurrence?.account_id || '');
  const [category, setCategory] = useState(recurrence?.category || '');
  const [dayOfMonth, setDayOfMonth] = useState(recurrence?.day_of_month ? String(recurrence.day_of_month) : '1');
  const [businessDayRule, setBusinessDayRule] = useState(recurrence?.business_day_rule || 'exact');
  const [paymentMethod, setPaymentMethod] = useState(recurrence?.payment_method || 'Boleto');
  const [costCenterId, setCostCenterId] = useState(recurrence?.cost_center_id || '');
  const [active, setActive] = useState(recurrence?.active ?? true);
  
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string, icon?: string}[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [costCenters, setCostCenters] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      const data = response.data;
      setAccounts(data.accounts || []);
      setCategories(data.categories || []);
      setCostCenters(data.cost_centers || []);
      setPaymentMethods(data.payment_methods || ['Boleto', 'PIX', 'Cartão de Crédito', 'Débito Automático', 'Dinheiro']);
      
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

  const handleSubmit = async () => {
    if (!label || !amount || !accountId || !category || !dayOfMonth) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }

    const day = parseInt(dayOfMonth, 10);
    if (isNaN(day) || day < 1 || day > 31) {
        Alert.alert('Erro', 'Dia do vencimento inválido (1-31)');
        return;
    }

    try {
      setSubmitting(true);
      
      let finalAmount = parseCurrencyInput(amount);
      if (finalAmount === 0 && amount !== '0' && amount !== '0,00') {
          // If it's 0 but input wasn't explicitly 0, it might be invalid or empty, but we handled empty check before
          // Actually, let's just proceed. 0 is valid for some cases?
      }
      
      if (type === 'Despesa') {
        finalAmount = -Math.abs(finalAmount);
      } else {
        finalAmount = Math.abs(finalAmount);
      }

      const payload = {
        label,
        amount: finalAmount,
        category,
        accountId,
        paymentMethod,
        dayOfMonth: parseInt(dayOfMonth, 10),
        businessDayRule,
        costCenterId,
        active
      };

      if (recurrence?.id) {
        // Edit
        await api.post('/query', {
          type: 'recurrences_update',
          data: {
            id: recurrence.id,
            ...payload
          }
        });
      } else {
        // Create
        await api.post('/query', {
          type: 'recurrences_insert',
          data: payload
        });
      }
      
      Alert.alert('Sucesso', 'Recorrência salva com sucesso');
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Falha ao salvar recorrência');
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
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{recurrence ? 'Editar' : 'Nova'} Recorrência</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
                <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
                <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
            )}
            </TouchableOpacity>
        </View>

        {/* Type Selector */}
        <View className="flex-row bg-gray-200 dark:bg-gray-700 p-1 rounded-lg mb-6">
            {['Receita', 'Despesa'].map((t) => (
            <TouchableOpacity 
                key={t} 
                onPress={() => setType(t as any)}
                className={`flex-1 py-2 items-center rounded-md ${type === t ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
            >
                <Text className={`font-medium ${type === t ? 'text-indigo-600 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{t}</Text>
            </TouchableOpacity>
            ))}
        </View>

        {/* Label */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Título (ex: Aluguel)</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={label}
                onChangeText={setLabel}
                placeholder="Ex: Aluguel, Internet"
                placeholderTextColor="#9ca3af"
            />
        </View>

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

        {/* Day of Month */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Dia do Vencimento</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={dayOfMonth}
                onChangeText={setDayOfMonth}
                keyboardType="numeric"
                maxLength={2}
                placeholder="1-31"
                placeholderTextColor="#9ca3af"
            />
        </View>

        {/* Business Day Rule */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Regra de Dia Útil</Text>
            <View className="flex-row bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {[
                    { key: 'exact', label: 'Dia Exato' },
                    { key: 'previous', label: 'Anterior' },
                    { key: 'next', label: 'Próximo' }
                ].map((rule) => (
                    <TouchableOpacity
                        key={rule.key}
                        onPress={() => setBusinessDayRule(rule.key)}
                        className={`flex-1 py-2 items-center rounded-lg ${businessDayRule === rule.key ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}`}
                    >
                        <Text className={`text-xs font-medium ${businessDayRule === rule.key ? 'text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                            {rule.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
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

        {/* Account */}
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Conta</Text>
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

        {/* Active Switch */}
        <View className="flex-row items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-8">
            <Text className="text-base font-bold text-gray-900 dark:text-white">Recorrência Ativa</Text>
            <Switch
                trackColor={{ false: "#767577", true: "#818cf8" }}
                thumbColor={active ? "#4F46E5" : "#f4f3f4"}
                onValueChange={setActive}
                value={active}
            />
        </View>

      </ScrollView>
    </View>
  );
};
