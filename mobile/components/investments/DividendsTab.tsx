import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { api } from '../../services/api';
import { Investment } from '../../types';

interface DividendItem {
  ticker: string;
  label: string;
  paymentDate: string;
  rate: number;
}

interface DividendsTabProps {
  investments: Investment[];
}

export const DividendsTab: React.FC<DividendsTabProps> = ({ investments }) => {
  const [dividends, setDividends] = useState<DividendItem[]>([]);
  const [loading, setLoading] = useState(false);

  const b3Tickers = useMemo(() => {
    return investments
      .filter(i => i.ticker && /\d{1,2}$/.test(i.ticker))
      .map(i => i.ticker);
  }, [investments]);

  const fetchDividends = useCallback(async () => {
    if (b3Tickers.length === 0) return;
    setLoading(true);
    try {
      const response = await api.get(`/portfolio/dividends?tickers=${b3Tickers.join(',')}`);
      if (response.data?.ok) {
        setDividends(response.data.dividends || []);
      }
    } catch (error) {
      console.log('Error fetching dividends:', error);
    } finally {
      setLoading(false);
    }
  }, [b3Tickers]);

  useEffect(() => {
    fetchDividends();
  }, [fetchDividends]);

  const today = new Date().toISOString().slice(0, 10);

  const upcoming = useMemo(() => {
    return dividends
      .filter(d => d.paymentDate && d.paymentDate.slice(0, 10) >= today)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  }, [dividends, today]);

  const ninetyDaysAgo = useMemo(() => {
    return new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  }, []);

  const recent = useMemo(() => {
    return dividends
      .filter(d => d.paymentDate && d.paymentDate.slice(0, 10) < today && d.paymentDate.slice(0, 10) >= ninetyDaysAgo)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [dividends, today, ninetyDaysAgo]);

  const nextEvent = upcoming[0];
  const daysUntilNext = nextEvent
    ? Math.ceil((new Date(nextEvent.paymentDate.slice(0, 10)).getTime() - new Date(today).getTime()) / 86400000)
    : null;

  const getLabelBadge = (label: string) => {
    const upper = (label || 'DIVIDENDO').toUpperCase();
    if (upper.includes('JCP')) {
      return { bg: 'bg-blue-100 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300' };
    }
    if (upper.includes('REND') || upper.includes('FII')) {
      return { bg: 'bg-teal-100 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300' };
    }
    return { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300' };
  };

  if (b3Tickers.length === 0) {
    return (
      <View className="py-16 items-center justify-center">
        <Ionicons name="cash-outline" size={48} color="#94a3b8" />
        <Text className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-3">
          Nenhum ativo da B3 cadastrado
        </Text>
        <Text className="text-slate-400 dark:text-slate-500 text-xs text-center max-w-xs mt-1">
          Cadastre ações ou fundos imobiliários para acompanhar o calendário de proventos.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView 
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDividends} tintColor="#0D9488" />}
      className="space-y-4"
    >
      {/* KPI Cards */}
      <View className="flex-row gap-2 mb-4">
        <View className="flex-1 bg-white dark:bg-slate-800 p-3.5 rounded-2xl border-l-4 border-l-teal-500 border border-slate-100 dark:border-slate-700 shadow-sm">
          <Text className="text-[9px] font-black uppercase tracking-wider text-slate-400">Próximo</Text>
          <Text className="text-base font-black text-teal-600 dark:text-teal-400 mt-0.5" numberOfLines={1}>
            {nextEvent ? nextEvent.ticker : '—'}
          </Text>
          <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {nextEvent ? `${formatCurrency(nextEvent.rate)}/cota` : 'Nenhum agendado'}
          </Text>
        </View>

        <View className="flex-1 bg-white dark:bg-slate-800 p-3.5 rounded-2xl border-l-4 border-l-amber-500 border border-slate-100 dark:border-slate-700 shadow-sm">
          <Text className="text-[9px] font-black uppercase tracking-wider text-slate-400">Faltam</Text>
          <Text className="text-base font-black text-slate-900 dark:text-white mt-0.5">
            {daysUntilNext !== null ? `${daysUntilNext} dias` : '—'}
          </Text>
          <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {upcoming.length} evento{upcoming.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <View className="flex-1 bg-white dark:bg-slate-800 p-3.5 rounded-2xl border-l-4 border-l-indigo-500 border border-slate-100 dark:border-slate-700 shadow-sm">
          <Text className="text-[9px] font-black uppercase tracking-wider text-slate-400">Monitorados</Text>
          <Text className="text-base font-black text-slate-900 dark:text-white mt-0.5">
            {b3Tickers.length}
          </Text>
          <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Ativos B3
          </Text>
        </View>
      </View>

      {/* Próximos Pagamentos */}
      <View className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm mb-4">
        <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 flex-row items-center gap-2">
          <View className="w-2 h-2 rounded-full bg-teal-500" />
          <Text className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Próximos Pagamentos Confirmados
          </Text>
        </View>

        {loading && (
          <View className="py-8 items-center justify-center">
            <ActivityIndicator size="small" color="#0D9488" />
            <Text className="text-xs text-slate-400 mt-2">Buscando calendário da B3...</Text>
          </View>
        )}

        {!loading && upcoming.length === 0 && (
          <View className="py-8 items-center justify-center">
            <Text className="text-xs text-slate-400">Nenhum provento futuro anunciado para sua carteira</Text>
          </View>
        )}

        {!loading && upcoming.map((item, idx) => {
          const badge = getLabelBadge(item.label);
          return (
            <View 
              key={idx} 
              className={`p-3.5 flex-row justify-between items-center ${
                idx < upcoming.length - 1 ? 'border-b border-slate-100 dark:border-slate-700/40' : ''
              }`}
            >
              <View className="flex-row items-center gap-2.5">
                <Text className="text-sm font-black text-slate-900 dark:text-white">{item.ticker}</Text>
                <View className={`px-2 py-0.5 rounded-md ${badge.bg}`}>
                  <Text className={`text-[9px] font-black uppercase ${badge.text}`}>
                    {item.label}
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(item.rate)}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">
                  Pagamento: {item.paymentDate ? formatDate(item.paymentDate) : '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Histórico Recente */}
      {recent.length > 0 && (
        <View className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm mb-6">
          <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/60">
            <Text className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Pagamentos Recentes (Últimos 90 dias)
            </Text>
          </View>

          {recent.slice(0, 10).map((item, idx) => {
            const badge = getLabelBadge(item.label);
            return (
              <View 
                key={idx} 
                className={`p-3.5 flex-row justify-between items-center opacity-85 ${
                  idx < Math.min(recent.length, 10) - 1 ? 'border-b border-slate-100 dark:border-slate-700/40' : ''
                }`}
              >
                <View className="flex-row items-center gap-2.5">
                  <Text className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.ticker}</Text>
                  <View className={`px-2 py-0.5 rounded-md ${badge.bg}`}>
                    <Text className={`text-[9px] font-bold uppercase ${badge.text}`}>
                      {item.label}
                    </Text>
                  </View>
                </View>

                <View className="items-end">
                  <Text className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                    {formatCurrency(item.rate)}
                  </Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">
                    {item.paymentDate ? formatDate(item.paymentDate) : '—'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};
