import React, { useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { isExpenseTx } from '../utils/transactionHelpers';
import { SparklesIcon, AlertTriangleIcon, CheckCircleIcon } from './icons';

interface DetectedSubscription {
  name: string;
  category: string;
  currentAmount: number;
  frequency: string;
  annualImpact: number;
  status: 'atencao' | 'otimizado' | 'taxa_indevida';
  tip: string;
}

export const SubscriptionAuditor: React.FC = () => {
  const { transactions } = useFinancialData();

  const { subscriptions, totalAnnualCost, potentialSavings } = useMemo(() => {
    // Detect repeating descriptions in expenses
    const recurringMap: Record<string, { amounts: number[]; dates: string[]; category: string }> = {};

    transactions.forEach(t => {
      if (!isExpenseTx(t.transactionType) || !t.description) return;
      const cleanDesc = t.description.toUpperCase().trim()
        .replace(/\b(PARC|PARCELA|\d+\/\d+|\d+X)\b/g, '')
        .trim();

      if (!recurringMap[cleanDesc]) {
        recurringMap[cleanDesc] = { amounts: [], dates: [], category: String(t.category || 'Outros') };
      }
      recurringMap[cleanDesc].amounts.push(Number(t.amount || 0));
      recurringMap[cleanDesc].dates.push(t.date);
    });

    const items: DetectedSubscription[] = [];
    let annualSum = 0;
    let savingsSum = 0;

    // Filter recurring candidates (appear 2+ times) or match known SaaS / Banking keywords
    const KNOWN_SUBSCRIPTIONS = [
      'NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'YOUTUBE', 'APPLE', 'CHATGPT', 'OPENAI', 'ADOBE',
      'DISNEY', 'HBO', 'MAX', 'CLARO', 'VIVO', 'TIM', 'TARIFA', 'PACOTE', 'ANUIDADE', 'SEGURO'
    ];

    Object.entries(recurringMap).forEach(([name, data]) => {
      const isKnown = KNOWN_SUBSCRIPTIONS.some(k => name.includes(k));
      const count = data.amounts.length;

      if (count >= 2 || isKnown) {
        const lastAmount = data.amounts[data.amounts.length - 1];
        const annual = lastAmount * 12;
        annualSum += annual;

        const isBankFee = name.includes('TARIFA') || name.includes('PACOTE') || name.includes('ANUIDADE');
        let status: 'atencao' | 'otimizado' | 'taxa_indevida' = isBankFee ? 'taxa_indevida' : 'otimizado';
        let tip = 'Assinatura ativa regular';

        if (isBankFee) {
          tip = 'Tarifa bancária com potencial de isenção via pacote essencial gratuito (Resolução CMN 3.919/2010).';
          savingsSum += annual;
        } else if (annual > 1200) {
          status = 'atencao';
          tip = 'Impacto anual relevante (> R$ 1.200/ano). Avalie se o plano anual ou familiar oferece desconto.';
          savingsSum += annual * 0.20; // 20% potential discount
        }

        items.push({
          name,
          category: data.category,
          currentAmount: lastAmount,
          frequency: 'Mensal',
          annualImpact: annual,
          status,
          tip,
        });
      }
    });

    return {
      subscriptions: items.sort((a, b) => b.annualImpact - a.annualImpact),
      totalAnnualCost: annualSum,
      potentialSavings: savingsSum,
    };
  }, [transactions]);

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Scanner de Assinaturas Fantasma & Custos Invisíveis
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Identificação inteligente de mensalidades recorrentes, aumentos silenciosos e tarifas bancárias evitáveis
            </p>
          </div>
        </div>

        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
          {subscriptions.length} Serviços Mapeados
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Custo Anual Consolidado</span>
            <span>Assinaturas</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {formatCurrency(totalAnnualCost)}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Média de <strong>{formatCurrency(totalAnnualCost / 12)}/mês</strong> em cobranças fixas
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span>Economia Potencial Estimada</span>
            <span>Otimização</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono mt-1">
            {formatCurrency(potentialSavings)} / ano
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Cancelando tarifas e migrando para planos anuais
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <span>Pontos de Atenção</span>
            <span>Auditoria</span>
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono mt-1">
            {subscriptions.filter(s => s.status !== 'otimizado').length} Alertas
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Tarifas bancárias ou assinaturas de alto peso
          </p>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3">Serviço / Cobrança</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-right">Valor Recorrente</th>
                <th className="px-5 py-3 text-right">Impacto Anual</th>
                <th className="px-5 py-3">Diagnóstico & Recomendação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {subscriptions.length > 0 ? (
                subscriptions.map((sub, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">
                      {sub.name}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-[11px]">{sub.category}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                      {formatCurrency(sub.currentAmount)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                      {formatCurrency(sub.annualImpact)}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sub.status === 'taxa_indevida' ? 'bg-rose-500' : sub.status === 'atencao' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span>{sub.tip}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                    Nenhuma assinatura recorrente detectada ainda no histórico de transações.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
