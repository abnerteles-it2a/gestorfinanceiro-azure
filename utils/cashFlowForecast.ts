import { assertDateOnly } from './creditCard';

export interface CashFlowObligation {
  id?: string;
  due_date?: string;
  dueDate?: string;
  amount: number | string;
  status?: string;
  paid_amount?: number | string;
  received_amount?: number | string;
  settledAmount?: number | string;
}

export interface CashFlowPoint {
  date: string;
  label: string;
  balance: number;
  inflows: number;
  outflows: number;
}

/** Known obligations only, not a historical-burn extrapolation. Overdue amounts are
 * assumed to settle today (scenario, not a claim that payment has happened).
 * Opening balance already includes settled bank movements.
 */
export function forecastCashFlow(input: { today: string; daysHorizon: number; openingBalance: number; payables: CashFlowObligation[]; receivables: CashFlowObligation[] }) {
  assertDateOnly(input.today);
  if (!Number.isInteger(input.daysHorizon) || input.daysHorizon < 0 || input.daysHorizon > 366) throw new Error('Forecast horizon must be between 0 and 366 days');
  if (!Number.isFinite(input.openingBalance) || !Number.isSafeInteger(Math.round(input.openingBalance * 100))) throw new Error('Invalid opening balance');
  const forecastPoints: CashFlowPoint[] = [];
  let balance = Math.round(input.openingBalance * 100);
  let minBalance = balance;
  let minBalanceDate = input.today;
  let totalIn = 0, totalOut = 0;
  const scheduled = (rows: CashFlowObligation[], direction: 'inflow' | 'outflow') => {
    const seen = new Set<string>();
    return rows.flatMap(row => {
      if (row.status && !['open', 'overdue', 'partial'].includes(row.status.toLowerCase())) return [];
      const date = (row.due_date ?? row.dueDate ?? '').slice(0, 10);
      try { assertDateOnly(date); } catch { return []; }
      if (row.id && seen.has(row.id)) return [];
      if (row.id) seen.add(row.id);
      const settled = Number(row.settledAmount ?? (direction === 'outflow' ? row.paid_amount : row.received_amount) ?? 0);
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || !Number.isFinite(settled) || amount < 0 || settled < 0) return [];
      return [{ date: date <= input.today ? input.today : date, cents: Math.max(0, Math.round(amount * 100) - Math.round(settled * 100)) }];
    });
  };
  const receivables = scheduled(input.receivables, 'inflow');
  const payables = scheduled(input.payables, 'outflow');
  for (let day = 0; day <= input.daysHorizon; day++) {
    const date = new Date(Date.parse(input.today) + day * 86400000).toISOString().slice(0, 10);
    const inflows = receivables.filter(row => row.date === date).reduce((sum, row) => sum + row.cents, 0);
    const outflows = payables.filter(row => row.date === date).reduce((sum, row) => sum + row.cents, 0);
    balance += inflows - outflows;
    totalIn += inflows;
    totalOut += outflows;
    if (balance < minBalance) { minBalance = balance; minBalanceDate = date; }
    forecastPoints.push({ date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}`, balance: balance / 100, inflows: inflows / 100, outflows: outflows / 100 });
  }
  return { forecastPoints, minBalance: minBalance / 100, minBalanceDate, totalProjectedInflow: totalIn / 100, totalProjectedOutflow: totalOut / 100 };
}
