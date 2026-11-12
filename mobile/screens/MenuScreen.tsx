import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { useFinancialData } from '../context/FinancialDataContext';

export const MenuScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();
    const { colorScheme, toggleColorScheme } = useColorScheme();
    const { user, signOut } = useAuth();
    const { viewMode, setViewMode, entitlements } = useFinancialData();
    const [meiEnabled, setMeiEnabled] = useState(false);

    useEffect(() => {
        SecureStore.getItemAsync('mei_enabled')
            .then(val => setMeiEnabled(val === 'true'))
            .catch(err => console.log('SecureStore read error', err));
    }, []);

    const toggleMei = async (val: boolean) => {
        setMeiEnabled(val);
        try {
            await SecureStore.setItemAsync('mei_enabled', String(val));
        } catch (err) {
            console.log('SecureStore write error', err);
        }
    };

    const menuItems = [
        { label: 'Contas e Cartões', route: 'Accounts', icon: 'wallet-outline' },
        { label: 'Contas a Pagar', route: 'Payables', icon: 'arrow-down-circle-outline' },
        { label: 'Contas a Receber', route: 'Receivables', icon: 'arrow-up-circle-outline' },
        { label: 'Recorrências', route: 'Recurrences', icon: 'calendar-outline' },
        { label: 'Categorias', route: 'Categories', icon: 'grid-outline' },
        { label: 'Centros de Custo', route: 'CostCenters', icon: 'business-outline' },
        { label: 'Investimentos', route: 'Investments', icon: 'trending-up-outline' },
        { label: 'Metas', route: 'Goals', icon: 'flag-outline' },
    ];

    return (
        <ScrollView 
            className="flex-1 bg-white dark:bg-gray-900"
            contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: 100 }}
        >
            <View className="mb-8">
                <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Menu do Ecossistema</Text>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">Configurações</Text>
            </View>
            
            <View className="bg-slate-50 dark:bg-gray-800 p-5 rounded-3xl border border-slate-100 dark:border-gray-700 flex-row items-center mb-8">
                <View className="w-12 h-12 rounded-2xl bg-indigo-600 justify-center items-center mr-4 shadow-sm">
                    <Text className="text-white text-xl font-bold">{user?.email[0].toUpperCase()}</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-0.5">Identidade Financeira</Text>
                    <Text className="text-gray-900 dark:text-white font-bold text-base truncate" numberOfLines={1}>{user?.email}</Text>
                </View>
            </View>

            <View className="mb-6 space-y-3">
                {menuItems.map((item) => (
                    <TouchableOpacity 
                        key={item.label} 
                        className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-gray-700/50 flex-row justify-between items-center"
                        onPress={() => navigation.navigate(item.route)}
                    >
                        <View className="flex-row items-center">
                            <View className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 justify-center items-center mr-3">
                                <Ionicons name={item.icon as any} size={18} color="#3b4e6d" />
                            </View>
                            <Text className="text-gray-700 dark:text-gray-200 font-bold text-sm">{item.label}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                ))}
            </View>

            <View className="mb-8 space-y-3">
                <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 mb-1">Preferências de Visualização</Text>
                
                {/* Dark Mode Toggle */}
                <View className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-gray-700/50 flex-row justify-between items-center">
                    <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 justify-center items-center mr-3">
                            <Ionicons name="moon-outline" size={18} color="#3b4e6d" />
                        </View>
                        <Text className="text-gray-700 dark:text-gray-200 font-bold text-sm">Modo Escuro</Text>
                    </View>
                    <Switch 
                        value={colorScheme === 'dark'}
                        onValueChange={toggleColorScheme}
                        trackColor={{ false: '#e2e8f0', true: '#3b4e6d' }}
                        thumbColor="#ffffff"
                    />
                </View>

                {/* View Mode Toggle (Exclusive for Corporate) */}
                {entitlements?.modules?.corporateManagement && (
                    <View className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-gray-700/50 flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 justify-center items-center mr-3">
                                <Ionicons name="business-outline" size={18} color="#3b4e6d" />
                            </View>
                            <View>
                                <Text className="text-gray-700 dark:text-gray-200 font-bold text-sm">Modo Corporativo</Text>
                                <Text className="text-[9px] text-slate-400 font-medium uppercase">Visualizar dados da Org</Text>
                            </View>
                        </View>
                        <Switch 
                            value={viewMode === 'organization'}
                            onValueChange={() => setViewMode(viewMode === 'personal' ? 'organization' : 'personal')}
                            trackColor={{ false: '#e2e8f0', true: '#3b4e6d' }}
                            thumbColor="#ffffff"
                        />
                    </View>
                )}

                {/* MEI Module Toggle */}
                <View className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700/50 flex-row justify-between items-center">
                    <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 justify-center items-center mr-3">
                            <Ionicons name="calculator-outline" size={18} color="#3b4e6d" />
                        </View>
                        <Text className="text-gray-700 dark:text-gray-200 font-bold text-sm">Módulo MEI Integrado</Text>
                    </View>
                    <Switch 
                        value={meiEnabled}
                        onValueChange={toggleMei}
                        trackColor={{ false: '#e2e8f0', true: '#3b4e6d' }}
                        thumbColor="#ffffff"
                    />
                </View>
            </View>

            <TouchableOpacity 
                className="bg-rose-50 dark:bg-rose-900/10 p-5 rounded-2xl border border-rose-100 dark:border-rose-900/30 flex-row justify-center items-center"
                onPress={signOut}
            >
                <Ionicons name="log-out-outline" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                <Text className="text-rose-600 dark:text-rose-500 font-bold text-base">Encerrar Sessão</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};
