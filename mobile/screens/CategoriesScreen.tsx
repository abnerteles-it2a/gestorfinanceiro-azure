import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useColorScheme } from 'nativewind';

interface Category {
    id: string;
    name: string;
    icon?: string;
    type?: string;
}

export const CategoriesScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar as categorias.');
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
      'Excluir Categoria',
      'Tem certeza que deseja excluir esta categoria?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/query', {
                type: 'categories_delete',
                data: { id }
              });
              Alert.alert('Sucesso', 'Categoria excluída com sucesso.');
              fetchData();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir categoria.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Category }) => (
    <TouchableOpacity 
        onPress={() => navigation.navigate('CategoryForm', { category: item })}
        className="bg-white dark:bg-gray-800 p-4 rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-700 flex-row items-center justify-between"
    >
        <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-full items-center justify-center mr-4">
                {item.icon && !/^[a-z0-9-]+$/.test(item.icon) ? (
                    <Text className="text-xl">{item.icon}</Text>
                ) : (
                    <Ionicons name={(item.icon as any) || "grid-outline"} size={20} color={colorScheme === 'dark' ? '#818cf8' : '#4F46E5'} />
                )}
            </View>
            <View>
                <Text className="font-bold text-gray-800 dark:text-white text-lg">{item.name}</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-xs">{item.type || 'Geral'}</Text>
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
                <Text className="text-xl font-bold text-gray-800 dark:text-white">Categorias</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Gerencie categorias de lançamentos</Text>
            </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('CategoryForm')}>
            <Ionicons name="add-circle" size={32} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colorScheme === 'dark' ? '#fff' : '#000'} />}
            ListEmptyComponent={<Text className="text-center text-gray-500 dark:text-gray-400 mt-10">Nenhuma categoria encontrada.</Text>}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}
    </View>
  );
};
