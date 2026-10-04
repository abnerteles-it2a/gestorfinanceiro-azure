const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function calculatePvp(price: number, vpa: number): number | null {
  return positive(price) && positive(vpa) ? Number((price / vpa).toFixed(2)) : null;
}
export function calculateBazinPrice(dividends12m: number, minimumYieldRate = 6): number | null {
  return positive(dividends12m) && positive(minimumYieldRate) ? Number((dividends12m / (minimumYieldRate / 100)).toFixed(2)) : null;
}
export function calculateGrahamPrice(lpa: number, vpa: number): number | null {
  const product = 22.5 * lpa * vpa;
  return positive(lpa) && positive(vpa) && Number.isFinite(product) ? Number(Math.sqrt(product).toFixed(2)) : null;
}
export function calculateSafetyMargin(ceilingPrice: number | null, currentPrice: number): number | null {
  return positive(ceilingPrice) && positive(currentPrice) ? Number(((ceilingPrice / currentPrice - 1) * 100).toFixed(1)) : null;
}
