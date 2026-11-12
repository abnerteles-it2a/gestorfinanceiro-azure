import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useColorScheme } from 'nativewind';
import { Recurrence } from '../types';

export const RecurrencesScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      // The bootstrap endpoint returns 'recurrences'
      setRecurrences(response.data.recurrences || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar as recorrências.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleDelete = (id: string) => {
    Alert.alert(
      'Excluir Recorrência',
      'Tem certeza que deseja excluir esta recorrência?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/query', {
                type: 'recurrences_delete',
                data: { id }
              });
              Alert.alert('Sucesso', 'Recorrência excluída com sucesso.');
              fetchData();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir recorrência.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Recurrence }) => (
    <TouchableOpacity 
        onPress={() => navigation.navigate('RecurrenceForm', { recurrence: item })}
        className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-700 flex-row items-center justify-between"
    >
        <View className="flex-1">
            <View className="flex-row items-center mb-1">
                <View className={`w-2 h-2 rounded-full mr-2 ${item.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                <Text className="font-bold text-gray-800 dark:text-white text-lg">{item.label}</Text>
            </View>
            <View className="flex-row items-center">
                <Text className="text-gray-500 dark:text-gray-400 text-sm mr-3">
                    {Number(item.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-xs">
                    Dia {item.dayOfMonth}
                </Text>
            </View>
            {item.category && (
                <Text className="text-gray-400 dark:text-gray-500 text-xs mt-1">{item.category}</Text>
            )}
        </View>
        <TouchableOpacity 
            onPress={() => handleDelete(item.id)}
            className="p-2"
        >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
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
                <Text className="text-xl font-bold text-gray-800 dark:text-white">Recorrências (MEI)</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Gerencie contas fixas e assinaturas</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('RecurrenceForm')}>
            <Ionicons name="add-circle" size={32} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
            data={recurrences}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
            ListEmptyComponent={<Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhuma recorrência encontrada.</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}
    </View>
  );
};
