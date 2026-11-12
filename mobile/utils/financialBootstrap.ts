import { forecastCashFlow, type CashFlowObligation } from '../../utils/cashFlowForecast';

/** The complete ledger and snapshot are required: a history page is not a fallback. */
export function readFinancialBootstrap(data: any) {
  const snapshot = data?.financial_snapshot;
  if (!Array.isArray(data?.financial_transactions) || !Array.isArray(data?.transactions) || !Array.isArray(data?.accounts)
    || !Array.isArray(data?.investments) || !Array.isArray(data?.fixed_income_investments)
    || !Array.isArray(snapshot?.accounts) || !snapshot?.period) throw new Error('Snapshot financeiro incompleto; atualização pendente.');
  const number = (value: unknown) => {
    if (value == null || !Number.isFinite(Number(value))) throw new Error('Valor inválido no snapshot financeiro.');
    return Number(value);
  };
  const balances = new Map<string, number>(snapshot.accounts.map((row: any) => [row.id, number(row.balance)]));
  if (data.accounts.some((row: any) => !balances.has(row.id))) throw new Error('Saldo completo ausente.');
  return { balances, financialTransactions: data.financial_transactions as any[],
    monthIncome: number(snapshot.period.income), monthExpense: number(snapshot.period.expense) };
}

export function projectFinancialBalance(today: string, openingBalance: number, payables: CashFlowObligation[], receivables: CashFlowObligation[]) {
  return forecastCashFlow({ today, openingBalance, daysHorizon: 30, payables, receivables });
}
