import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { parseCurrencyInput, formatCurrencyForInput, formatInputMoney } from '../utils/formatters';

export const GoalFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  const { goal } = route.params as any || {};
  
  const [name, setName] = useState(goal?.name || '');
  const [targetAmount, setTargetAmount] = useState(goal?.target_amount ? formatCurrencyForInput(goal.target_amount) : '');
  const [currentAmount, setCurrentAmount] = useState(goal?.current_amount ? formatCurrencyForInput(goal.current_amount) : '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!name || !targetAmount) {
      Alert.alert('Erro', 'Preencha o nome e a meta.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name,
        targetAmount: parseCurrencyInput(targetAmount),
        currentAmount: parseCurrencyInput(currentAmount),
        color: goal?.color || '#4F46E5' // Default color
      };

      if (goal?.id) {
        // Update
        await api.post('/query', {
          type: 'goals_update',
          data: {
            id: goal.id,
            ...payload
          }
        });
      } else {
        // Insert
        await api.post('/query', {
          type: 'goals_insert',
          data: payload
        });
      }
      
      Alert.alert('Sucesso', `Meta ${goal?.id ? 'atualizada' : 'criada'} com sucesso!`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', `Falha ao ${goal?.id ? 'atualizar' : 'criar'} meta.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta meta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.post('/query', {
                type: 'goals_delete',
                data: { id: goal.id }
              });
              Alert.alert('Sucesso', 'Meta excluída com sucesso!');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir meta.');
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
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{goal ? 'Editar Meta' : 'Nova Meta'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
                )}
            </TouchableOpacity>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Nome da Meta</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={name}
                onChangeText={setName}
                placeholder="Ex: Viagem, Carro Novo"
                placeholderTextColor="#9ca3af"
            />
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Valor Alvo (Meta)</Text>
            <View className="flex-row items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <Text className="text-2xl font-bold text-gray-400 mr-2">R$</Text>
                <TextInput 
                    className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
                    keyboardType="numeric"
                    value={targetAmount}
                    onChangeText={(t) => setTargetAmount(formatInputMoney(t))}
                    placeholder="0,00"
                    placeholderTextColor="#9ca3af"
                />
            </View>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Já economizado (Opcional)</Text>
            <View className="flex-row items-center bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <Text className="text-2xl font-bold text-gray-400 mr-2">R$</Text>
                <TextInput 
                    className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
                    keyboardType="numeric"
                    value={currentAmount}
                    onChangeText={(t) => setCurrentAmount(formatInputMoney(t))}
                    placeholder="0,00"
                    placeholderTextColor="#9ca3af"
                />
            </View>
        </View>

        {goal?.id && (
            <TouchableOpacity 
                onPress={handleDelete}
                disabled={deleting}
                className="mt-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl items-center border border-red-100 dark:border-red-800"
            >
                {deleting ? (
                    <ActivityIndicator color="#ef4444" />
                ) : (
                    <Text className="text-red-600 dark:text-red-400 font-bold">Excluir Meta</Text>
                )}
            </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
};
