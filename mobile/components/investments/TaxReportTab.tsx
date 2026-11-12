import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/formatters';
import { useFinancialData } from '../../context/FinancialDataContext';

export const TaxReportTab: React.FC = () => {
  const { transactions } = useFinancialData();

  const taxSummary = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let stockSalesVolume = 0;
    let fiiSalesVolume = 0;
    let cryptoSalesVolume = 0;

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const isSale = desc.includes('venda') || cat.includes('venda') || desc.includes('resgate');

        if (isSale) {
          if (desc.includes('fii') || desc.includes('11')) {
            fiiSalesVolume += Number(t.amount) || 0;
          } else if (desc.includes('btc') || desc.includes('eth') || desc.includes('cripto')) {
            cryptoSalesVolume += Number(t.amount) || 0;
          } else {
            stockSalesVolume += Number(t.amount) || 0;
          }
        }
      }
    });

    const STOCK_EXEMPTION_LIMIT = 20000;
    const stockExemptionUsedPct = Math.min(100, (stockSalesVolume / STOCK_EXEMPTION_LIMIT) * 100);
    const stockRemainingExemption = Math.max(0, STOCK_EXEMPTION_LIMIT - stockSalesVolume);
    const isStockExempt = stockSalesVolume <= STOCK_EXEMPTION_LIMIT;

    // Vencimento do DARF: último dia útil do mês seguinte
    const nextMonth = new Date(curYear, curMonth + 2, 0);
    const darfDueDate = nextMonth.toLocaleDateString('pt-BR');

    return {
      stockSalesVolume,
      stockRemainingExemption,
      stockExemptionUsedPct,
      isStockExempt,
      fiiSalesVolume,
      cryptoSalesVolume,
      darfDueDate,
      monthName: now.toLocaleString('pt-BR', { month: 'long' }),
      year: curYear,
    };
  }, [transactions]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
      {/* Header Banner */}
      <View className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
        <View className="flex-row items-center justify-between mb-1.5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="document-text-outline" size={20} color="#0D9488" />
            <Text className="text-sm font-black text-slate-900 dark:text-white">
              Radar Fiscal & DARF
            </Text>
          </View>
          <View className="bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded">
            <Text className="text-[10px] text-teal-700 dark:text-teal-300 font-bold uppercase">
              B3 / Receita Federal
            </Text>
          </View>
        </View>

        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Monitoramento em tempo real do limite de isenção de R$ 20.000 para ações e apuração de tributos de renda variável.
        </Text>

        <View className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex-row justify-between items-center">
          <Text className="text-[10px] font-bold uppercase text-slate-400">
            Vencimento do DARF deste Mês:
          </Text>
          <Text className="text-xs font-black text-slate-800 dark:text-slate-200">
            {taxSummary.darfDueDate}
          </Text>
        </View>
      </View>

      {/* Card Ações — Teto de Isenção R$ 20.000 */}
      <View className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center gap-2">
            <Ionicons name="trending-up-outline" size={18} color="#0D9488" />
            <Text className="text-sm font-black text-slate-900 dark:text-white">
              Ações (Isenção até R$ 20k/mês)
            </Text>
          </View>
          <View className={`px-2 py-0.5 rounded-full ${
            taxSummary.isStockExempt 
              ? 'bg-emerald-100 dark:bg-emerald-950/60' 
              : 'bg-rose-100 dark:bg-rose-950/60'
          }`}>
            <Text className={`text-[10px] font-bold ${
              taxSummary.isStockExempt 
                ? 'text-emerald-700 dark:text-emerald-300' 
                : 'text-rose-700 dark:text-rose-300'
            }`}>
              {taxSummary.isStockExempt ? 'ISENTO' : 'TRIBUTÁVEL'}
            </Text>
          </View>
        </View>

        {/* Termômetro de Vendas */}
        <View className="my-3">
          <View className="flex-row justify-between text-xs mb-1">
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              Vendido no mês: <Text className="font-bold text-slate-900 dark:text-white">{formatCurrency(taxSummary.stockSalesVolume)}</Text>
            </Text>
            <Text className="text-xs font-black text-slate-700 dark:text-slate-300">
              {taxSummary.stockExemptionUsedPct.toFixed(1)}% do teto
            </Text>
          </View>

          <View className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <View 
              className={`h-full rounded-full ${
                taxSummary.stockExemptionUsedPct > 80 ? 'bg-amber-500' : 'bg-teal-500'
              }`}
              style={{ width: `${taxSummary.stockExemptionUsedPct}%` }}
            />
          </View>

          <Text className="text-[10px] text-slate-400 mt-1">
            Você ainda pode vender <Text className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(taxSummary.stockRemainingExemption)}</Text> em ações neste mês com 100% de isenção de imposto sobre o lucro.
          </Text>
        </View>
      </View>

      {/* Card Fundos Imobiliários — Alíquota Fixa 20% */}
      <View className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm mb-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center gap-2">
            <Ionicons name="business-outline" size={18} color="#10B981" />
            <Text className="text-sm font-black text-slate-900 dark:text-white">
              Fundos Imobiliários (FIIs)
            </Text>
          </View>
          <View className="bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] text-amber-700 dark:text-amber-300 font-bold uppercase">
              Sem Isenção (20%)
            </Text>
          </View>
        </View>

        <Text className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
          Ganhos de capital na venda de cotas de FIIs são tributados em 20% fixo (sem faixa de isenção). Os rendimentos mensais distribuídos continuam isentos.
        </Text>

        <View className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl flex-row justify-between items-center">
          <Text className="text-xs text-slate-500 dark:text-slate-400">Total vendido neste mês:</Text>
          <Text className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(taxSummary.fiiSalesVolume)}
          </Text>
        </View>
      </View>

      {/* Guia Rápido de Tributação */}
      <View className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl mb-6">
        <Text className="text-xs font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider mb-2">
          Regras Fiscais Resumidas:
        </Text>
        <View className="space-y-1.5">
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            • <Text className="font-bold text-slate-700 dark:text-slate-300">Ações (Swing Trade):</Text> 15% sobre o lucro se ultrapassar R$ 20.000 de vendas no mês.
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            • <Text className="font-bold text-slate-700 dark:text-slate-300">FIIs:</Text> 20% fixo sobre o lucro em qualquer valor de venda.
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400">
            • <Text className="font-bold text-slate-700 dark:text-slate-300">Prejuízos Passados:</Text> Podem ser abatidos de lucros futuros na mesma classe de ativo.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};
