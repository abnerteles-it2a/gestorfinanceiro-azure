import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { AssetType, Investment } from '../../types';

interface FixedIncome {
  id: string;
  name: string;
  amount_invested: number;
}

interface RebalancerTabProps {
  investments: Investment[];
  fixedIncome: FixedIncome[];
  marketData: Record<string, any>;
}

interface TargetClass {
  key: string;
  label: string;
  targetPct: number;
  color: string;
  icon: string;
}

export const RebalancerTab: React.FC<RebalancerTabProps> = ({
  investments,
  fixedIncome,
  marketData,
}) => {
  const [contributionInput, setContributionInput] = useState('1000');
  const [targets, setTargets] = useState<TargetClass[]>([
    { key: 'stocks', label: 'Ações Brasil', targetPct: 40, color: '#0D9488', icon: 'trending-up' },
    { key: 'fiis', label: 'Fundos Imobiliários', targetPct: 30, color: '#10B981', icon: 'business' },
    { key: 'fixed_income', label: 'Renda Fixa / Tesouro', targetPct: 20, color: '#6366F1', icon: 'shield-checkmark' },
    { key: 'crypto', label: 'Cripto / Internacional', targetPct: 10, color: '#F59E0B', icon: 'globe' },
  ]);

  // Agrupamento dos valores atuais por classe
  const breakdown = useMemo(() => {
    let stocks = 0;
    let fiis = 0;
    let fixed = 0;
    let crypto = 0;

    investments.forEach(inv => {
      const price = marketData[inv.ticker]?.price ?? inv.purchasePrice;
      const val = price * inv.quantity;
      const typeLower = (inv.type || '').toLowerCase();

      if (typeLower.includes('fii') || typeLower.includes('imob') || inv.type === AssetType.REAL_ESTATE_FUND) {
        fiis += val;
      } else if (typeLower.includes('cripto') || typeLower.includes('crypto') || inv.type === AssetType.CRYPTO) {
        crypto += val;
      } else {
        stocks += val;
      }
    });

    fixedIncome.forEach(fi => {
      fixed += Number(fi.amount_invested) || 0;
    });

    const total = stocks + fiis + fixed + crypto;
    return { stocks, fiis, fixed, crypto, total };
  }, [investments, fixedIncome, marketData]);

  // Cálculo matemático do rebalanceamento de aportes
  const contributionAmount = Number(contributionInput.replace(',', '.')) || 0;

  const plan = useMemo(() => {
    const totalCurrent = breakdown.total;
    const totalNew = totalCurrent + contributionAmount;

    const valuesMap: Record<string, number> = {
      stocks: breakdown.stocks,
      fiis: breakdown.fiis,
      fixed_income: breakdown.fixed,
      crypto: breakdown.crypto,
    };

    // 1. Calcula déficit de cada classe
    const items = targets.map(t => {
      const currentVal = valuesMap[t.key] || 0;
      const currentPct = totalCurrent > 0 ? (currentVal / totalCurrent) * 100 : 0;
      const idealVal = (totalNew * t.targetPct) / 100;
      const deficit = Math.max(0, idealVal - currentVal);

      return {
        ...t,
        currentVal,
        currentPct,
        idealVal,
        deficit,
      };
    });

    const totalDeficit = items.reduce((sum, item) => sum + item.deficit, 0);

    // 2. Distribui a quantia do aporte proporcionalmente ao déficit
    return items.map(item => {
      let suggestedContribution = 0;
      if (totalDeficit > 0 && contributionAmount > 0) {
        suggestedContribution = (item.deficit / totalDeficit) * contributionAmount;
      }

      const projectedVal = item.currentVal + suggestedContribution;
      const projectedPct = totalNew > 0 ? (projectedVal / totalNew) * 100 : 0;

      return {
        ...item,
        suggestedContribution,
        projectedVal,
        projectedPct,
      };
    });
  }, [breakdown, targets, contributionAmount]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
      {/* Header Card de Aporte */}
      <View className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Ionicons name="scale-outline" size={20} color="#0D9488" />
            <Text className="text-sm font-black text-slate-900 dark:text-white">
              Aporte para Rebalancear
            </Text>
          </View>
          <Text className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase">
            Sem Vender Ativos
          </Text>
        </View>

        <Text className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Informe quanto você pretende investir neste mês. A IA calculará a divisão ideal:
        </Text>

        <View className="flex-row items-center bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
          <Text className="text-base font-black text-slate-400 mr-2">R$</Text>
          <TextInput
            value={contributionInput}
            onChangeText={setContributionInput}
            keyboardType="numeric"
            placeholder="0,00"
            placeholderTextColor="#94a3b8"
            className="flex-1 text-lg font-black text-slate-900 dark:text-white"
          />
        </View>

        {/* Quick Amount Chips */}
        <View className="flex-row gap-2 mt-3">
          {['500', '1000', '2500', '5000'].map(val => (
            <TouchableOpacity
              key={val}
              onPress={() => setContributionInput(val)}
              className="bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 rounded-lg"
            >
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-300">
                +R$ {val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sugestão de Alocação */}
      <View className="space-y-3 mb-6">
        <Text className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1 mb-1">
          Onde Alocar seu Aporte:
        </Text>

        {plan.map(item => (
          <View
            key={item.key}
            className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm"
          >
            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-row items-center gap-2">
                <View 
                  className="w-7 h-7 rounded-lg items-center justify-center"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <Ionicons name={item.icon as any} size={15} color={item.color} />
                </View>
                <Text className="text-sm font-bold text-slate-900 dark:text-white">
                  {item.label}
                </Text>
              </View>

              <View className="items-end">
                <Text className="text-[10px] text-slate-400 font-bold uppercase">Meta</Text>
                <Text className="text-xs font-black text-slate-700 dark:text-slate-300">
                  {item.targetPct}%
                </Text>
              </View>
            </View>

            {/* Barra de Progresso Atual vs Meta */}
            <View className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden my-2">
              <View 
                className="h-full rounded-full"
                style={{ 
                  width: `${Math.min(100, item.currentPct)}%`,
                  backgroundColor: item.color 
                }}
              />
            </View>

            <View className="flex-row justify-between items-center text-xs mt-1">
              <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                Atual: {formatCurrency(item.currentVal)} ({item.currentPct.toFixed(1)}%)
              </Text>

              <View className="flex-row items-center gap-1">
                <Text className="text-[11px] font-bold text-slate-400">Aportar:</Text>
                <Text className="text-sm font-black text-teal-600 dark:text-teal-400 tabular-nums">
                  {formatCurrency(item.suggestedContribution)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};
