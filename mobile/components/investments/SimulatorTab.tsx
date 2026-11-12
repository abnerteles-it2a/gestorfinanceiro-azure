import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/formatters';

export const SimulatorTab: React.FC = () => {
  const [initialInput, setInitialInput] = useState('10000');
  const [monthlyInput, setMonthlyInput] = useState('1000');
  const [yearsInput, setYearsInput] = useState('10');
  const [rateInput, setRateInput] = useState('11'); // 11% a.a.

  const result = useMemo(() => {
    const initial = Number(initialInput.replace(',', '.')) || 0;
    const monthly = Number(monthlyInput.replace(',', '.')) || 0;
    const years = Number(yearsInput) || 0;
    const annualRate = (Number(rateInput.replace(',', '.')) || 0) / 100;

    const months = years * 12;
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

    let total = initial;
    let totalInvested = initial;

    for (let i = 0; i < months; i++) {
      total = total * (1 + monthlyRate) + monthly;
      totalInvested += monthly;
    }

    const totalInterest = Math.max(0, total - totalInvested);
    const estimatedMonthlyPassiveIncome = total * 0.0075; // ~0.75% a.m. de renda passiva
    const interestRatio = total > 0 ? (totalInterest / total) * 100 : 0;

    return {
      total,
      totalInvested,
      totalInterest,
      estimatedMonthlyPassiveIncome,
      interestRatio,
      months,
    };
  }, [initialInput, monthlyInput, yearsInput, rateInput]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
      {/* Parameters Card */}
      <View className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
        <View className="flex-row items-center gap-2 mb-3">
          <Ionicons name="calculator-outline" size={20} color="#0D9488" />
          <Text className="text-sm font-black text-slate-900 dark:text-white">
            Simulador de Juros Compostos
          </Text>
        </View>

        {/* Form Inputs Grid */}
        <View className="space-y-3">
          <View>
            <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">
              Aporte Inicial (R$)
            </Text>
            <TextInput
              value={initialInput}
              onChangeText={setInitialInput}
              keyboardType="numeric"
              className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl text-base font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
            />
          </View>

          <View>
            <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">
              Aporte Mensal (R$)
            </Text>
            <TextInput
              value={monthlyInput}
              onChangeText={setMonthlyInput}
              keyboardType="numeric"
              className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl text-base font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">
                Tempo (Anos)
              </Text>
              <TextInput
                value={yearsInput}
                onChangeText={setYearsInput}
                keyboardType="numeric"
                className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl text-base font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
              />
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-black uppercase text-slate-400 mb-1">
                Rentabilidade (% a.a.)
              </Text>
              <TextInput
                value={rateInput}
                onChangeText={setRateInput}
                keyboardType="numeric"
                className="bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-xl text-base font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
              />
            </View>
          </View>
        </View>

        {/* Quick Horizon Chips */}
        <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
          {['5 anos', '10 anos', '15 anos', '20 anos'].map(lbl => {
            const y = lbl.replace(' anos', '');
            const active = yearsInput === y;
            return (
              <TouchableOpacity
                key={lbl}
                onPress={() => setYearsInput(y)}
                className={`px-3 py-1.5 rounded-lg border ${
                  active 
                    ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500' 
                    : 'bg-slate-100 dark:bg-slate-700/50 border-transparent'
                }`}
              >
                <Text className={`text-xs font-bold ${
                  active ? 'text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {lbl}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Result Cards */}
      <View className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm mb-6">
        <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
          Patrimônio Total Estimado
        </Text>
        <Text className="text-3xl font-black text-teal-600 dark:text-teal-400 tabular-nums">
          {formatCurrency(result.total)}
        </Text>

        <View className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 my-3 flex-row items-center justify-between">
          <View>
            <Text className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300">
              Renda Passiva Mensal Estimada
            </Text>
            <Text className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
              {formatCurrency(result.estimatedMonthlyPassiveIncome)}/mês
            </Text>
          </View>
          <Ionicons name="sparkles" size={24} color="#10B981" />
        </View>

        {/* Breakdown Bar */}
        <View className="space-y-2 mt-2">
          <View className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex-row">
            <View 
              className="h-full bg-slate-400"
              style={{ width: `${100 - result.interestRatio}%` }}
            />
            <View 
              className="h-full bg-teal-500"
              style={{ width: `${result.interestRatio}%` }}
            />
          </View>

          <View className="flex-row justify-between text-xs pt-1">
            <View className="flex-row items-center gap-1.5">
              <View className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <Text className="text-xs text-slate-600 dark:text-slate-400">
                Seus Aportes: <Text className="font-bold text-slate-900 dark:text-white">{formatCurrency(result.totalInvested)}</Text>
              </Text>
            </View>

            <View className="flex-row items-center gap-1.5">
              <View className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <Text className="text-xs text-slate-600 dark:text-slate-400">
                Juros: <Text className="font-bold text-teal-600 dark:text-teal-400">{formatCurrency(result.totalInterest)}</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};
