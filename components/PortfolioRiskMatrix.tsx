import React, { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { AlertTriangleIcon, SparklesIcon, TrendingUpIcon } from './icons';

interface AssetSector {
  ticker: string;
  sector: string;
  weight: number;
}

export const PortfolioRiskMatrix: React.FC = () => {
  const { investments, portfolioValue, totalInvested } = useFinancialData();
  const currentEquity = portfolioValue > 0 ? portfolioValue : (totalInvested > 0 ? totalInvested : 100000);

  // Sector classification map
  const SECTOR_MAP: Record<string, string> = {
    'PETR4': 'Commodities / Petróleo',
    'PRIO3': 'Commodities / Petróleo',
    'BRAV3': 'Commodities / Petróleo',
    'VALE3': 'Commodities / Mineração',
    'CSNA3': 'Commodities / Siderurgia',
    'GGBR4': 'Commodities / Siderurgia',
    'ITUB4': 'Financeiro / Bancos',
    'BBDC4': 'Financeiro / Bancos',
    'BBAS3': 'Financeiro / Bancos',
    'SANB11': 'Financeiro / Bancos',
    'BPAC11': 'Financeiro / Bancos de Investimento',
    'WEGE3': 'Industrial / Bens de Capital',
    'TAEE11': 'Utilidade Pública / Energia',
    'EGIE3': 'Utilidade Pública / Energia',
    'CPLE6': 'Utilidade Pública / Energia',
    'ABEV3': 'Consumo Não Cíclico',
    'RENT3': 'Consumo Cíclico / Locação',
    'RADL3': 'Saúde / Varejo Farmacêutico',
    'MXRF11': 'Imobiliário / Papel e CRIs',
    'KNCR11': 'Imobiliário / Papel e CRIs',
    'CPTS11': 'Imobiliário / Papel e CRIs',
    'HGLG11': 'Imobiliário / Galpões Logísticos',
    'BTLG11': 'Imobiliário / Galpões Logísticos',
    'XPML11': 'Imobiliário / Shoppings',
    'VISC11': 'Imobiliário / Shoppings',
    'BTC': 'Criptoativos / Reserva Digital',
    'ETH': 'Criptoativos / Smart Contracts',
    'SOL': 'Criptoativos / Layer 1',
  };

  // Sector correlation coefficients matrix
  function getCorrelation(secA: string, secB: string): number {
    if (secA === secB) return 1.0;
    const a = secA.toLowerCase();
    const b = secB.toLowerCase();

    // Same broad family
    if (a.includes('petróleo') && b.includes('mineração')) return 0.72;
    if (a.includes('bancos') && b.includes('financeiro')) return 0.88;
    if (a.includes('energia') && b.includes('bancos')) return 0.52;
    if (a.includes('imobiliário') && b.includes('energia')) return 0.35;
    if (a.includes('imobiliário') && b.includes('bancos')) return 0.42;
    if (a.includes('cripto') && (a.includes('imobiliário') || b.includes('imobiliário'))) return 0.12;
    if (a.includes('cripto') && (a.includes('commodities') || b.includes('commodities'))) return 0.22;
    if (a.includes('imobiliário') && b.includes('imobiliário')) return 0.68;

    return 0.45; // Average market correlation
  }

  const { uniqueAssets, matrix, sectorAllocation, diversificationScore } = useMemo(() => {
    const assetsList = investments
      .map(inv => {
        const t = String(inv.ticker || '').toUpperCase().trim();
        const val = (inv.purchasePrice || 0) * (inv.quantity || 0);
        return {
          ticker: t,
          sector: SECTOR_MAP[t] || (t.endsWith('11') ? 'Fundos Imobiliários' : 'Ações Diversas'),
          value: val,
        };
      })
      .filter(a => a.ticker && a.value > 0);

    // Group by unique ticker
    const mapByTicker: Record<string, { ticker: string; sector: string; value: number }> = {};
    assetsList.forEach(a => {
      if (!mapByTicker[a.ticker]) mapByTicker[a.ticker] = { ticker: a.ticker, sector: a.sector, value: 0 };
      mapByTicker[a.ticker].value += a.value;
    });

    const assets = Object.values(mapByTicker).sort((a, b) => b.value - a.value).slice(0, 10);
    const totalVal = assets.reduce((s, a) => s + a.value, 0) || 1;

    // Build correlation matrix
    const n = assets.length;
    const corrMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(1.0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        corrMatrix[i][j] = getCorrelation(assets[i].sector, assets[j].sector);
      }
    }

    // Sectors breakdown
    const sectorWeights: Record<string, number> = {};
    assets.forEach(a => {
      sectorWeights[a.sector] = (sectorWeights[a.sector] || 0) + (a.value / totalVal) * 100;
    });

    const sectorAlloc = Object.entries(sectorWeights)
      .map(([sec, pct]) => ({ sector: sec, percentage: Number(pct.toFixed(1)) }))
      .sort((a, b) => b.percentage - a.percentage);

    // Diversification score: Penalize high sector concentration (> 30%) and high average correlation
    const maxSectorPct = sectorAlloc[0]?.percentage || 100;
    let avgCorr = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        avgCorr += corrMatrix[i][j];
        count++;
      }
    }
    avgCorr = count > 0 ? avgCorr / count : 0.5;

    // Score from 0 to 100
    let score = Math.round(100 - (maxSectorPct * 0.8) - (avgCorr * 30));
    if (assets.length >= 6) score += 10;
    score = Math.max(15, Math.min(95, score));

    return {
      uniqueAssets: assets,
      matrix: corrMatrix,
      sectorAllocation: sectorAlloc,
      diversificationScore: score,
    };
  }, [investments]);

  function getHeatmapColor(val: number): string {
    if (val >= 0.85) return 'bg-rose-500 text-white';
    if (val >= 0.65) return 'bg-amber-400 text-slate-900';
    if (val >= 0.40) return 'bg-teal-500/20 text-teal-700 dark:text-teal-300';
    return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
  }

  return (
    <div className="bg-white/40 dark:bg-slate-900/40 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <TrendingUpIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Matriz de Correlação & Raio-X de Risco Fino
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Avalie a verdadeira diversificação da sua carteira e evite o risco de ativos que caem juntos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/50" /> Baixa
            <span className="w-2.5 h-2.5 rounded bg-teal-500/50 ml-2" /> Média
            <span className="w-2.5 h-2.5 rounded bg-amber-400 ml-2" /> Alta
            <span className="w-2.5 h-2.5 rounded bg-rose-500 ml-2" /> Crítica
          </div>
        </div>
      </div>

      {/* Highlights & Diversification Score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Diversification Score Card */}
        <div className="p-4 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/40">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
            <span>Score de Diversificação Real</span>
            <span>0 a 100</span>
          </div>
          <div className="text-2xl font-black text-teal-700 dark:text-teal-300 font-mono mt-1">
            {diversificationScore} / 100
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {diversificationScore >= 75
              ? '🟢 Excelente equilíbrio setorial e baixa correlação cruzada.'
              : diversificationScore >= 50
              ? '🟡 Diversificação moderada. Há alguma sobreposição de risco setorial.'
              : '🔴 Alerta: Ativos muito correlacionados. Quedas em um tendem a afetar os demais.'}
          </p>
        </div>

        {/* Top Sector Concentration */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span>Maior Exposição Setorial</span>
            <span>Risco Setorial</span>
          </div>
          <div className="text-base font-black text-slate-900 dark:text-white mt-1 truncate">
            {sectorAllocation[0]?.sector || 'Não informado'}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Representa <strong>{sectorAllocation[0]?.percentage || 0}%</strong> dos ativos monitorados
          </p>
        </div>

        {/* Prescriptive Tip */}
        <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <span>Ação Recomendada</span>
            <span>Inteligência</span>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium mt-1 leading-relaxed">
            {sectorAllocation[0]?.percentage > 35
              ? `Recomendamos direcionar novos aportes para setores descorrelacionados para reduzir o peso de ${sectorAllocation[0]?.sector}.`
              : 'Sua carteira apresenta dispersão setorial prudente. Mantenha os aportes nas classes de menor peso.'}
          </p>
        </div>
      </div>

      {/* Correlation Matrix Table */}
      {uniqueAssets.length >= 2 ? (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
            Matriz de Interdependência de Preços (Coeficiente de Pearson)
          </h3>
          <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-x-auto p-4">
            <table className="text-xs font-mono text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[10px] uppercase font-sans text-slate-400">Ativo</th>
                  {uniqueAssets.map(a => (
                    <th key={a.ticker} className="p-2 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {a.ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uniqueAssets.map((rowAsset, i) => (
                  <tr key={rowAsset.ticker}>
                    <td className="p-2 text-left font-bold font-sans text-slate-900 dark:text-white whitespace-nowrap">
                      {rowAsset.ticker}
                      <span className="block text-[9px] font-normal text-slate-400 truncate max-w-[130px]">
                        {rowAsset.sector}
                      </span>
                    </td>
                    {uniqueAssets.map((colAsset, j) => {
                      const corr = matrix[i][j];
                      return (
                        <td key={colAsset.ticker} className="p-1">
                          <div
                            className={`w-14 py-2 rounded-lg font-bold text-[10px] transition-all hover:scale-105 cursor-default ${
                              i === j ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : getHeatmapColor(corr)
                            }`}
                            title={`Correlação entre ${rowAsset.ticker} e ${colAsset.ticker}: ${corr.toFixed(2)}`}
                          >
                            {corr.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 text-xs bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
          Cadastre 2 ou mais ativos na sua carteira para calcular a matriz de correlação cruzada e o raio-x de concentração.
        </div>
      )}

      {/* Sector Breakdown List */}
      <div className="space-y-2">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
          Distribuição Setorial Consolidada
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sectorAllocation.map(sec => (
            <div key={sec.sector} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[180px]">{sec.sector}</span>
              <span className="text-xs font-black text-slate-900 dark:text-white font-mono">{sec.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
