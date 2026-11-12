import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { parseCurrencyInput, formatCurrencyForInput, formatInputMoney } from '../utils/formatters';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

export const AccountFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  
  const { account } = route.params as any || {};

  const [name, setName] = useState(account?.name || '');
  const [bank, setBank] = useState(account?.bank || '');
  const [initialBalance, setInitialBalance] = useState(account?.initial_balance ? formatCurrencyForInput(account.initial_balance) : '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !bank) {
      Alert.alert('Erro', 'Preencha o nome e o banco.');
      return;
    }

    try {
      setSubmitting(true);
      
      const payload = {
        name,
        bank,
        initialBalance: parseCurrencyInput(initialBalance)
      };

      if (account?.id) {
        // Update
        await api.post('/query', {
          type: 'accounts_update',
          data: {
            id: account.id,
            ...payload
          }
        });
      } else {
        // Insert
        await api.post('/query', {
          type: 'accounts_insert',
          data: {
            ...payload,
            current_balance: payload.initialBalance // Set current balance same as initial for new accounts
          }
        });
      }
      
      Alert.alert('Sucesso', `Conta ${account?.id ? 'atualizada' : 'criada'} com sucesso!`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', `Falha ao ${account?.id ? 'atualizar' : 'criar'} conta.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta conta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.post('/query', {
                type: 'accounts_delete',
                data: { id: account.id }
              });
              Alert.alert('Sucesso', 'Conta excluída com sucesso!');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir conta.');
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
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{account?.id ? 'Editar Conta' : 'Nova Conta'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
                )}
            </TouchableOpacity>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Nome da Conta</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={name}
                onChangeText={setName}
                placeholder="Ex: Conta Corrente"
                placeholderTextColor="#9ca3af"
            />
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Banco / Instituição</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={bank}
                onChangeText={setBank}
                placeholder="Ex: Nubank, Itaú"
                placeholderTextColor="#9ca3af"
            />
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Saldo Inicial</Text>
            <View className="flex-row items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <Text className="text-2xl font-bold text-gray-400 mr-2">R$</Text>
                <TextInput 
                    className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
                    keyboardType="numeric"
                    value={initialBalance}
                    onChangeText={(t) => setInitialBalance(formatInputMoney(t))}
                    placeholder="0,00"
                    placeholderTextColor="#9ca3af"
                />
            </View>
        </View>

        {account?.id && (
            <TouchableOpacity 
                onPress={handleDelete}
                disabled={deleting}
                className="mt-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl items-center border border-red-100 dark:border-red-800"
            >
                {deleting ? (
                    <ActivityIndicator color="#ef4444" />
                ) : (
                    <Text className="text-red-600 dark:text-red-400 font-bold">Excluir Conta</Text>
                )}
            </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
};
