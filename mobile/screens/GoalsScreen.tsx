import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../utils/formatters';
import { api } from '../services/api';
import { Goal } from '../types';
import { useColorScheme } from 'nativewind';

export const GoalsScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      setGoals(response.data.goals || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar as metas.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const renderItem = ({ item }: { item: Goal }) => {
    const progress = Math.min(1, Number(item.currentAmount) / Number(item.targetAmount));
    const percentage = Math.round(progress * 100);

    return (
        <TouchableOpacity 
            onPress={() => navigation.navigate('GoalForm', { goal: item })}
            className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-4 shadow-sm border border-gray-100 dark:border-gray-700"
        >
            <View className="flex-row justify-between items-center mb-2">
                <Text className="font-bold text-gray-800 dark:text-white text-lg">{item.name}</Text>
                <Text className="text-gray-500 dark:text-gray-400 font-medium">{percentage}%</Text>
            </View>
            <View className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                <View 
                    className="h-full rounded-full" 
                    style={{ width: `${percentage}%`, backgroundColor: item.color || '#4F46E5' }} 
                />
            </View>
            <View className="flex-row justify-between">
                <Text className="text-gray-500 dark:text-gray-400 text-sm">Atual: {formatCurrency(Number(item.currentAmount))}</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-sm">Meta: {formatCurrency(Number(item.targetAmount))}</Text>
            </View>
        </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 shadow-sm mb-4 border-b border-gray-100 dark:border-gray-700">
        <View className="flex-row items-center">
            <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
                <Ionicons name="arrow-back" size={24} color={colorScheme === 'dark' ? '#fff' : '#374151'} />
            </TouchableOpacity>
            <View>
                <Text className="text-xl font-bold text-gray-800 dark:text-white">Metas Financeiras</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Acompanhe suas metas</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('GoalForm')}>
            <Ionicons name="add-circle" size={32} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
            data={goals}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
            ListEmptyComponent={<Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhuma meta encontrada.</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}
    </View>
  );
};
