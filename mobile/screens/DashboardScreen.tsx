import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, RefreshControl, Image, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFinancialData } from '../context/FinancialDataContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { PortalLayout } from '../components/PortalLayout';
import { KpiCard } from '../components/KpiCard';
import { VoiceTransactionModal } from '../components/VoiceTransactionModal';

export const DashboardScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const [voiceModalOpen, setVoiceModalOpen] = useState(false);
    const { 
        totalBalance, monthIncome, monthExpense, projectedBalance,
        transactions, accounts, planInfo, viewMode, setViewMode, loading,
        refreshData, entitlements, capabilities, subscriptionInfo
    } = useFinancialData();
    const { user } = useAuth();

    const onRefresh = useCallback(() => {
        refreshData();
    }, [refreshData]);

    // ─── Health Score Contábil Executivo (0-100) ─────────────────────────────
    const healthScore = useMemo(() => {
        let score = 50;
        if (monthIncome > monthExpense) {
            const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
            score += Math.min(30, Math.round(savingsRate * 0.75));
        } else if (monthExpense > monthIncome && monthIncome > 0) {
            score -= 20;
        }

        const monthsRunway = monthExpense > 0 ? totalBalance / monthExpense : (totalBalance > 0 ? 6 : 0);
        if (monthsRunway >= 6) score += 20;
        else if (monthsRunway >= 3) score += 10;
        else if (monthsRunway < 1) score -= 15;

        score = Math.max(10, Math.min(100, score));
        let status = 'Excelente';
        let color = '#0D9488'; // Teal IT2A
        if (score < 45) {
            status = 'Atenção';
            color = '#EF4444';
        } else if (score < 70) {
            status = 'Regular';
            color = '#F59E0B';
        } else if (score < 85) {
            status = 'Saudável';
            color = '#10B981';
        }
        return { score, status, color, monthsRunway: monthsRunway.toFixed(1) };
    }, [monthIncome, monthExpense, totalBalance]);

    // ─── Radar Preditivo de Caixa ───────────────────────────────────────────
    const predictiveRadar = useMemo(() => {
        const netFlow = monthIncome - monthExpense;
        const proj60 = totalBalance + (netFlow * 2);
        const proj90 = totalBalance + (netFlow * 3);
        return { proj30: projectedBalance, proj60, proj90, netFlow };
    }, [totalBalance, monthIncome, monthExpense, projectedBalance]);

    const headerContent = (
        <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
                <Image 
                    source={require('../assets/logo.png')} 
                    resizeMode="contain"
                    style={{ width: 38, height: 38, tintColor: 'white' }}
                />
                <View>
                    <Text className="text-white font-bold text-base leading-tight">Gestor Financeiro</Text>
                    <Text className="text-teal-200 text-[10px] font-bold uppercase tracking-widest">Azure Cloud-Native</Text>
                </View>
            </View>
            <View className="flex-row items-center gap-3">
                {entitlements?.modules?.corporateManagement && (
                    <TouchableOpacity 
                        onPress={() => setViewMode(viewMode === 'personal' ? 'organization' : 'personal')}
                        className="bg-white/10 px-3 py-1.5 rounded-full border border-white/20"
                    >
                        <Text className="text-white text-[10px] font-bold uppercase">
                            {viewMode === 'personal' ? 'Pessoal' : 'Org'}
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity 
                    onPress={() => setVoiceModalOpen(true)} 
                    className="bg-teal-500/20 p-2.5 rounded-full border border-teal-400/40"
                    accessibilityLabel="Lançamento por Voz"
                >
                    <Ionicons name="mic" size={18} color="#5EEAD4" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Chatbot')} className="bg-white/10 p-2.5 rounded-full border border-white/20">
                    <Ionicons name="sparkles" size={18} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <PortalLayout 
            headerContent={headerContent}
        >
            <View>
                {/* Section Header */}
                <View className="flex-row justify-between items-center mb-1">
                    <View>
                        <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Dashboard Executivo
                        </Text>
                        <Text className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">
                            Inteligência Financeira em Tempo Real
                        </Text>
                    </View>
                </View>

                {/* KPI Grid */}
                <View style={{ marginTop: 20, gap: 14 }}>
                    <View className="flex-row gap-3">
                        <View className="flex-1">
                            <KpiCard 
                                title="Patrimônio Líquido" 
                                value={formatCurrency(totalBalance)} 
                                icon={<Ionicons name="briefcase-outline" size={20} color="#0D9488" />} 
                                subtext="Total em Contas"
                                variant="primary"
                                color="teal"
                            />
                        </View>
                        <View className="flex-1">
                            <KpiCard 
                                title="Projeção (30d)" 
                                value={formatCurrency(projectedBalance)} 
                                icon={<Ionicons name="trending-up-outline" size={20} color="#2563eb" />} 
                                subtext={projectedBalance < totalBalance ? `▼ pendências` : `Saldo estável`}
                                color="blue"
                            />
                        </View>
                    </View>

                    <View className="flex-row gap-3">
                        <View className="flex-1">
                            <KpiCard 
                                title="Receitas (Mês)" 
                                value={formatCurrency(monthIncome)} 
                                icon={<Ionicons name="arrow-up-outline" size={20} color="#10b981" />} 
                                color="green"
                            />
                        </View>
                        <View className="flex-1">
                            <KpiCard 
                                title="Despesas (Mês)" 
                                value={formatCurrency(monthExpense)} 
                                icon={<Ionicons name="arrow-down-outline" size={20} color="#ef4444" />} 
                                color="rose"
                            />
                        </View>
                    </View>
                </View>

                {/* Health Score Contábil Executivo */}
                <View style={{ marginTop: 20 }} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                        <View className="flex-row items-center gap-2">
                            <View className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 items-center justify-center">
                                <Ionicons name="shield-checkmark-outline" size={18} color="#0D9488" />
                            </View>
                            <View>
                                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Health Score Contábil</Text>
                                <Text className="text-xs font-bold text-slate-800 dark:text-slate-100">Saúde Financeira: {healthScore.status}</Text>
                            </View>
                        </View>
                        <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: `${healthScore.color}20` }}>
                            <Text style={{ color: healthScore.color }} className="text-xs font-black">
                                {healthScore.score}/100
                            </Text>
                        </View>
                    </View>
                    <View className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden my-2">
                        <View 
                            style={{ 
                                width: `${healthScore.score}%`, 
                                backgroundColor: healthScore.color,
                                height: '100%' 
                            }} 
                        />
                    </View>
                    <Text className="text-[10px] text-slate-400 font-medium">
                        Reserva operacional calculada em {healthScore.monthsRunway} meses de despesas.
                    </Text>
                </View>

                {/* Radar Preditivo de Caixa */}
                <View style={{ marginTop: 20 }} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <View className="flex-row justify-between items-center mb-3">
                        <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Radar Preditivo de Caixa
                        </Text>
                        <Text className={`text-[10px] font-black uppercase ${predictiveRadar.netFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {predictiveRadar.netFlow >= 0 ? 'Fluxo Superavitário' : 'Fluxo Deficitário'}
                        </Text>
                    </View>
                    <View className="flex-row justify-between gap-2">
                        <View className="flex-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
                            <Text className="text-[9px] font-bold text-slate-400 uppercase">30 Dias</Text>
                            <Text className="text-xs font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                                {formatCurrency(predictiveRadar.proj30)}
                            </Text>
                        </View>
                        <View className="flex-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
                            <Text className="text-[9px] font-bold text-slate-400 uppercase">60 Dias</Text>
                            <Text className="text-xs font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                                {formatCurrency(predictiveRadar.proj60)}
                            </Text>
                        </View>
                        <View className="flex-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
                            <Text className="text-[9px] font-bold text-slate-400 uppercase">90 Dias</Text>
                            <Text className="text-xs font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                                {formatCurrency(predictiveRadar.proj90)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Accounts Strip */}
                <View style={{ marginTop: 20 }}>
                    <View className="flex-row justify-between items-end mb-3">
                        <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Contas e Disponível
                        </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Accounts')}>
                            <Text className="text-teal-600 dark:text-teal-400 text-[10px] font-bold uppercase">Ver todas</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row -mx-2 px-2">
                        {accounts.map((acc) => (
                            <View key={acc.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl mr-3 min-w-[150px] border border-slate-100 dark:border-slate-800 shadow-sm">
                                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{acc.bank}</Text>
                                <Text className="text-sm font-bold text-slate-900 dark:text-white mb-2" numberOfLines={1}>{acc.name}</Text>
                                <Text className="text-base font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                                    {formatCurrency(acc.currentBalance || 0)}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Subscriptions Status Row */}
                {subscriptionInfo && (
                    <View style={{ marginTop: 20 }} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                            <View className="bg-teal-50 dark:bg-teal-950/40 p-2.5 rounded-xl">
                                <Ionicons name="shield-checkmark" size={18} color="#0D9488" />
                            </View>
                            <View>
                                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plano Atual</Text>
                                <Text className="text-xs font-bold text-slate-900 dark:text-white uppercase">GF {planInfo?.tier || 'Starter'}</Text>
                            </View>
                        </View>
                        <View className="items-end">
                            <Text className="text-[10px] font-black uppercase text-slate-400">Status</Text>
                            <Text className={`text-xs font-bold uppercase ${subscriptionInfo.isExpired ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {subscriptionInfo.status === 'active' ? 'Ativo' : 'Pendente'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Recent Transactions Section */}
                <View style={{ marginTop: 20, marginBottom: 80 }}>
                    <View className="flex-row justify-between items-end mb-3">
                        <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Atividade Recente
                        </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Fluxo')}>
                            <Text className="text-teal-600 dark:text-teal-400 text-[10px] font-bold uppercase">Escrituração</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ gap: 10 }}>
                        {transactions.slice(0, 5).map((t) => (
                            <TouchableOpacity 
                                key={t.id} 
                                className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex-row justify-between items-center"
                                onPress={() => navigation.navigate('TransactionForm', { transaction: t })}
                            >
                                <View className="flex-row items-center gap-3 flex-1 mr-3">
                                    <View className={`w-10 h-10 rounded-full items-center justify-center ${
                                        ['entrada', 'income', 'receita'].includes((t.transactionType || '').toLowerCase()) ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'
                                    }`}>
                                        <Ionicons 
                                            name={['entrada', 'income', 'receita'].includes((t.transactionType || '').toLowerCase()) ? 'add' : 'remove'} 
                                            size={18} 
                                            color={['entrada', 'income', 'receita'].includes((t.transactionType || '').toLowerCase()) ? '#10b981' : '#ef4444'} 
                                        />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-xs font-bold text-slate-900 dark:text-white truncate" numberOfLines={1}>
                                            {t.description || 'Transação'}
                                        </Text>
                                        <Text className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                                            {t.category || 'Geral'}
                                        </Text>
                                    </View>
                                </View>
                                <View className="items-end">
                                    <Text className={`text-sm font-bold tabular-nums ${
                                        ['entrada', 'income', 'receita'].includes((t.transactionType || '').toLowerCase()) ? 'text-emerald-500' : 'text-rose-500'
                                    }`}>
                                        {formatCurrency(t.amount)}
                                    </Text>
                                    <Text className="text-[9px] text-slate-400 font-medium">
                                        {formatDate(t.date)}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>

            {/* Floating Action Buttons: Voz & Adicionar */}
            <View className="absolute bottom-6 right-6 flex-row items-center gap-3">
                <TouchableOpacity 
                    className="w-12 h-12 rounded-full justify-center items-center shadow-lg elevation-5 border border-teal-400/40"
                    style={{ backgroundColor: '#0D9488' }}
                    onPress={() => setVoiceModalOpen(true)}
                    accessibilityLabel="Lançamento por Voz"
                >
                    <Ionicons name="mic" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                    className="w-14 h-14 bg-slate-900 rounded-full justify-center items-center shadow-lg elevation-5"
                    style={{ backgroundColor: '#0F172A' }}
                    onPress={() => navigation.navigate('TransactionForm')}
                    accessibilityLabel="Nova Transação"
                >
                    <Ionicons name="add" size={32} color="white" />
                </TouchableOpacity>
            </View>

            {/* Voice Transaction Modal */}
            <VoiceTransactionModal 
                visible={voiceModalOpen}
                onClose={() => setVoiceModalOpen(false)}
                onNavigateToForm={(prefilled) => navigation.navigate('TransactionForm', { prefilled })}
            />
        </PortalLayout>
    );
};
