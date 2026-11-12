import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  searchResults?: SearchResult[];
  suggestedQuestions?: string[];
}

export const ChatbotScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [chatQuery, setChatQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInvestmentOptions, setShowInvestmentOptions] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('Moderado');
  const flatListRef = useRef<FlatList>(null);

  const sendToChatbot = async (queryOverride?: string) => {
    const textToSend = queryOverride || chatQuery;
    if (!textToSend.trim()) return;

    const newUserMsg: Message = { 
        id: Date.now().toString(), 
        role: 'user', 
        content: textToSend 
    };

    setMessages(prev => [...prev, newUserMsg]);
    setChatQuery('');
    setLoading(true);

    try {
      // Timeout 90s: AI backends (Bedrock/Vertex) can take 30-60s to respond
      const response = await api.post('/ai/agent', { 
        query: textToSend,
        context: {
            currentView: 'mobile_app',
            investmentProfile: selectedProfile,
        }
      }, { timeout: 90000 });
      
      const replyText = response.data.reply || response.data.text || 'Sem resposta do assistente.';
      
      const newAssistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: replyText,
          searchResults: response.data.searchResults,
          suggestedQuestions: response.data.suggestedQuestions,
      };

      setMessages(prev => [...prev, newAssistantMsg]);
    } catch (error: any) {
      console.error('[Chatbot] Error:', error?.code, error?.message, error?.response?.status, error?.response?.data);
      
      const isTimeout = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout');
      const is401 = error?.response?.status === 401;
      
      const friendlyMsg = isTimeout
        ? 'A IA está demorando um pouco mais que o esperado. Tente novamente em instantes.'
        : is401
        ? 'Sessão expirada. Faça login novamente.'
        : 'Erro ao conectar com o Assistente. Verifique sua conexão e tente novamente.';

      const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: friendlyMsg,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 200);
    }
  }, [messages]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    
    return (
        <View className={`mb-4 ${isUser ? 'items-end' : 'items-start'}`}>
            <View className={`p-4 rounded-2xl max-w-[85%] ${isUser ? 'bg-teal-600 rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`} style={isUser ? { backgroundColor: '#0D9488' } : undefined}>
                <Text className={`${isUser ? 'text-white' : 'text-slate-900 dark:text-slate-100'} text-base leading-6`}>
                    {item.content}
                </Text>
            </View>

            {/* Search Results */}
            {!isUser && item.searchResults && item.searchResults.length > 0 && (
                <View className="mt-2 w-[85%]">
                    <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">Fontes Encontradas</Text>
                    {item.searchResults.map((result, idx) => (
                        <TouchableOpacity 
                            key={idx}
                            onPress={() => Linking.openURL(result.link)}
                            className="bg-white dark:bg-gray-800 p-3 rounded-xl mb-2 border border-gray-200 dark:border-gray-700"
                        >
                            <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-sm mb-1">{result.title}</Text>
                            <Text className="text-gray-600 dark:text-gray-400 text-xs" numberOfLines={2}>{result.snippet}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Suggested Questions */}
            {!isUser && item.suggestedQuestions && item.suggestedQuestions.length > 0 && (
                <View className="mt-2 w-[85%] flex-row flex-wrap">
                    {item.suggestedQuestions.map((q, idx) => (
                        <TouchableOpacity 
                            key={idx}
                            onPress={() => sendToChatbot(q)}
                            className="bg-teal-50 dark:bg-teal-900/30 px-3 py-2 rounded-lg mr-2 mb-2 border border-teal-100 dark:border-teal-800"
                        >
                            <Text className="text-teal-700 dark:text-teal-300 text-xs font-medium">{q}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      style={{ paddingTop: insets.top }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between">
        <View className="flex-row items-center">
             <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3">
                <Ionicons name="arrow-back" size={24} color="#4b5563" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">Assistente IA</Text>
        </View>
        <TouchableOpacity onPress={() => setMessages([])}>
            <Ionicons name="trash-outline" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {messages.length === 0 ? (
        <View className="flex-1 justify-center items-center opacity-50 p-8">
            <Ionicons name="chatbubbles-outline" size={64} color="#9ca3af" />
            <Text className="text-gray-400 dark:text-gray-500 text-center text-base mt-4">
                Faça uma pergunta sobre suas finanças.{"\n"}
                Ex: "Quanto gastei com alimentação?"
            </Text>
        </View>
      ) : (
        <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            className="flex-1"
        />
      )}

      <View className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" style={{ paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === 'android' ? 20 : 0) }}>
        {/* Quick Actions - Aligned with Web */}
        <View className="mb-3">
             {!showInvestmentOptions ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    <TouchableOpacity
                        disabled={loading}
                        onPress={() => sendToChatbot("Gere uma análise financeira completa do meu mês.")}
                        className="mr-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-100 dark:border-blue-800 flex-row items-center"
                    >
                        <Ionicons name="trending-up" size={14} color="#2563eb" style={{ marginRight: 4 }} />
                        <Text className="text-blue-600 dark:text-blue-400 text-xs font-medium">Análise Financeira</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                        disabled={loading}
                        onPress={() => setShowInvestmentOptions(true)}
                        className="mr-2 px-3 py-2 bg-teal-50 dark:bg-teal-900/20 rounded-full border border-teal-100 dark:border-teal-800 flex-row items-center"
                    >
                        <Ionicons name="rocket-outline" size={14} color="#9333ea" style={{ marginRight: 4 }} />
                        <Text className="text-teal-600 dark:text-teal-400 text-xs font-medium">Análise de Investimentos</Text>
                    </TouchableOpacity>
                </ScrollView>
             ) : (
                <View className="flex-col animate-fade-in">
                    <View className="flex-row justify-between items-center mb-2 px-1">
                        <Text className="text-xs text-gray-500 dark:text-gray-400">Selecione seu perfil:</Text>
                        <TouchableOpacity onPress={() => setShowInvestmentOptions(false)}>
                            <Ionicons name="close" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        <TouchableOpacity
                            onPress={() => { setSelectedProfile('Conservador'); setShowInvestmentOptions(false); sendToChatbot("Gere uma análise de investimentos considerando meu perfil Conservador."); }}
                            className={`mr-2 px-3 py-2 rounded-full border ${selectedProfile === 'Conservador' ? 'bg-green-200 border-green-400' : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800'}`}
                        >
                            <Text className="text-green-700 dark:text-green-400 text-xs font-medium">🛡️ Conservador</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setSelectedProfile('Moderado'); setShowInvestmentOptions(false); sendToChatbot("Gere uma análise de investimentos considerando meu perfil Moderado."); }}
                            className={`mr-2 px-3 py-2 rounded-full border ${selectedProfile === 'Moderado' ? 'bg-yellow-200 border-yellow-400' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-800'}`}
                        >
                            <Text className="text-yellow-700 dark:text-yellow-400 text-xs font-medium">⚖️ Moderado</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setSelectedProfile('Arrojado'); setShowInvestmentOptions(false); sendToChatbot("Gere uma análise de investimentos considerando meu perfil Arrojado."); }}
                            className={`mr-2 px-3 py-2 rounded-full border ${selectedProfile === 'Arrojado' ? 'bg-red-200 border-red-400' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'}`}
                        >
                            <Text className="text-red-700 dark:text-red-400 text-xs font-medium">🚀 Arrojado</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
             )}
        </View>

        <View className="flex-row items-center">
            <TextInput
              className="flex-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full px-4 py-3 mr-2 text-gray-900 dark:text-white"
              placeholder="Pergunte ao Chatbot..."
              value={chatQuery}
              onChangeText={setChatQuery}
              onSubmitEditing={() => sendToChatbot()}
              placeholderTextColor="#9ca3af"
              editable={!loading}
            />
            <TouchableOpacity 
                className={`w-12 h-12 rounded-full justify-center items-center ${loading ? 'opacity-70' : ''}`}
                style={{ backgroundColor: '#0D9488' }}
                onPress={() => sendToChatbot()}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Ionicons name="send" size={20} color="white" />
                )}
            </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};
