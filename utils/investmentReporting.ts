import { TransactionType } from '../types';

/** Indicative sales-volume monitor, not a tax assessment or gain calculation. */
export function summarizeInvestmentSales(transactions: readonly { date: string; description?: string; category?: string; amount: number; transactionType: string }[], asOf: Date) {
  let stockSalesVolume = 0;
  let fiiSalesVolume = 0;
  let cryptoSalesVolume = 0;
  const units = new Set(['TAEE11', 'SANB11', 'KLBN11', 'ALUP11', 'BPAC11', 'ENGI11', 'SAPR11', 'RNEW11', 'IGTI11', 'PINE11', 'BRBI11']);
  const etfs = new Set(['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11', 'GOLD11', 'DIVO11', 'BBSD11', 'SPXI11', 'BRAX11']);
  const month = asOf.toISOString().slice(0, 7);
  for (const transaction of transactions) {
    if (transaction.date.slice(0, 7) !== month || transaction.transactionType !== TransactionType.INCOME || !Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;
    const text = `${transaction.description ?? ''} ${transaction.category ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (!/\b(VENDA|RESGATE)\b/.test(text) || /\b(CDB|LCI|LCA|TESOURO|RENDA FIXA|PREVIDENCIA)\b/.test(text)) continue;
    const ticker = text.match(/\b[A-Z]{4}\d{1,2}\b/)?.[0];
    if (ticker && etfs.has(ticker)) continue;
    if (/\b(BTC|ETH|SOL|CRIPTO|CRIPTOMOEDAS?)\b/.test(text)) cryptoSalesVolume += transaction.amount;
    else if (ticker && units.has(ticker)) stockSalesVolume += transaction.amount;
    else if (/\b(FII|FIIS|FUNDO IMOBILIARIO)\b/.test(text) || ticker?.endsWith('11')) fiiSalesVolume += transaction.amount;
    else if (ticker && /[3-6]$/.test(ticker) || /\b(ACAO|ACOES)\b/.test(text)) stockSalesVolume += transaction.amount;
  }
  const nextMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 2, 0));
  while (nextMonth.getUTCDay() === 0 || nextMonth.getUTCDay() === 6) nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return {
    stockSalesVolume, fiiSalesVolume, cryptoSalesVolume,
    stockRemainingExemption: Math.max(0, 20000 - stockSalesVolume), stockExemptionUsedPct: Math.min(100, stockSalesVolume / 20000 * 100), isStockExempt: stockSalesVolume <= 20000,
    cryptoRemainingExemption: Math.max(0, 35000 - cryptoSalesVolume), cryptoExemptionUsedPct: Math.min(100, cryptoSalesVolume / 35000 * 100), isCryptoExempt: cryptoSalesVolume <= 35000,
    darfDueDate: nextMonth.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
  };
}

export interface DividendPattern {
  type: 'Dividendo' | 'JCP' | 'Rendimento FII';
  months: number[];
  avgPerShare: number;
}

/** Historical habits are estimates, never announced events or eligibility dates. */
export function projectDividendCalendar(
  holdings: readonly { ticker: string; quantity: number; purchasePrice: number }[],
  quotes: Record<string, { price?: number | null }>,
  patterns: Record<string, DividendPattern>,
  asOf: Date,
) {
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 15));
  if (start.getTime() < asOf.getTime()) start.setUTCMonth(start.getUTCMonth() + 1);
  const monthlyCashFlow = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 15));
    return { date, month: `${monthNames[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(-2)}`, total: 0 };
  });
  const grouped = new Map<string, { quantity: number; cost: number }>();
  for (const holding of holdings) {
    if (!(holding.quantity > 0) || !Number.isFinite(holding.quantity)) continue;
    const ticker = holding.ticker.trim().toUpperCase();
    const item = grouped.get(ticker) ?? { quantity: 0, cost: 0 };
    item.quantity += holding.quantity;
    item.cost += holding.purchasePrice * holding.quantity;
    grouped.set(ticker, item);
  }
  const upcomingDividends: { id: string; ticker: string; type: DividendPattern['type']; amountPerShare: number; totalAmount: number; dataCom: null; dataPag: string; status: 'previsto' }[] = [];
  const snowballStats: { ticker: string; totalReceived: number; unitPrice: number; newShares: number }[] = [];
  let totalAnnualProjected = 0;
  for (const [ticker, holding] of grouped) {
    const pattern = patterns[ticker];
    if (!pattern || !Number.isFinite(pattern.avgPerShare) || pattern.avgPerShare < 0) continue;
    const quote = quotes[ticker]?.price;
    const price = quote != null && Number.isFinite(quote) && quote >= 0 ? quote : holding.cost / holding.quantity;
    let annual = 0;
    for (const month of monthlyCashFlow) {
      if (!pattern.months.includes(month.date.getUTCMonth() + 1)) continue;
      const total = pattern.avgPerShare * holding.quantity;
      const date = month.date.toISOString().slice(0, 10);
      month.total += total;
      annual += total;
      upcomingDividends.push({ id: `${ticker}-${date}`, ticker, type: pattern.type, amountPerShare: pattern.avgPerShare, totalAmount: total, dataCom: null, dataPag: date, status: 'previsto' });
    }
    totalAnnualProjected += annual;
    snowballStats.push({ ticker, totalReceived: annual, unitPrice: price, newShares: price > 0 ? Math.floor(annual / price) : 0 });
  }
  return { upcomingDividends: upcomingDividends.sort((a, b) => a.dataPag.localeCompare(b.dataPag)), monthlyCashFlow: monthlyCashFlow.map(({ month, total }) => ({ month, total: Math.round(total) })), totalAnnualProjected, snowballStats: snowballStats.sort((a, b) => b.totalReceived - a.totalReceived) };
}
