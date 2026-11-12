import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

export const CostCenterFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  
  const { costCenter } = route.params as any || {};

  const [name, setName] = useState(costCenter?.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!name) {
      Alert.alert('Erro', 'Preencha o nome do centro de custo.');
      return;
    }

    try {
      setSubmitting(true);
      
      const payload = {
        name
      };

      if (costCenter?.id) {
        // Update
        await api.post('/query', {
          type: 'cost_centers_update',
          data: {
            id: costCenter.id,
            ...payload
          }
        });
      } else {
        // Insert
        await api.post('/query', {
          type: 'cost_centers_insert',
          data: payload
        });
      }
      
      Alert.alert('Sucesso', `Centro de custo ${costCenter?.id ? 'atualizado' : 'criado'} com sucesso!`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', `Falha ao ${costCenter?.id ? 'atualizar' : 'criar'} centro de custo.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir este centro de custo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.post('/query', {
                type: 'cost_centers_delete',
                data: { id: costCenter.id }
              });
              Alert.alert('Sucesso', 'Centro de custo excluído com sucesso!');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir centro de custo.');
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
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{costCenter?.id ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
                )}
            </TouchableOpacity>
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Nome do Centro de Custo</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={name}
                onChangeText={setName}
                placeholder="Ex: Pessoal, Trabalho, Projeto X"
                placeholderTextColor="#9ca3af"
            />
        </View>

        {costCenter?.id && (
            <TouchableOpacity 
                onPress={handleDelete} 
                disabled={deleting}
                className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900 items-center mt-4"
            >
                {deleting ? (
                    <ActivityIndicator color="#dc2626" />
                ) : (
                    <Text className="text-red-600 dark:text-red-400 font-bold">Excluir Centro de Custo</Text>
                )}
            </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
};
