import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { AssetType } from '../types';

export const TaxReportWidget: React.FC = () => {
  const { transactions, isPrivacyMode } = useFinancialData();

  // Compute stock and FII sales in the current month
  const taxSummary = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let stockSalesVolume = 0;
    let fiiSalesVolume = 0;
    let cryptoSalesVolume = 0;

    // We identify sales by transactions categorized or described as Venda de Ativos / Investimentos
    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();

        const isSale = desc.includes('venda') || cat.includes('venda') || desc.includes('resgate');
        if (isSale) {
          if (desc.includes('fii') || desc.includes('11')) {
            fiiSalesVolume += t.amount;
          } else if (desc.includes('btc') || desc.includes('eth') || desc.includes('cripto')) {
            cryptoSalesVolume += t.amount;
          } else {
            stockSalesVolume += t.amount;
          }
        }
      }
    });

    const STOCK_EXEMPTION_LIMIT = 20000;
    const CRYPTO_EXEMPTION_LIMIT = 35000;

    const stockExemptionUsedPct = Math.min(100, (stockSalesVolume / STOCK_EXEMPTION_LIMIT) * 100);
    const stockRemainingExemption = Math.max(0, STOCK_EXEMPTION_LIMIT - stockSalesVolume);
    const isStockExempt = stockSalesVolume <= STOCK_EXEMPTION_LIMIT;

    const cryptoExemptionUsedPct = Math.min(100, (cryptoSalesVolume / CRYPTO_EXEMPTION_LIMIT) * 100);
    const cryptoRemainingExemption = Math.max(0, CRYPTO_EXEMPTION_LIMIT - cryptoSalesVolume);
    const isCryptoExempt = cryptoSalesVolume <= CRYPTO_EXEMPTION_LIMIT;

    // Due date of DARF is the last business day of the next month
    const nextMonth = new Date(curYear, curMonth + 2, 0);
    const darfDueDate = nextMonth.toLocaleDateString('pt-BR');

    return {
      stockSalesVolume,
      stockRemainingExemption,
      stockExemptionUsedPct,
      isStockExempt,
      fiiSalesVolume,
      cryptoSalesVolume,
      cryptoRemainingExemption,
      cryptoExemptionUsedPct,
      isCryptoExempt,
      darfDueDate
    };
  }, [transactions]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
              Radar Fiscal & Monitor de DARF
            </span>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-500/20">
              Legislação B3 / Receita Federal
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Apuração de Isenções & Tributação de Renda Variável
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Acompanhe o teto de isenção de R$ 20.000/mês para Ações, controle vendas de Fundos Imobiliários (tributadas em 20%) e evite surpresas com a Receita Federal.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Vencimento DARF Mês
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {taxSummary.darfDueDate}
            </span>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Ações Brasil */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Ações (Mercado à Vista)</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${taxSummary.isStockExempt ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                {taxSummary.isStockExempt ? 'Isento no Mês' : 'Tributável (15%)'}
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {isPrivacyMode ? '••••' : formatCurrency(taxSummary.stockSalesVolume)}
              </span>
              <span className="text-xs text-slate-400 ml-1">/ R$ 20.000,00</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${taxSummary.isStockExempt ? 'bg-teal-500' : 'bg-rose-500'}`}
                style={{ width: `${taxSummary.stockExemptionUsedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Margem restante de isenção:</span>
              <strong className="text-slate-700 dark:text-slate-300 tabular-nums">
                {isPrivacyMode ? '••••' : formatCurrency(taxSummary.stockRemainingExemption)}
              </strong>
            </div>
          </div>
        </div>

        {/* FIIs */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Fundos Imobiliários (FIIs)</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Alíquota Fixa 20%
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {isPrivacyMode ? '••••' : formatCurrency(taxSummary.fiiSalesVolume)}
              </span>
              <span className="text-xs text-slate-400 ml-1">em vendas</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            <p>
              FIIs <strong>não possuem isenção</strong> de R$ 20 mil. Qualquer lucro auferido na venda deve recolher 20% de IR via código DARF 6015.
            </p>
          </div>
        </div>

        {/* Criptomoedas */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Criptomoedas</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${taxSummary.isCryptoExempt ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                {taxSummary.isCryptoExempt ? 'Isento no Mês' : 'Tributável (15%)'}
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {isPrivacyMode ? '••••' : formatCurrency(taxSummary.cryptoSalesVolume)}
              </span>
              <span className="text-xs text-slate-400 ml-1">/ R$ 35.000,00</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${taxSummary.isCryptoExempt ? 'bg-indigo-500' : 'bg-rose-500'}`}
                style={{ width: `${taxSummary.cryptoExemptionUsedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Margem restante de isenção:</span>
              <strong className="text-slate-700 dark:text-slate-300 tabular-nums">
                {isPrivacyMode ? '••••' : formatCurrency(taxSummary.cryptoRemainingExemption)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
