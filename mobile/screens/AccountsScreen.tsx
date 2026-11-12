import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { formatCurrency } from '../utils/formatters';
import { api } from '../services/api';
import { BankAccount } from '../types';

export const AccountsScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [user, setUser] = useState<any>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap'); 
      const rawAccounts = response.data.accounts || [];
      // Clean accounts
      const cleanAccounts = rawAccounts.map((acc: any) => {
          let current = Number(acc.current_balance);
          // Only fallback to initial if current is truly invalid (NaN), not just 0
          if (isNaN(current)) {
              current = Number(acc.initial_balance) || 0;
          }
          return {
              ...acc,
              currentBalance: current
          };
      });
      setAccounts(cleanAccounts);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar as contas.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Excluir Conta',
      'Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/query', {
                type: 'accounts_delete',
                data: { id }
              });
              Alert.alert('Sucesso', 'Conta excluída com sucesso.');
              fetchAccounts();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir conta.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: BankAccount }) => (
    <TouchableOpacity 
        onPress={() => navigation.navigate('AccountForm', { account: item })}
        className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-700 flex-row justify-between items-center"
    >
        <View className="flex-1">
            <Text className="font-bold text-gray-800 dark:text-white text-lg">{item.name}</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-sm">{item.bank}</Text>
        </View>
        <View className="items-end">
            <Text className="text-gray-900 dark:text-white font-bold text-lg">{formatCurrency(Number(item.currentBalance))}</Text>
            <Text className={`text-xs font-medium ${Number(item.currentBalance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Number(item.currentBalance) >= 0 ? 'Saldo Positivo' : 'Saldo Negativo'}
            </Text>
            <TouchableOpacity  
                onPress={() => handleDelete(item.id)}
                className="mt-2 p-2"
            >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
        </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 shadow-sm mb-4">
        <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
                <Ionicons name="arrow-back" size={24} color={colorScheme === 'dark' ? '#e5e7eb' : '#374151'} />
            </TouchableOpacity>
            <View>
                <Text className="text-xl font-bold text-gray-800 dark:text-white">Minhas Contas</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Gerencie suas contas bancárias</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('AccountForm')}>
            <Ionicons name="add-circle" size={32} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAccounts} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
            ListEmptyComponent={<Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhuma conta encontrada.</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}
    </View>
  );
};

