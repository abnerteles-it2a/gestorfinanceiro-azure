import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

export const CategoryFormScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  
  const { category } = route.params as any || {};

  const [name, setName] = useState(category?.name || '');
  const [type, setType] = useState<'Entrada' | 'Saída'>(category?.type || 'Saída');
  const [icon, setIcon] = useState(category?.icon || '🏷️');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const AVAILABLE_ICONS = [
    { emoji: '🛒', label: 'Supermercado' },
    { emoji: '🍽️', label: 'Restaurante / Alimentação' },
    { emoji: '☕', label: 'Café / Padaria' },
    { emoji: '🍕', label: 'Delivery' },
    { emoji: '🥗', label: 'Comida Saudável' },
    { emoji: '🚗', label: 'Transporte' },
    { emoji: '🚌', label: 'Transporte Público' },
    { emoji: '⛽', label: 'Combustível' },
    { emoji: '🅿️', label: 'Estacionamento' },
    { emoji: '🚙', label: 'Carro' },
    { emoji: '🔧', label: 'Manutenção' },
    { emoji: '🏠', label: 'Moradia' },
    { emoji: '🏢', label: 'Condomínio' },
    { emoji: '🧾', label: 'Aluguel' },
    { emoji: '⚡', label: 'Energia' },
    { emoji: '💧', label: 'Água' },
    { emoji: '🔥', label: 'Gás' },
    { emoji: '🌐', label: 'Internet' },
    { emoji: '📱', label: 'Telefonia / Celular' },
    { emoji: '💊', label: 'Farmácia' },
    { emoji: '🩺', label: 'Saúde' },
    { emoji: '🦷', label: 'Dentista' },
    { emoji: '🧪', label: 'Exames' },
    { emoji: '🎓', label: 'Educação' },
    { emoji: '📚', label: 'Livros / Material' },
    { emoji: '💻', label: 'Tecnologia' },
    { emoji: '🖥️', label: 'Eletrônicos' },
    { emoji: '🧰', label: 'Ferramentas' },
    { emoji: '📺', label: 'Assinaturas' },
    { emoji: '🎮', label: 'Jogos' },
    { emoji: '🎵', label: 'Música' },
    { emoji: '🎬', label: 'Cinema / Streaming' },
    { emoji: '🎉', label: 'Lazer' },
    { emoji: '🏋️', label: 'Academia' },
    { emoji: '⚽', label: 'Esportes' },
    { emoji: '🏖️', label: 'Viagens' },
    { emoji: '✈️', label: 'Passagens' },
    { emoji: '🏨', label: 'Hotel' },
    { emoji: '🐾', label: 'Pet' },
    { emoji: '👶', label: 'Crianças' },
    { emoji: '👗', label: 'Roupas' },
    { emoji: '👟', label: 'Calçados' },
    { emoji: '💄', label: 'Beleza' },
    { emoji: '🧴', label: 'Cuidados Pessoais' },
    { emoji: '💇', label: 'Barbearia / Salão' },
    { emoji: '🎁', label: 'Presentes' },
    { emoji: '🙏', label: 'Doações' },
    { emoji: '💸', label: 'Impostos / Taxas' },
    { emoji: '🏦', label: 'Tarifas Bancárias' },
    { emoji: '⚖️', label: 'Serviços / Jurídico' },
    { emoji: '🧼', label: 'Limpeza' },
    { emoji: '🛠️', label: 'Reformas' },
    { emoji: '🌿', label: 'Jardinagem' },
    { emoji: '🗂️', label: 'Escritório / Trabalho' },
    { emoji: '🏡', label: 'Home Office' },
    { emoji: '💼', label: 'Salário / Receita' },
    { emoji: '💰', label: 'Renda Extra' },
    { emoji: '📈', label: 'Investimentos' },
    { emoji: '🔁', label: 'Transferência' }
  ];

  const handleSubmit = async () => {
    if (!name) {
      Alert.alert('Erro', 'Preencha o nome da categoria.');
      return;
    }

    try {
      setSubmitting(true);
      
      const payload = {
        name,
        type,
        icon
      };

      if (category?.id) {
        // Update
        await api.post('/query', {
          type: 'categories_update',
          data: {
            id: category.id,
            ...payload
          }
        });
      } else {
        // Insert
        await api.post('/query', {
          type: 'categories_insert',
          data: payload
        });
      }
      
      Alert.alert('Sucesso', `Categoria ${category?.id ? 'atualizada' : 'criada'} com sucesso!`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', `Falha ao ${category?.id ? 'atualizar' : 'criar'} categoria.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta categoria?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Excluir', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await api.post('/query', {
                type: 'categories_delete',
                data: { id: category.id }
              });
              Alert.alert('Sucesso', 'Categoria excluída com sucesso!');
              navigation.goBack();
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Falha ao excluir categoria.');
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
            <Text className="text-xl font-bold text-gray-900 dark:text-white">{category?.id ? 'Editar Categoria' : 'Nova Categoria'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
                {submitting ? (
                    <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                    <Text className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">Salvar</Text>
                )}
            </TouchableOpacity>
        </View>

        <View className="flex-row bg-gray-200 dark:bg-gray-700 p-1 rounded-lg mb-6">
            {['Saída', 'Entrada'].map((t) => (
            <TouchableOpacity 
                key={t} 
                onPress={() => setType(t as any)}
                className={`flex-1 py-2 items-center rounded-md ${type === t ? 'bg-white dark:bg-gray-600 shadow-sm' : ''}`}
            >
                <Text className={`font-medium ${type === t ? 'text-indigo-600 dark:text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{t}</Text>
            </TouchableOpacity>
            ))}
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Nome da Categoria</Text>
            <TextInput 
                className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 text-base text-gray-900 dark:text-white"
                value={name}
                onChangeText={setName}
                placeholder="Ex: Alimentação, Salário"
                placeholderTextColor="#9ca3af"
            />
        </View>

        <View className="mb-5">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">Ícone</Text>
            <View className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex-row flex-wrap justify-between">
                {AVAILABLE_ICONS.map((item) => (
                    <TouchableOpacity 
                        key={item.emoji}
                        onPress={() => setIcon(item.emoji)}
                        className={`w-12 h-12 justify-center items-center rounded-lg mb-2 ${icon === item.emoji ? 'bg-indigo-100 dark:bg-indigo-900 border-2 border-indigo-500' : 'bg-gray-50 dark:bg-gray-700'}`}
                    >
                        <Text className="text-2xl">{item.emoji}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>

        {category?.id && (
            <TouchableOpacity 
                onPress={handleDelete}
                disabled={deleting}
                className="mt-4 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl items-center border border-red-100 dark:border-red-800"
            >
                {deleting ? (
                    <ActivityIndicator color="#ef4444" />
                ) : (
                    <Text className="text-red-600 dark:text-red-400 font-bold">Excluir Categoria</Text>
                )}
            </TouchableOpacity>
        )}

      </ScrollView>
    </View>
  );
};
