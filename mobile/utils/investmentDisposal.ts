import { buildInvestmentDisposalRequest } from '../../utils/investmentOperationClient';
import { planLotReduction } from '../../utils/investmentLots';
import { assertDateOnly } from '../../utils/creditCard';
import type { InvestmentDisposalCash } from '../../types';

export function parseInvestmentDecimal(text: string, decimals = 8): number {
  // Quantity is not money: never round it to two decimals or parse a partial string.
  if (!new RegExp(`^\\d+(?:[,.]\\d{1,${decimals}})?$`).test(text.trim())) throw new Error('Número inválido; use vírgula ou ponto decimal, sem separador de milhar.');
  const number = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) throw new Error('Informe um valor positivo.');
  return number;
}

export function buildMobileDisposal(input: {
  operationId: string; ticker: string; assetType: string; date: string; quantity: number; unitPrice: number;
  cash: InvestmentDisposalCash; editingId?: string;
  lots: { id: string; ticker: string; type: string; quantity: number; purchaseDate: string }[];
}) {
  if (input.editingId) throw new Error('Não transforme edição de lote em venda. Abra uma nova operação de venda.');
  assertDateOnly(input.date);
  if (!input.ticker.trim() || !input.assetType.trim() || input.assetType === 'Renda Fixa') throw new Error('Selecione um instrumento de renda variável válido.');
  const units = (quantity: number) => {
    const value = Math.round(quantity * 1e8);
    if (!Number.isSafeInteger(value) || quantity < 0 || Math.abs(quantity * 1e8 - value) > 1e-6) throw new Error('Quantidade inválida; limite de oito casas decimais.');
    return value;
  };
  const ticker = input.ticker.trim().toUpperCase();
  const lots = input.lots.filter(lot => lot.ticker.toUpperCase() === ticker && lot.type === input.assetType);
  planLotReduction(lots.map(lot => ({ ...lot, quantity: units(lot.quantity) })), units(input.quantity));
  if (lots.some(lot => lot.purchaseDate.slice(0, 10) > input.date)) throw new Error('Venda anterior à aquisição de lote aberto; revise as datas.');
  const amount = Math.round(input.quantity * input.unitPrice * 100) / 100;
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount <= 0 || !input.cash.accountId || !input.cash.category.trim()) throw new Error('Conta, categoria e valor de caixa positivo são obrigatórios.');
  const request = buildInvestmentDisposalRequest({ ...input, ticker,
    amount: input.quantity * input.unitPrice, cash: { ...input.cash, amount } });
  return request;
}
