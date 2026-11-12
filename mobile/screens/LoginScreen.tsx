import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

interface Props {
  onNavigateSignUp: () => void;
}

export const LoginScreen: React.FC<Props> = ({ onNavigateSignUp }) => {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setError('');
    try {
      await signIn(email, password);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao entrar. Tente novamente.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="flex-1 bg-slate-50 dark:bg-gray-900">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Card */}
            <View className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-lg w-full max-w-sm self-center">

              {/* Logo + Title */}
              <View className="items-center mb-8">
                <Image
                  source={require('../assets/logo.png')}
                  style={{ width: 72, height: 72, marginBottom: 16 }}
                  resizeMode="contain"
                />
                <Text className="text-2xl font-bold text-gray-900 dark:text-white text-center">
                  Gestor Financeiro
                </Text>
                <Text className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center uppercase tracking-widest font-semibold">
                  Gestão financeira corporativa
                </Text>
              </View>

              {/* Form */}
              <View className="space-y-4">
                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    E-mail
                  </Text>
                  <TextInput
                    className="bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
                    placeholder="seu@email.com"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>

                <View>
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Senha
                  </Text>
                  <TextInput
                    className="bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white"
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={(v) => { setPassword(v); setError(''); }}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>

                {/* Inline error */}
                {error ? (
                  <View className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl px-4 py-3">
                    <Text className="text-xs text-rose-600 dark:text-rose-400 font-semibold text-center">
                      {error}
                    </Text>
                  </View>
                ) : null}

                {/* Submit */}
                <TouchableOpacity
                  className="bg-indigo-600 rounded-xl py-3.5 items-center mt-2"
                  onPress={handleSignIn}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold text-sm tracking-wide">
                      Entrar
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Sign Up link */}
                <TouchableOpacity
                  onPress={onNavigateSignUp}
                  className="items-center py-3"
                  activeOpacity={0.7}
                >
                  <Text className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                    Criar nova conta
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Footer */}
            <Text className="text-center text-[10px] text-slate-400 mt-6 uppercase tracking-widest">
              it2a • v1.0.0
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};
