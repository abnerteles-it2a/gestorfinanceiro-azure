import { AssetType } from '../types';

/** Normal-draw and clock adapters make the same production paths reproducible. */
export function simulatePortfolio(input: {
  initialEquity: number; horizonYears: number; monthlyContribution: number;
  targetMilestone: number; expectedReturnAnnual: number; volatilityAnnual: number;
}, normalDraw: () => number, currentYear: number) {
  const count = 1000;
  const years = Math.max(1, Math.min(30, Math.floor(input.horizonYears)));
  let values = new Array<number>(count).fill(input.initialEquity);
  const trajectoryData: { year: number; label: string; p10: number; p50: number; p90: number }[] = [];
  for (let year = 0; year <= years; year++) {
    if (year > 0) values = values.map(previous => {
      const growth = Math.exp(input.expectedReturnAnnual - 0.5 * input.volatilityAnnual ** 2 + input.volatilityAnnual * normalDraw());
      return Math.max(0, previous * growth + input.monthlyContribution * 12 * Math.sqrt(growth));
    });
    const sorted = [...values].sort((a, b) => a - b);
    trajectoryData.push({ year, label: year === 0 ? 'Hoje' : `+${year}a (${currentYear + year})`, p10: Math.round(sorted[100]), p50: Math.round(sorted[500]), p90: Math.round(sorted[900]) });
  }
  const final = trajectoryData[years];
  return { trajectoryData, targetProbability: Number((values.filter(value => value >= input.targetMilestone).length / count * 100).toFixed(1)), finalP10: final.p10, finalP50: final.p50, finalP90: final.p90 };
}

export function randomStandardNormal(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

interface Holding {
  ticker: string;
  type: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate?: string;
}
type Quotes = Record<string, { price?: number | null }>;

export function stressPortfolio(allocation: { equities: number; fiis: number; fixed: number; crypto: number; total: number }, crisis: { shockEquities: number; shockFiis: number; shockFixedIncome: number; shockCrypto: number; benchmarkIbovShock: number }) {
  const eqDelta = allocation.equities * crisis.shockEquities / 100;
  const fiiDelta = allocation.fiis * crisis.shockFiis / 100;
  const fixDelta = allocation.fixed * crisis.shockFixedIncome / 100;
  const cryDelta = allocation.crypto * crisis.shockCrypto / 100;
  const totalDelta = eqDelta + fiiDelta + fixDelta + cryDelta;
  const totalPercentage = allocation.total > 0 ? totalDelta / allocation.total * 100 : 0;
  const resilience = Math.max(10, Math.min(98, Math.round(100 - Math.abs(totalPercentage) / Math.abs(crisis.benchmarkIbovShock) * 50)));
  return { totalDelta, finalEquity: Math.max(0, allocation.total + totalDelta), totalPercentage, resilience, eqDelta, fiiDelta, fixDelta, cryDelta };
}

export function compoundReturn(rates: readonly number[]): number {
  return (rates.reduce((factor, rate) => factor * (1 + rate / 100), 1) - 1) * 100;
}

export function historicalPortfolioReturn(series: Record<string, { date: string; close: number }[]>, weights: Record<string, number>, month: string): number | undefined {
  let result = 0;
  let covered = 0;
  for (const [ticker, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const history = series[ticker] ?? [];
    const base = history[0]?.close;
    const current = history.find(item => item.date.slice(0, 7) === month)?.close;
    if (!(base > 0) || current == null || !Number.isFinite(current)) return undefined;
    result += (current / base - 1) * 100 * weight;
    covered += weight;
  }
  return covered > 0 ? Number(result.toFixed(2)) : undefined;
}

export function aggregateHoldings(holdings: readonly Holding[]) {
  const grouped = new Map<string, { ticker: string; quantity: number; cost: number }>();
  for (const holding of holdings) {
    const ticker = holding.ticker.trim().toUpperCase();
    const current = grouped.get(ticker) ?? { ticker, quantity: 0, cost: 0 };
    current.quantity += holding.quantity;
    current.cost += holding.purchasePrice * holding.quantity;
    grouped.set(ticker, current);
  }
  const total = [...grouped.values()].reduce((sum, item) => sum + item.cost, 0);
  return [...grouped.values()].map(item => ({ ...item, purchasePrice: item.quantity > 0 ? item.cost / item.quantity : 0, weight: total > 0 ? item.cost / total : 0 }));
}

/** Mark each holding at the available quote; zero is a valid observed price. */
export function derivePortfolioAssumptions(
  investments: readonly Holding[],
  fixedIncome: readonly { amountInvested: number }[],
  quotes: Quotes,
  inflationAdjusted: boolean,
) {
  const allocation = { equities: 0, fiis: 0, fixed: 0, crypto: 0, total: 0 };
  for (const holding of investments) {
    const quote = quotes[holding.ticker]?.price;
    const price = quote != null && Number.isFinite(quote) && quote >= 0 ? quote : holding.purchasePrice;
    const value = Math.max(0, price * holding.quantity);
    if (!Number.isFinite(value)) continue;
    if (holding.type === AssetType.CRYPTO) allocation.crypto += value;
    else if (holding.type === AssetType.REAL_ESTATE_FUND || holding.type === AssetType.REIT) allocation.fiis += value;
    else allocation.equities += value;
  }
  for (const holding of fixedIncome) {
    if (Number.isFinite(holding.amountInvested)) allocation.fixed += Math.max(0, holding.amountInvested);
  }
  allocation.total = allocation.equities + allocation.fiis + allocation.fixed + allocation.crypto;
  const norm = allocation.total || 1;
  const eq = allocation.equities / norm;
  const fii = allocation.fiis / norm;
  const fixed = allocation.fixed / norm;
  const crypto = allocation.crypto / norm;
  let expectedReturnAnnual = eq * 0.135 + fii * 0.11 + fixed * 0.105 + crypto * 0.25;
  const volatilityAnnual = Math.sqrt((eq * 0.22) ** 2 + (fii * 0.14) ** 2 + (fixed * 0.03) ** 2 + (crypto * 0.65) ** 2 + 2 * eq * fii * 0.22 * 0.14 * 0.45);
  if (inflationAdjusted && allocation.total > 0) expectedReturnAnnual = (1 + expectedReturnAnnual) / 1.045 - 1;
  return { initialEquity: allocation.total, allocation, expectedReturnAnnual, volatilityAnnual };
}
