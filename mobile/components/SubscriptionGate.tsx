import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { useFinancialData } from '../context/FinancialDataContext';
import { Ionicons } from '@expo/vector-icons';

export const SubscriptionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { subscriptionInfo, planInfo } = useFinancialData();

    if (subscriptionInfo?.isTotalBlocked) {
        return (
            <SafeAreaView className="flex-1 bg-white dark:bg-slate-900">
                <View className="flex-1 px-8 justify-center items-center">
                    <View className="w-24 h-24 bg-rose-100 dark:bg-rose-900/30 rounded-full items-center justify-center mb-8">
                        <Ionicons name="lock-closed" size={48} color="#ef4444" />
                    </View>
                    
                    <Text className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
                        Acesso Interrompido
                    </Text>
                    
                    <Text className="text-base text-gray-500 dark:text-gray-400 text-center mb-8">
                        Sua assinatura {planInfo?.name ? `GF ${planInfo.name}` : ''} expirou e o período de carência terminou. Seus dados estão seguros, mas para continuar utilizando o ecossistema completo, é necessário regularizar sua conta.
                    </Text>
                    
                    <View className="w-full space-y-4">
                        <TouchableOpacity className="bg-indigo-600 p-4 rounded-2xl items-center shadow-lg">
                            <Text className="text-white font-bold text-base">Regularizar Assinatura</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity className="p-4 items-center">
                            <Text className="text-indigo-600 dark:text-indigo-400 font-bold">Falar com Suporte</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return <>{children}</>;
};
