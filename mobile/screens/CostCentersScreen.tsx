import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useColorScheme } from 'nativewind';

interface CostCenter {
    id: string;
    name: string;
}

export const CostCentersScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      setCostCenters(response.data.cost_centers || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar os centros de custo.');
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
      'Excluir Centro de Custo',
      'Tem certeza que deseja excluir este centro de custo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/query', {
                type: 'cost_centers_delete',
                data: { id }
              });
              Alert.alert('Sucesso', 'Centro de custo excluído com sucesso.');
              fetchData();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir centro de custo.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: CostCenter }) => (
    <TouchableOpacity 
        onPress={() => navigation.navigate('CostCenterForm', { costCenter: item })}
        className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-700 flex-row items-center justify-between"
    >
        <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-full items-center justify-center mr-4">
                <Ionicons name="business-outline" size={20} color={colorScheme === 'dark' ? '#818cf8' : '#4F46E5'} />
            </View>
            <View>
                <Text className="font-bold text-gray-800 dark:text-white text-lg">{item.name}</Text>
            </View>
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
                <Text className="text-xl font-bold text-gray-800 dark:text-white">Centros de Custo</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Gerencie seus centros de custo</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('CostCenterForm')}>
            <Ionicons name="add-circle" size={32} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
            data={costCenters}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
            ListEmptyComponent={<Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhum centro de custo encontrado.</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}
    </View>
  );
};
