import { calculateBazinPrice, calculateGrahamPrice, calculatePvp } from './investmentValuation';

export type SimulationAssetClass = 'STOCK' | 'FII' | 'CRYPTO' | 'OTHER';
export type SimulationInput = { value: number | null; source: 'manual' | 'quote' | 'benchmark' | 'missing'; invalid?: boolean };
type Fundamentals = { price?: number | null; dividends12m?: number | null; vpa?: number | null; lpa?: number | null };

// Never infer FII from the suffix 11: it also identifies units and ETFs.
export function resolveSimulationAssetClass(ticker: string, explicit?: string | null): SimulationAssetClass {
  if (explicit != null) {
    if (['FII', 'FIIs', 'Fundo Imobiliário'].includes(explicit)) return 'FII';
    if (['STOCK', 'Ações', 'Stocks', 'Ação'].includes(explicit)) return 'STOCK';
    if (['CRYPTO', 'Cripto', 'Criptomoeda'].includes(explicit)) return 'CRYPTO';
    return 'OTHER';
  }
  const normalized = ticker.trim().toUpperCase();
  if (['SANB11', 'TAEE11', 'KLBN11', 'SAPR11'].includes(normalized) || /^[A-Z]{4}[3-6]$/.test(normalized)) return 'STOCK';
  if (['BTC', 'ETH', 'SOL', 'BTCBRL', 'ETHBRL', 'SOLBRL', 'XRP', 'ADA', 'BNB'].includes(normalized)) return 'CRYPTO';
  return 'OTHER';
}

/** Presence, not positivity, selects a source. Invalid observations also cannot fall through. */
export function selectSimulationInput(manual: number | '' | null | undefined, observed?: number | null, benchmark?: number | null): SimulationInput {
  const selected = manual !== '' && manual != null ? { raw: manual, source: 'manual' as const }
    : observed != null ? { raw: observed, source: 'quote' as const }
    : benchmark != null ? { raw: benchmark, source: 'benchmark' as const } : null;
  if (!selected) return { value: null, source: 'missing' };
  return { value: Number.isFinite(selected.raw) ? selected.raw : null, source: selected.source,
    ...(!Number.isFinite(selected.raw) ? { invalid: true } : {}) };
}

export function getInvestmentSimulationInputs(input: {
  ticker: string; assetClass?: string | null; quote?: Fundamentals | null; benchmark?: Fundamentals | null;
  manual?: Partial<Record<keyof Fundamentals, number | ''>>; minimumYieldRate: number;
}) {
  const select = (key: keyof Fundamentals) => selectSimulationInput(input.manual?.[key], input.quote?.[key], key === 'price' ? undefined : input.benchmark?.[key]);
  const price = select('price'), dividends = select('dividends12m'), vpa = select('vpa'), lpa = select('lpa');
  const assetClass = resolveSimulationAssetClass(input.ticker, input.assetClass);
  // Formula validity stays in the shared core. No fallback to precomputed quote prices.
  const pvp = calculatePvp(price.value ?? NaN, vpa.value ?? NaN);
  const bazinPrice = calculateBazinPrice(dividends.value ?? NaN, input.minimumYieldRate);
  const grahamPrice = assetClass === 'FII' ? (vpa.value != null && vpa.value > 0 ? vpa.value : null)
    : assetClass === 'STOCK' ? calculateGrahamPrice(lpa.value ?? NaN, vpa.value ?? NaN) : null;
  const fiiCeilingPrice = assetClass === 'FII' ? calculateBazinPrice(dividends.value ?? NaN, 8.75) : null;
  const dividendYield = dividends.value != null && dividends.value >= 0 && price.value != null && price.value > 0
    ? dividends.value / price.value * 100 : null;
  return { assetClass, price, dividends, vpa, lpa, pvp, bazinPrice, grahamPrice, fiiCeilingPrice, dividendYield };
}
