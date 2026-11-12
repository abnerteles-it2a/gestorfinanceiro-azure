// Core financial valuation formulas used across market analysis and investments
export function calculatePvp(price: number, vpa: number): number | null {
  if (vpa <= 0 || price <= 0) return null;
  return Number((price / vpa).toFixed(2));
}

export function calculateBazinPrice(dividends12m: number, minimumYieldRate: number = 6): number | null {
  if (dividends12m <= 0 || minimumYieldRate <= 0) return null;
  return Number((dividends12m / (minimumYieldRate / 100)).toFixed(2));
}

export function calculateGrahamPrice(lpa: number, vpa: number): number | null {
  if (lpa <= 0 || vpa <= 0) return null;
  const product = 22.5 * lpa * vpa;
  return Number(Math.sqrt(product).toFixed(2));
}

export function calculateSafetyMargin(ceilingPrice: number | null, currentPrice: number): number | null {
  if (!ceilingPrice || currentPrice <= 0) return null;
  return Number((((ceilingPrice - currentPrice) / currentPrice) * 100).toFixed(1));
}

export type ValuationRecommendation = 'COMPRA_FORTE' | 'COMPRA' | 'MANTER' | 'AGUARDAR';

export function getValuationSignal(safetyMarginPct: number | null): {
  recommendation: ValuationRecommendation;
  label: string;
  badgeBg: string;
  textColor: string;
} {
  if (safetyMarginPct === null) {
    return {
      recommendation: 'MANTER',
      label: 'Neutro',
      badgeBg: 'bg-slate-100 dark:bg-slate-800',
      textColor: 'text-slate-600 dark:text-slate-400'
    };
  }

  if (safetyMarginPct >= 25) {
    return {
      recommendation: 'COMPRA_FORTE',
      label: 'Compra Forte',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60',
      textColor: 'text-emerald-700 dark:text-emerald-300'
    };
  }

  if (safetyMarginPct >= 5) {
    return {
      recommendation: 'COMPRA',
      label: 'Comprar',
      badgeBg: 'bg-teal-100 dark:bg-teal-950/60',
      textColor: 'text-teal-700 dark:text-teal-300'
    };
  }

  if (safetyMarginPct >= -10) {
    return {
      recommendation: 'MANTER',
      label: 'Manter',
      badgeBg: 'bg-amber-100 dark:bg-amber-950/60',
      textColor: 'text-amber-700 dark:text-amber-300'
    };
  }

  return {
    recommendation: 'AGUARDAR',
    label: 'Aguardar',
    badgeBg: 'bg-rose-100 dark:bg-rose-950/60',
    textColor: 'text-rose-700 dark:text-rose-300'
  };
}
