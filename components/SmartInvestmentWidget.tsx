import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { parseInvestmentFromText } from '../services/marketDataService';
import { PlusIcon, SparklesIcon } from './icons';
import { AssetType } from '../types';
import { useToast } from '../context/ToastContext';
import { AddInvestmentModal } from './AddInvestmentModal';
import { toIsoLocalDate } from '../utils/formatters';

export const SmartInvestmentWidget: React.FC = () => {
  const { addInvestment, addFixedIncomeInvestment } = useFinancialData();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickMode, setQuickMode] = useState<'save' | 'validate'>(() => {
    try {
      const v = window.localStorage.getItem('gestor_financeiro_quickAddInvestmentMode');
      if (v === 'save' || v === 'validate') return v as any;
      return 'validate';
    } catch { return 'validate'; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('gestor_financeiro_quickAddInvestmentMode', quickMode); } catch {}
  }, [quickMode]);

  const [preview, setPreview] = useState<any | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);

  const computeConfidence = (s: string) => {
    const raw = String(s || '').trim();
    if (!raw) return { score: 0, label: 'Sem dados', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300' };
    const lower = raw.toLowerCase();
    let score = 0;
    const tickerMatch = raw.match(/([A-Z]{3,5}(?:\d{1,2})?)/);
    const qtyMatch = raw.match(/(\d+[\.,]?\d*)\s*(x|un|uni|unid|qtd|quantidade|ações|acao|ações|cotas|lotes)?/i);
    const priceMatch = raw.match(/(a\s|por\s|preço\s|preco\s|valor\s)(de\s)?(r\$\s*)?(\d+[\.,]\d{2}|\d+)/i);
    const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4}|hoje|ontem)/i);
    const fixedCue = /(cdb|lci|lca|tesouro|ipca|cdi|debênture|debenture|cri|cra)/i.test(lower);
    if (tickerMatch) score += 30;
    if (qtyMatch) score += 20;
    if (priceMatch) score += 25;
    if (dateMatch) score += 10;
    if (fixedCue) score += 10;
    const label = score >= 75 ? 'Certeza alta' : score >= 45 ? 'Certeza média' : 'Certeza baixa';
    const color = score >= 75 ? 'bg-green-100 text-green-800 dark:bg-green-600/30 dark:text-green-300' : score >= 45 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-600/30 dark:text-yellow-300' : 'bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-300';
    return { score, label, color };
  };

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    const parsed = await parseInvestmentFromText(text);
    if (!parsed) {
      showToast('Não consegui entender o investimento.', 'error');
      setLoading(false);
      return;
    }
    if (parsed.kind === 'variable') {
      const data = parsed.data;
      const payload = {
        type: data.type as Exclude<AssetType, AssetType.FIXED_INCOME>,
        ticker: data.ticker,
        quantity: data.quantity,
        purchasePrice: data.purchasePrice,
        purchaseDate: data.purchaseDate
      };
      if (quickMode === 'save') {
        addInvestment({ ...payload, purchaseDate: toIsoLocalDate(payload.purchaseDate) });
        showToast('Investimento adicionado.', 'success');
        setText('');
      } else {
        setPreview({ kind: 'variable', data: payload });
        setValidateOpen(true);
      }
    } else {
      const data = parsed.data;
      const payload = {
        type: AssetType.FIXED_INCOME as AssetType.FIXED_INCOME,
        name: data.name,
        issuer: data.issuer,
        amountInvested: data.amountInvested,
        yieldRate: data.yieldRate,
        purchaseDate: data.purchaseDate,
        maturityDate: data.maturityDate
      };
      if (quickMode === 'save') {
        addFixedIncomeInvestment({ 
          ...payload, 
          purchaseDate: toIsoLocalDate(payload.purchaseDate), 
          maturityDate: toIsoLocalDate(payload.maturityDate) 
        });
        showToast('Renda fixa adicionada.', 'success');
        setText('');
      } else {
        setPreview({ kind: 'fixed', data: payload });
        setValidateOpen(true);
      }
    }
    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg">
      <div className="flex items-center mb-3">
        <SparklesIcon className="h-5 w-5 text-teal-600 dark:text-teal-400 mr-2" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Adicionar Investimento Rápido</h3>
        <div className="ml-auto flex items-center gap-2">
          {text && (() => { const c = computeConfidence(text); return (
            <span className={`text-xs px-2 py-1 rounded ${c.color}`}>{c.label}</span>
          ); })()}
          <button
            type="button"
            onClick={() => setQuickMode(quickMode === 'save' ? 'validate' : 'save')}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${quickMode === 'save' ? 'bg-green-600 text-white border-green-500 hover:bg-green-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white border-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
          >
            {quickMode === 'save' ? 'Modo: Salvar direto' : 'Modo: Validar no modal'}
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Ex: "Compra PETR4 100 por 37,20 ontem" ou "CDB 500 110% CDI vencimento 2026-01-10"</p>
      <form onSubmit={handleProcess} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e)=>setText(e.target.value)}
          placeholder="Descreva seu investimento..."
          className="w-full pl-4 pr-12 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 transition-shadow"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !text}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors disabled:bg-gray-400"
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <PlusIcon className="h-5 w-5" />
          )}
        </button>
      </form>

      {validateOpen && preview && (
        <AddInvestmentModal
          isOpen={validateOpen}
          onClose={() => { setValidateOpen(false); setPreview(null); }}
          initial={preview.kind === 'variable' ? {
            type: preview.data.type,
            ticker: preview.data.ticker,
            quantity: preview.data.quantity,
            purchasePrice: preview.data.purchasePrice,
            purchaseDate: preview.data.purchaseDate
          } : {
            type: AssetType.FIXED_INCOME,
            name: preview.data.name,
            issuer: preview.data.issuer,
            amountInvested: preview.data.amountInvested,
            yieldRate: preview.data.yieldRate,
            purchaseDate: preview.data.purchaseDate,
            maturityDate: preview.data.maturityDate
          }}
        />
      )}
    </div>
  );
};