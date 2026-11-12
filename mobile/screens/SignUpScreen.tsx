import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, setAuthToken } from '../services/api';
import { validateDocument } from '../utils/validators';
import { formatDocument } from '../utils/formatters';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'nativewind';
import { StatusBar } from 'expo-status-bar';

export const SignUpScreen = ({ onBack }: { onBack: () => void }) => {
  const { colorScheme } = useColorScheme();
  
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !orgName || !email || !password || !confirmPassword) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/neon-auth/signup', {
        name,
        orgName,
        cpfCnpj,
        email,
        password,
        planTier: 'starter',
        seats: 1,
        businessProfile: 'pf'
      });

      if (response.data) {
        Alert.alert(
          'Sucesso', 
          'Conta criada com sucesso! Faça login para continuar.',
          [{ text: 'OK', onPress: onBack }]
        );
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.error === 'org_name_exists' 
        ? 'Nome da organização já existe. Escolha outro.'
        : (error.response?.data?.error || 'Não foi possível criar a conta. Tente novamente.');
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-100 dark:bg-gray-900">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
          <View className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-lg w-full max-w-sm self-center">
            <View className="items-center mb-6">
                <Image 
                  source={require('../assets/logo.png')} 
                  className="w-16 h-16 mb-2"
                  resizeMode="contain"
                />
                <Text className="text-xl font-bold text-gray-900 dark:text-white text-center">Criar Conta</Text>
            </View>

            <View className="w-full">
                <TextInput
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-4 text-base text-gray-900 dark:text-white"
                  placeholder="Nome Completo"
                  value={name}
                  onChangeText={setName}
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  className={`bg-gray-50 dark:bg-gray-700 border ${cpfError ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'} rounded-lg p-3 mb-1 text-base text-gray-900 dark:text-white`}
                  placeholder="CPF/CNPJ"
                  value={cpfCnpj}
                  onChangeText={(text) => {
                    const formatted = formatDocument(text);
                    setCpfCnpj(formatted);
                    if (formatted.length >= 14) {
                       const val = validateDocument(formatted);
                       setCpfError(val === true ? null : (typeof val === 'string' ? val : null));
                    } else {
                       setCpfError(null);
                    }
                  }}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  maxLength={18}
                />
                {cpfError && <Text className="text-red-500 text-xs ml-1 mb-3">{cpfError}</Text>}
                {!cpfError && <View className="mb-4" />}
                <TextInput
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-4 text-base text-gray-900 dark:text-white"
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-4 text-base text-gray-900 dark:text-white"
                  placeholder="Senha"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={true}
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-6 text-base text-gray-900 dark:text-white"
                  placeholder="Confirmar Senha"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={true}
                  placeholderTextColor="#9CA3AF"
                />
                
                <TouchableOpacity 
                  className="bg-indigo-600 p-3 rounded-lg items-center mb-4" 
                  onPress={handleSignUp} 
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white text-base font-bold">Cadastrar</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={onBack}
                  className="items-center p-2"
                >
                  <Text className="text-indigo-600 dark:text-indigo-400 font-medium">Voltar para Login</Text>
                </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};
