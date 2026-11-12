import React, { useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, ScrollView } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { formatCurrency } from '../utils/formatters';
import { createScopedApi } from '../services/api';
import { getMarketData, getTopMovers, MarketData, MarketInfo } from '../services/marketDataService';
import { Investment } from '../types';
import { 
  calculateBazinPrice, 
  calculateSafetyMargin, 
  getValuationSignal 
} from '../utils/valuationFormulas';

// Abas Especializadas
import { DividendsTab } from '../components/investments/DividendsTab';
import { RebalancerTab } from '../components/investments/RebalancerTab';
import { TaxReportTab } from '../components/investments/TaxReportTab';
import { SimulatorTab } from '../components/investments/SimulatorTab';

interface FixedIncome {
    id: string;
    name: string;
    issuer: string;
    amount_invested: number;
    yield_rate: string;
}

type TabKey = 'carteira' | 'proventos' | 'rebalancear' | 'fiscal' | 'simulador';

export const InvestmentsScreen = () => {
  const api = useRef(createScopedApi()).current;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [activeTab, setActiveTab] = useState<TabKey>('carteira');
  const [loading, setLoading] = useState(true);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [fixedIncome, setFixedIncome] = useState<FixedIncome[]>([]);
  const [marketData, setMarketData] = useState<MarketData>({});
  const [topMovers, setTopMovers] = useState<Record<string, MarketInfo>>({});
  const [updatingQuotes, setUpdatingQuotes] = useState(false);

  const updateQuotes = useCallback(async (currentInvestments: Investment[]) => {
      const tickers = currentInvestments.map(i => i.ticker).filter(t => !!t);
      if (tickers.length === 0) return;

      try {
          setUpdatingQuotes(true);
          const { data } = await getMarketData(tickers);
          setMarketData(prev => ({ ...prev, ...data }));
      } catch (error) {
          console.error('Error updating quotes:', error);
      } finally {
          setUpdatingQuotes(false);
      }
  }, []);

  const totals = useMemo(() => {
    let totalValue = 0;
    let totalInvested = 0;
    let dayVariation = 0;
    
    investments.forEach(inv => {
         const mData = marketData[inv.ticker];
         const currentPrice = mData?.price ?? inv.currentPrice ?? inv.purchasePrice;
         const val = currentPrice * inv.quantity;
         const invested = inv.purchasePrice * inv.quantity;
         
         totalValue += val;
         totalInvested += invested;
         
         if (mData) {
             dayVariation += (mData.change * inv.quantity);
         }
    });

    fixedIncome.forEach(inv => {
        const val = Number(inv.amount_invested);
        totalValue += val;
        totalInvested += val;
    });

    const totalProfit = totalValue - totalInvested;
    const totalProfitPercent = totalInvested > 0 ? (totalProfit / totalInvested * 100) : 0;

    return { totalValue, totalInvested, totalProfit, totalProfitPercent, dayVariation };
  }, [investments, fixedIncome, marketData]);

  const allocation = useMemo(() => {
    const alloc: Record<string, number> = {};
    
    investments.forEach(inv => {
         const mData = marketData[inv.ticker];
         const currentPrice = mData?.price ?? inv.currentPrice ?? inv.purchasePrice;
         const val = currentPrice * inv.quantity;
         alloc[inv.type] = (alloc[inv.type] || 0) + val;
    });

    fixedIncome.forEach(inv => {
        const val = Number(inv.amount_invested);
        alloc['Renda Fixa'] = (alloc['Renda Fixa'] || 0) + val;
    });
    
    return Object.entries(alloc)
        .sort(([,a], [,b]) => b - a)
        .map(([name, value]) => ({
            name, 
            value, 
            percent: totals.totalValue > 0 ? (value / totals.totalValue * 100) : 0
        }));
  }, [investments, fixedIncome, marketData, totals.totalValue]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bootstrap');
      const invs = response.data.investments || [];
      setInvestments(invs);
      setFixedIncome(response.data.fixed_income_investments || []);
      
      if (invs.length > 0) {
          updateQuotes(invs);
      }

      getTopMovers().then(res => {
          if (res && res.data) {
              setTopMovers(res.data);
          }
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar os investimentos.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleAction = (item: Investment) => {
      Alert.alert('Ações', 'Escolha uma opção', [
        {
            text: 'Editar',
            onPress: () => navigation.navigate('InvestmentForm', { investment: item })
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
             Alert.alert('Confirmar Exclusão', 'Deseja excluir este investimento?', [
                 { text: 'Cancelar', style: 'cancel' },
                 { text: 'Excluir', style: 'destructive', onPress: async () => {
                     try {
                         await api.post('/query', { type: 'investments_delete', data: { id: item.id } });
                         fetchData();
                     } catch (e) { Alert.alert('Erro', 'Falha ao excluir'); }
                 }}
             ]);
          }
        },
        {
            text: 'Cancelar',
            style: 'cancel'
        }
      ]);
  };

  const handleFixedIncomeAction = (item: FixedIncome) => {
      Alert.alert('Ações - Renda Fixa', 'Escolha uma opção', [
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
             Alert.alert('Confirmar Exclusão', 'Deseja excluir este investimento de renda fixa?', [
                 { text: 'Cancelar', style: 'cancel' },
                 { text: 'Excluir', style: 'destructive', onPress: async () => {
                     try {
                         await api.post('/query', { type: 'fixed_income_delete', data: { id: item.id } });
                         fetchData();
                     } catch (e) { Alert.alert('Erro', 'Falha ao excluir'); }
                 }}
             ]);
          }
        },
        {
            text: 'Cancelar',
            style: 'cancel'
        }
      ]);
  };

  const tabList: { id: TabKey; label: string; icon: string }[] = [
    { id: 'carteira', label: 'Carteira', icon: 'pie-chart-outline' },
    { id: 'proventos', label: 'Proventos', icon: 'cash-outline' },
    { id: 'rebalancear', label: 'Rebalancear', icon: 'scale-outline' },
    { id: 'fiscal', label: 'Fiscal / IR', icon: 'document-text-outline' },
    { id: 'simulador', label: 'Simulador', icon: 'calculator-outline' },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900" style={{ paddingTop: insets.top }}>
      {/* Header Principal */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 shadow-sm">
        <View>
            <Text className="text-xl font-black text-gray-900 dark:text-white">Investimentos</Text>
            <Text className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider">
              Inteligência Patrimonial
            </Text>
        </View>
        <TouchableOpacity 
          onPress={() => navigation.navigate('InvestmentForm')}
          accessibilityLabel="Novo Investimento"
        >
            <Ionicons name="add-circle" size={32} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* Barra de Navegação por Abas (Horizontal Scroll) */}
      <View className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60">
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
        >
          {tabList.map(t => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                className={`flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-xl border ${
                  active 
                    ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500' 
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/60'
                }`}
              >
                <Ionicons 
                  name={t.icon as any} 
                  size={14} 
                  color={active ? '#0D9488' : '#64748b'} 
                />
                <Text className={`text-xs font-bold ${
                  active 
                    ? 'text-teal-700 dark:text-teal-300' 
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0D9488" className="mt-10" />
      ) : (
        <View className="flex-1 px-4 pt-3">
          {/* Aba: Proventos & Calendário */}
          {activeTab === 'proventos' && (
            <DividendsTab investments={investments} />
          )}

          {/* Aba: Rebalanceador Inteligente */}
          {activeTab === 'rebalancear' && (
            <RebalancerTab 
              investments={investments} 
              fixedIncome={fixedIncome} 
              marketData={marketData} 
            />
          )}

          {/* Aba: Radar Fiscal / IR */}
          {activeTab === 'fiscal' && (
            <TaxReportTab />
          )}

          {/* Aba: Simulador de Juros Compostos */}
          {activeTab === 'simulador' && (
            <SimulatorTab />
          )}

          {/* Aba: Carteira & Valuation */}
          {activeTab === 'carteira' && (
            <ScrollView 
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor="#0D9488" />}
                contentContainerStyle={{ paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Summary Cards */}
                <View className="mb-4">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pb-2">
                        <View className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mr-2.5 w-36">
                            <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Patrimônio</Text>
                            <Text className="text-gray-900 dark:text-white text-base font-black mt-1" numberOfLines={1}>
                              {formatCurrency(totals.totalValue)}
                            </Text>
                        </View>
                        <View className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mr-2.5 w-36">
                            <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Retorno</Text>
                            <View className="flex-row items-end mt-1">
                                <Text className={`text-base font-black ${totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} numberOfLines={1}>
                                    {formatCurrency(Math.abs(totals.totalProfit))}
                                </Text>
                            </View>
                            <Text className={`text-[10px] font-bold mt-0.5 ${totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {totals.totalProfit >= 0 ? '+' : '-'}{totals.totalProfitPercent.toFixed(1)}%
                            </Text>
                        </View>
                        <View className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mr-2.5 w-36">
                            <Text className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Var. Dia</Text>
                            <Text className={`text-base font-black mt-1 ${totals.dayVariation >= 0 ? 'text-green-600' : 'text-red-600'}`} numberOfLines={1}>
                                {formatCurrency(Math.abs(totals.dayVariation))}
                            </Text>
                            <Text className={`text-[10px] font-bold mt-0.5 ${totals.dayVariation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {totals.dayVariation >= 0 ? '+' : '-'}no dia
                            </Text>
                        </View>
                        <View className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mr-2.5 w-36">
                            <Text className="text-teal-600 dark:text-teal-400 text-[10px] font-bold uppercase tracking-wider">Proventos Est.</Text>
                            <Text className="text-gray-900 dark:text-white text-base font-black mt-1" numberOfLines={1}>
                                {formatCurrency(totals.totalValue * 0.0075)}
                            </Text>
                            <Text className="text-[10px] text-teal-600 dark:text-teal-400 font-bold mt-0.5">~0.75% a.m.</Text>
                        </View>
                    </ScrollView>
                </View>

                {/* Top Movers */}
                {Object.keys(topMovers).length > 0 && (
                    <View className="mb-4">
                        <Text className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 ml-1">Destaques do Mercado (B3)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pb-2">
                            {Object.entries(topMovers).map(([ticker, info]) => (
                                <View key={ticker} className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mr-2.5 w-28">
                                    <Text className="font-black text-gray-900 dark:text-white text-xs">{ticker}</Text>
                                    <Text className="text-xs text-gray-700 dark:text-gray-300 font-bold mt-0.5">{formatCurrency(info.price || 0)}</Text>
                                    <Text className={`text-[10px] font-bold mt-1 ${(info.changePercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(info.changePercent || 0) >= 0 ? '+' : ''}{(info.changePercent || 0).toFixed(2)}%
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Allocation */}
                {allocation.length > 0 && (
                    <View className="mb-4 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <Text className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Alocação Atual da Carteira</Text>
                        {allocation.map((item) => (
                            <View key={item.name} className="mb-2.5">
                                <View className="flex-row justify-between mb-1">
                                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.name}</Text>
                                    <Text className="text-xs font-black text-gray-900 dark:text-white">{item.percent.toFixed(1)}% ({formatCurrency(item.value)})</Text>
                                </View>
                                <View className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <View 
                                        className="h-full bg-teal-500 rounded-full" 
                                        style={{ width: `${item.percent}%` }} 
                                    />
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Renda Variável com Valuation Bazin & Sinais */}
                {investments.length > 0 && (
                    <View className="mb-4">
                        <Text className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 ml-1">
                          Renda Variável & Valuation Inteligente
                        </Text>
                        {investments.map(item => {
                            const mData = item.ticker ? marketData[item.ticker] : null;
                            const currentPrice = mData?.price ?? item.currentPrice ?? item.purchasePrice;
                            const hasQuote = currentPrice !== undefined && currentPrice !== null;
                            
                            // Valuation Bazin & Margem de Segurança
                            const estimated12mDividend = (currentPrice * 0.06); // 6% yield base de referência
                            const bazinPrice = calculateBazinPrice(estimated12mDividend, 6);
                            const safetyMargin = bazinPrice ? calculateSafetyMargin(bazinPrice, currentPrice) : null;
                            const valuationBadge = getValuationSignal(safetyMargin);

                            // P/L
                            const pl = hasQuote ? (currentPrice - item.purchasePrice) * item.quantity : 0;
                            const plPercent = item.purchasePrice ? ((currentPrice - item.purchasePrice) / item.purchasePrice * 100) : 0;
                            const isProfit = pl >= 0;

                            return (
                            <TouchableOpacity 
                                key={item.id} 
                                onPress={() => handleAction(item)}
                                className="bg-white dark:bg-gray-800 p-4 rounded-2xl mb-3 shadow-sm border border-gray-100 dark:border-gray-700"
                            >
                                <View className="flex-row justify-between items-start">
                                    <View>
                                        <View className="flex-row items-center gap-2">
                                          <Text className="font-black text-gray-900 dark:text-white text-base">{item.ticker}</Text>
                                          {/* Badge de Recomendação de Compra da IA */}
                                          <View className={`px-2 py-0.5 rounded-md ${valuationBadge.badgeBg}`}>
                                              <Text className={`text-[9px] font-black uppercase ${valuationBadge.textColor}`}>
                                                  {valuationBadge.label}
                                              </Text>
                                          </View>
                                        </View>
                                        <Text className="text-gray-400 text-xs mt-0.5">{item.type} · {item.quantity} cotas</Text>
                                    </View>

                                    <View className="items-end">
                                        <Text className="font-black text-gray-900 dark:text-white text-base tabular-nums">
                                          {formatCurrency(currentPrice * item.quantity)}
                                        </Text>
                                        <Text className={`text-xs font-bold mt-0.5 tabular-nums ${
                                            isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {isProfit ? '+' : ''}{plPercent.toFixed(2)}% ({formatCurrency(pl)})
                                        </Text>
                                    </View>
                                </View>

                                {/* Régua de Cotação & Valuation */}
                                <View className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 flex-row justify-between items-center text-xs">
                                    <View className="flex-row items-center gap-1">
                                        <Text className="text-[11px] text-gray-400">Cotação:</Text>
                                        <Text className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{formatCurrency(currentPrice)}</Text>
                                    </View>
                                    <View className="flex-row items-center gap-1">
                                        <Text className="text-[11px] text-gray-400">P. Médio:</Text>
                                        <Text className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{formatCurrency(item.purchasePrice)}</Text>
                                    </View>
                                    {bazinPrice && (
                                      <View className="flex-row items-center gap-1">
                                          <Text className="text-[11px] text-teal-600 dark:text-teal-400 font-bold">Teto Bazin:</Text>
                                          <Text className="text-[11px] font-black text-teal-700 dark:text-teal-300">{formatCurrency(bazinPrice)}</Text>
                                      </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        )})}
                    </View>
                )}

                {/* Renda Fixa */}
                {fixedIncome.length > 0 && (
                    <View className="mb-6">
                        <Text className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 ml-1">Renda Fixa & Títulos</Text>
                        {fixedIncome.map(item => (
                            <TouchableOpacity 
                                key={item.id} 
                                onPress={() => handleFixedIncomeAction(item)}
                                className="bg-white dark:bg-gray-800 p-4 rounded-2xl mb-2.5 shadow-sm border border-gray-100 dark:border-gray-700 flex-row justify-between items-center"
                            >
                                <View>
                                    <Text className="font-bold text-gray-900 dark:text-white text-base">{item.name}</Text>
                                    <Text className="text-gray-400 text-xs mt-0.5">{item.issuer}</Text>
                                </View>
                                <View className="items-end">
                                    <Text className="font-black text-gray-900 dark:text-white text-base tabular-nums">
                                      {formatCurrency(Number(item.amount_invested))}
                                    </Text>
                                    <Text className="text-teal-600 dark:text-teal-400 text-xs font-bold mt-0.5">{item.yield_rate}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {investments.length === 0 && fixedIncome.length === 0 && (
                    <View className="py-12 items-center justify-center">
                        <Ionicons name="bar-chart-outline" size={48} color="#94a3b8" />
                        <Text className="text-center text-gray-500 dark:text-gray-400 font-bold mt-3">Nenhum investimento cadastrado</Text>
                        <Text className="text-center text-gray-400 text-xs mt-1">Toque no botão + para adicionar seus ativos.</Text>
                    </View>
                )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};
