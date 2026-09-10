import test from 'node:test';
import assert from 'node:assert/strict';

// Core financial valuation formulas used across marketDataService and InvestmentSimulator
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

test('Valuation: P/VP Calculation', () => {
  // Test dynamic calculation (must NOT be hardcoded 0.98)
  assert.equal(calculatePvp(10.0, 10.0), 1.00);
  assert.equal(calculatePvp(9.80, 10.0), 0.98);
  assert.equal(calculatePvp(38.50, 42.0), 0.92);
  assert.equal(calculatePvp(112.50, 100.0), 1.13);

  // Invalid inputs return null
  assert.equal(calculatePvp(10.0, 0), null);
  assert.equal(calculatePvp(10.0, -5), null);
  assert.equal(calculatePvp(0, 10), null);
});

test('Valuation: Teto Bazin Formula (Dividends / Min Yield)', () => {
  // Classic 6% Décio Bazin
  // e.g. PETR4 with R$ 4.20 dividends / 0.06 = R$ 70.00
  assert.equal(calculateBazinPrice(4.20, 6), 70.00);

  // BBAS3 with R$ 2.45 dividends / 0.06 = R$ 40.83
  assert.equal(calculateBazinPrice(2.45, 6), 40.83);

  // Custom Bazin rate: 8% minimum yield
  assert.equal(calculateBazinPrice(4.00, 8), 50.00);

  // High NTN-B benchmark yield: 10%
  assert.equal(calculateBazinPrice(1.20, 10), 12.00);

  // Edge cases: 0 or negative dividends or rate
  assert.equal(calculateBazinPrice(0, 6), null);
  assert.equal(calculateBazinPrice(-1.5, 6), null);
  assert.equal(calculateBazinPrice(3.0, 0), null);
});

test('Valuation: Preço Justo Graham Formula (sqrt(22.5 * LPA * VPA))', () => {
  // e.g. Stock with LPA = 4.00, VPA = 25.00 => 22.5 * 4 * 25 = 2250 => sqrt(2250) = 47.43
  assert.equal(calculateGrahamPrice(4.00, 25.00), 47.43);

  // BBAS3 example: LPA = 4.20, VPA = 33.50 => 22.5 * 4.2 * 33.5 = 3165.75 => sqrt(3165.75) = 56.26
  assert.equal(calculateGrahamPrice(4.20, 33.50), 56.26);

  // Negative LPA (loss-making company) should return null (Graham does not apply to deficit companies)
  assert.equal(calculateGrahamPrice(-2.0, 15.0), null);
  assert.equal(calculateGrahamPrice(3.0, -10.0), null);
  assert.equal(calculateGrahamPrice(0, 20.0), null);
});

test('Valuation: Margem de Segurança (Safety Margin %)', () => {
  // Current price = 30.00, Ceiling = 45.00 => (45 - 30) / 30 * 100 = +50.0%
  assert.equal(calculateSafetyMargin(45.00, 30.00), 50.0);

  // Current price = 50.00, Ceiling = 40.00 => (40 - 50) / 50 * 100 = -20.0%
  assert.equal(calculateSafetyMargin(40.00, 50.00), -20.0);

  // No ceiling price available
  assert.equal(calculateSafetyMargin(null, 30.00), null);
});
