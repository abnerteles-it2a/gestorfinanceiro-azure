import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { parseInvestmentFromText } from '../services/marketDataService';
import { formatCurrency } from '../utils/formatters';

export const SmartInvestmentScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);

  const handleProcess = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
        const result = await parseInvestmentFromText(text);
        if (result) {
            setParsedData(result);
        } else {
            Alert.alert('Não entendido', 'Não foi possível identificar o investimento. Tente algo como "Comprei 100 PETR4 a 30.50".');
        }
    } catch (error) {
        console.error(error);
        Alert.alert('Erro', 'Ocorreu um erro ao processar o texto.');
    } finally {
        setLoading(false);
    }
  };

  const handleConfirm = async () => {
      if (!parsedData) return;
      setLoading(true);
      try {
          // Default account and category need to be selected or inferred. 
          // For smart add, we often pick a default or ask.
          // The web app logic suggests category/type, but for now we'll rely on backend defaults or require manual adjustment later if needed.
          // However, the database requires accountId and categoryId usually.
          // Let's check what the web app does. 
          // It seems the web app has "smartCategoryPrefs" etc.
          // To keep it simple for mobile MVP: we'll fetch the first account/category as default if not specified, 
          // or just fail if strict.
          // But wait, the mobile form requires them.
          // Let's fetch defaults first.
          
          const bootstrap = await api.get('/bootstrap');
          const defaultAccount = bootstrap.data.accounts?.[0]?.id;
          const defaultCategory = bootstrap.data.categories?.find((c: any) => c.name === 'Investimentos')?.id || bootstrap.data.categories?.[0]?.id;
          
          if (!defaultAccount || !defaultCategory) {
              Alert.alert('Erro', 'Crie pelo menos uma conta e uma categoria "Investimentos" antes.');
              return;
          }

          const payload = {
            ...parsedData.data,
            accountId: defaultAccount,
            category: defaultCategory, // Assuming category name or ID is accepted. API expects 'category' field which is often the name or ID.
            paymentMethod: 'Dinheiro'
          };

          // The API expects specific fields. 
          // investments_insert payload:
          // ticker, type, quantity, purchasePrice, purchaseDate, accountId, costCenterId, category, paymentMethod
          
          await api.post('/query', {
              type: parsedData.kind === 'fixed' ? 'fixed_income_insert' : 'investments_insert',
              data: payload
          });
          
          Alert.alert('Sucesso', 'Investimento adicionado com sucesso!');
          navigation.goBack();
      } catch (error) {
          console.error(error);
          Alert.alert('Erro', 'Falha ao salvar o investimento.');
      } finally {
          setLoading(false);
      }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-800 shadow-sm">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
            <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 dark:text-white">Adição Inteligente</Text>
      </View>

      <ScrollView className="p-4">
        <Text className="text-gray-600 dark:text-gray-300 mb-4">
            Descreva seu investimento de forma natural. Exemplo:
            {"\n\n"}
            "Comprei 100 PETR4 a 30.50 hoje"
            {"\n"}
            "Apliquei 1000 no CDB Inter 100% CDI"
        </Text>

        <TextInput
            className="bg-white dark:bg-gray-800 p-4 rounded-xl text-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 mb-4"
            placeholder="Digite aqui..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            value={text}
            onChangeText={setText}
            style={{ textAlignVertical: 'top' }}
        />

        <TouchableOpacity 
            onPress={handleProcess}
            disabled={loading || !text.trim()}
            className={`p-4 rounded-xl items-center mb-6 ${loading || !text.trim() ? 'bg-gray-300 dark:bg-gray-700' : 'bg-teal-600'}`}
            style={!loading && text.trim() ? { backgroundColor: '#0D9488' } : undefined}
        >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Processar</Text>}
        </TouchableOpacity>

        {parsedData && (
            <View className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <Text className="text-lg font-bold text-gray-800 dark:text-white mb-2">Confirmar Dados</Text>
                
                {parsedData.kind === 'variable' ? (
                    <>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Ativo</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.ticker}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Tipo</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.type}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Quantidade</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.quantity}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Preço</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{formatCurrency(parsedData.data.purchasePrice)}</Text>
                        </View>
                    </>
                ) : (
                    <>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Nome</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.name}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Emissor</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.issuer}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Valor</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{formatCurrency(parsedData.data.amountInvested)}</Text>
                        </View>
                        <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                            <Text className="text-gray-500">Taxa</Text>
                            <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.yieldRate}</Text>
                        </View>
                    </>
                )}

                <View className="flex-row justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <Text className="text-gray-500">Data</Text>
                    <Text className="font-bold text-gray-800 dark:text-white">{parsedData.data.purchaseDate}</Text>
                </View>

                <TouchableOpacity 
                    onPress={handleConfirm}
                    disabled={loading}
                    className="mt-4 bg-green-600 p-3 rounded-lg items-center"
                >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Confirmar e Salvar</Text>}
                </TouchableOpacity>
            </View>
        )}
      </ScrollView>
    </View>
  );
};
