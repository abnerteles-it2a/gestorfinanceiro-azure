import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createScopedApi, financialScope, sendMobileInvestmentDisposal } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFinancialData } from '../context/FinancialDataContext';
import { createInvestmentOperationController } from '../../utils/investmentOperationClient';
import type { InvestmentDisposalRequest } from '../../types';
import { buildMobileDisposal, parseInvestmentDecimal } from '../utils/investmentDisposal';
import { assertDateOnly } from '../../utils/creditCard';
import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo-modules-core';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { BankAccount } from '../types';
import { parseCurrencyInput, formatCurrencyForInput, formatInputMoney } from '../utils/formatters';

export const InvestmentFormScreen = () => {
  const api = useRef(createScopedApi()).current;
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  
  const { investment } = route.params as any || {};
  const { user } = useAuth();
  const { refreshData } = useFinancialData();
  const originScope = useRef(financialScope.snapshot()).current;
  const storageKey = `investment-disposal-${user?.id}-${originScope.viewMode}`;
  const refreshRef = useRef(refreshData);
  refreshRef.current = refreshData;
  const pendingRef = useRef<InvestmentDisposalRequest | null>(null);
  const [pending, setPending] = useState<InvestmentDisposalRequest | null>(null);
  const busy = useRef(false);
  const controller = useRef(createInvestmentOperationController({
    execute: request => sendMobileInvestmentDisposal(request, originScope),
    reconcile: () => refreshRef.current(),
    isCurrent: () => financialScope.isCurrent(originScope),
    isRemote: () => !!originScope.token,
  })).current;

  const [ticker, setTicker] = useState(investment?.ticker || '');
  const [type, setType] = useState(investment?.type || 'Ações');
  const [operationType, setOperationType] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState(investment?.quantity != null ? String(investment.quantity).replace('.', ',') : '');
  const [price, setPrice] = useState((investment?.purchasePrice ?? investment?.purchase_price) != null ? formatCurrencyForInput(investment.purchasePrice ?? investment.purchase_price) : '');
  const [date, setDate] = useState((investment?.purchaseDate ?? investment?.purchase_date) ? new Date(investment.purchaseDate ?? investment.purchase_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [costCenters, setCostCenters] = useState<{id: string, name: string}[]>([]);
  const [costCenterId, setCostCenterId] = useState('');
  const [categories, setCategories] = useState<{id: string, name: string, type: string}[]>([]);
  const [category, setCategory] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [loadingData, setLoadingData] = useState(true);
  const [storageReady, setStorageReady] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stored = await SecureStore.getItemAsync(storageKey);
        if (!financialScope.isCurrent(originScope)) return;
        if (stored) {
          const request = JSON.parse(stored) as InvestmentDisposalRequest;
          if (!request.operationId || !['variable', 'fixed'].includes(request.kind)) throw new Error('Operação preservada inválida; não inicie outra venda.');
          pendingRef.current = request; setPending(request); setOperationType('sell');
        }
        setStorageReady(true);
        const response = await api.get('/bootstrap', { headers: { Authorization: `Bearer ${originScope.token}`, 'x-view-mode': originScope.viewMode } });
        setAccounts(response.data.accounts || []);
        setCostCenters(response.data.cost_centers || []);
        setCategories(response.data.categories || []);
        setPaymentMethods(response.data.payment_methods || ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência']);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        if (financialScope.isCurrent(originScope)) setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (busy.current || deleting || loadingData || !storageReady) return;
    if (!financialScope.isCurrent(originScope)) { Alert.alert('Visão alterada', 'Reabra o formulário na visão original.'); return; }
    if (operationType === 'sell' || pendingRef.current) {
      busy.current = true; setSubmitting(true);
      try {
        let request = pendingRef.current;
        if (!request) {
          if (investment?.id) throw new Error('Edição de lote não é venda. Abra uma nova operação.');
          const q = parseInvestmentDecimal(quantity);
          const unitPrice = parseCurrencyInput(price);
          const config = { headers: { Authorization: `Bearer ${originScope.token}`, 'x-view-mode': originScope.viewMode } };
          const response = await api.get('/bootstrap', config);
          if (!financialScope.isCurrent(originScope)) throw new Error('Visão alterada.');
          if (!Array.isArray(response.data.investments)) throw new Error('Posição completa indisponível.');
          request = buildMobileDisposal({ operationId: uuid.v4(), ticker, assetType: type, date, quantity: q, unitPrice,
            lots: response.data.investments.map((lot: any) => ({ ...lot, quantity: Number(lot.quantity), purchaseDate: String(lot.purchase_date).slice(0, 10) })),
            cash: { amount: 0, accountId, category, paymentMethod, costCenterId: costCenterId || undefined, description: `Venda de ${ticker.trim().toUpperCase()} (${q} un.)` } });
          // Persist before sending: timeout, app close and retry must use the same id AND payload.
          await SecureStore.setItemAsync(storageKey, JSON.stringify(request));
          pendingRef.current = request; setPending(request);
        }
        const result = await controller.submit(request);
        if (result.status === 'success' || (result.status === 'error' && result.rejected)) {
          await SecureStore.deleteItemAsync(storageKey);
          pendingRef.current = null; setPending(null);
        }
        if (result.status === 'success') { Alert.alert('Sucesso', 'Venda confirmada e posição reconciliada.'); navigation.goBack(); }
        else Alert.alert(result.committed ? 'Venda confirmada; atualização pendente' : 'Operação não concluída', result.message + '\nEm resultado incerto, use Salvar para consultar/repetir a mesma operação, sem alterar os dados.');
      } catch (error: any) { Alert.alert('Venda pendente ou inválida', error.message); }
      finally { busy.current = false; setSubmitting(false); }
      return;
    }
    if (!ticker || !quantity || !price) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios.');
      return;
    }

    if (!investment?.id && !accountId) {
        Alert.alert('Erro', 'Selecione uma conta para débito.');
        return;
    }

    if (!investment?.id && !category) {
        Alert.alert('Erro', 'Selecione uma categoria para o lançamento.');
        return;
    }

    try {
      busy.current = true;
      setSubmitting(true);
      assertDateOnly(date);
      const parsedQuantity = parseInvestmentDecimal(quantity);
      if (!(parseCurrencyInput(price) > 0)) throw new Error('Preço deve ser positivo.');
      if (investment?.id && (parsedQuantity !== Number(investment.quantity) || ticker.trim().toUpperCase() !== investment.ticker.toUpperCase() || type !== investment.type)) throw new Error('Não altere instrumento ou quantidade na edição; use uma nova compra ou venda FIFO.');
      const payload = {
        ticker,
        type,
        operationType,
        quantity: parsedQuantity,
        purchasePrice: parseCurrencyInput(price),
        purchaseDate: date,
        accountId,
        costCenterId,
        category,
        paymentMethod
      };

      if (investment?.id) {
        // Update
        // Do not write a stale quantity back after a concurrent FIFO sale.
        await api.post('/query', {
          type: 'investments_update',
          data: {
            id: investment.id,
            purchasePrice: payload.purchasePrice,
            purchaseDate: payload.purchaseDate,
          }
        });
      } else {
        // Insert Investment
        await api.post('/query', {
          type: 'investments_insert',
          data: payload
        });

        // Insert Transaction for Cash Flow
        const totalAmount = Math.round(parsedQuantity * parseCurrencyInput(price) * 100) / 100;
        const transactionType = 'Saída';
        const description = `Compra de ${ticker} (${quantity} un.)`;

        await api.post('/query', {
            type: 'transactions_insert',
            data: {
                description,
                amount: totalAmount,
                transactionType,
                accountId,
                category,
                paymentMethod,
                costCenterId: costCenterId || null,
                date
            }
        });
      }
      
      Alert.alert('Sucesso', `Investimento ${investment?.id ? 'atualizado' : 'adicionado'} com sucesso!`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', `Falha ao ${investment?.id ? 'atualizar' : 'adicionar'} investimento.`);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (pendingRef.current || busy.current || !financialScope.isCurrent(originScope)) return;
    Alert.alert(
      'Confirmar exclusão',
      'Exclusão cadastral não é venda, não gera caixa nem estorno. Para vender, use Nova operação > Venda. Excluir este lote?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.post('/query', {
                type: 'investments_delete',
                data: { id: investment.id }
              });
              Alert.alert('Sucesso', 'Investimento excluído com sucesso!');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir investimento.');
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row justify-between items-center mb-6 mt-2">
            <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={24} color={colorScheme === 'dark' ? '#fff' : '#374151'} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{investment ? 'Editar Investimento' : 'Novo Investimento'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting || loadingData || !storageReady}>
                {submitting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
                )}
            </TouchableOpacity>
        </View>

        {!loadingData && !storageReady && <Text className="text-red-600 mb-4">Não foi possível recuperar operações pendentes. Feche e reabra; novas operações estão bloqueadas.</Text>}
        {pending && <Text className="text-amber-700 mb-4">Operação {pending.operationId} preservada: {pending.kind === 'variable' ? `${pending.ticker ?? pending.assetId} — ${pending.quantity} un.` : `Resgate ${pending.assetId}`} em {pending.date}; caixa {pending.cash ? formatCurrencyForInput(pending.cash.amount) : 'sem lançamento'}. Dados bloqueados; Salvar repete a mesma operação e reconcilia após confirmação.</Text>}
        {investment?.id && <Text className="text-amber-700 mb-4">Edição de preço/data de lote, não quantidade, venda nem estorno de caixa. Para vender, abra Nova operação.</Text>}
        <View pointerEvents={pending || submitting ? 'none' : 'auto'}>
        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Operação</Text>
            <View className="flex-row bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                <TouchableOpacity 
                    disabled={!!pending || submitting}
                    onPress={() => { setCategory(''); setOperationType('buy'); }}
                    className={`flex-1 py-2 items-center rounded-md ${operationType === 'buy' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
                >
                    <Text className={`font-medium ${operationType === 'buy' ? 'text-indigo-600 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>Compra</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    disabled={!!investment?.id || !!pending || submitting}
                    onPress={() => { setCategory(''); setOperationType('sell'); }}
                    className={`flex-1 py-2 items-center rounded-md ${operationType === 'sell' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
                >
                    <Text className={`font-medium ${operationType === 'sell' ? 'text-indigo-600 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>Venda</Text>
                </TouchableOpacity>
            </View>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Tipo de Ativo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {['Ações', 'FIIs', 'Criptomoeda', 'Cripto', 'Stocks', 'ETF'].map(t => (
                    <TouchableOpacity 
                        key={t}
                        disabled={!!investment?.id}
                        onPress={() => setType(t)}
                        className={`px-4 py-2 rounded-full border mr-2 ${type === t ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Text className={type === t ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{t}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Código (Ticker)</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white uppercase"
                value={ticker}
                editable={!investment?.id}
                onChangeText={t => setTicker(t.toUpperCase())}
                placeholder="Ex: PETR4"
                placeholderTextColor="#9ca3af"
            />
        </View>

        <View className="flex-row justify-between">
            <View className="mb-5 flex-1 mr-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Quantidade</Text>
                <TextInput 
                    className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                    value={quantity}
                    editable={!investment?.id}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                />
            </View>

            <View className="mb-5 flex-1 ml-2">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Preço Unitário</Text>
                <TextInput 
                    className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                    value={price}
                    onChangeText={(t) => setPrice(formatInputMoney(t))}
                    keyboardType="numeric"
                    placeholder="0,00"
                    placeholderTextColor="#9ca3af"
                />
            </View>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{operationType === 'sell' ? 'Data da Venda' : 'Data da Compra'}</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
            />
        </View>

        {!investment?.id && (
            <View className="mb-5">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">{operationType === 'sell' ? 'Conta de Crédito' : 'Conta de Débito'}</Text>
                {loadingData ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {accounts.map(acc => (
                            <TouchableOpacity 
                                key={acc.id} 
                                onPress={() => setAccountId(acc.id)}
                                className={`px-4 py-3 rounded-xl border mr-3 min-w-[120px] ${accountId === acc.id ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                            >
                                <Text className={`font-bold mb-1 ${accountId === acc.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-white'}`}>{acc.name}</Text>
                                <Text className="text-xs text-gray-500 dark:text-gray-400">{acc.bank}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>
        )}

        {!investment?.id && costCenters.length > 0 && (
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
        )}

        {/* Payment Method */}
        {!investment?.id && (
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
        )}

        {!investment?.id && (
             <View className="mb-5">
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {categories.filter(c => c.type === (operationType === 'buy' ? 'Saída' : 'Entrada')).map(cat => (
                        <TouchableOpacity 
                            key={cat.id} 
                            onPress={() => setCategory(cat.name)}
                            className={`px-4 py-2 rounded-full border mr-2 ${category === cat.name ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 dark:border-indigo-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                        >
                            <Text className={category === cat.name ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'}>{cat.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        )}

        {investment?.id && (
            <TouchableOpacity 
                onPress={handleDelete}
                disabled={deleting}
                className="mt-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl items-center border border-red-100 dark:border-red-800"
            >
                {deleting ? (
                    <ActivityIndicator color="#ef4444" />
                ) : (
                    <Text className="text-red-600 dark:text-red-400 font-bold">Excluir Investimento</Text>
                )}
            </TouchableOpacity>
        )}

        </View>
      </ScrollView>
    </View>
  );
};
