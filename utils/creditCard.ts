export interface CreditCardConfig {
  id: string;
  closingDay: number;
  dueDay: number;
}

export interface CreditCardCycle {
  cardId: string;
  invoiceId: string;
  startsOn: string;
  closesOn: string;
  dueOn: string;
}

export interface CreditCardPurchase {
  id: string;
  cardId: string;
  purchasedOn: string;
  amount: number;
  installmentCount: number;
  recognitionDate?: string;
}

export interface CreditCardInstallment extends CreditCardCycle {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  installmentCount: number;
  amount: number;
  recognitionDate: string;
  bankDebit: 0;
}

/** Schedule only: no bank transaction is produced when a card purchase is registered. */
export function createCreditCardInstallments(purchase: CreditCardPurchase, card: CreditCardConfig): CreditCardInstallment[] {
  if (purchase.cardId !== card.id) throw new Error('Purchase card does not match cycle card');
  if (!purchase.id.trim()) throw new Error('Purchase id is required');
  if (!Number.isInteger(purchase.installmentCount) || purchase.installmentCount < 1 || purchase.installmentCount > 120) throw new Error('Installment count must be between 1 and 120');
  assertMoney(purchase.amount);
  assertDateOnly(purchase.recognitionDate ?? purchase.purchasedOn);
  const first = getCreditCardCycle(purchase.purchasedOn, card);
  const [year, month] = first.closesOn.split('-').map(Number);
  const cents = Math.round(purchase.amount * 100);
  const base = Math.floor(cents / purchase.installmentCount);
  const remainder = cents % purchase.installmentCount;
  const recognitionDate = purchase.recognitionDate ?? purchase.purchasedOn;
  return Array.from({ length: purchase.installmentCount }, (_, index) => ({
    ...getCreditCardCycle(calendarDate(year, month - 1 + index, card.closingDay), card),
    id: `${purchase.id}:${index + 1}`,
    purchaseId: purchase.id,
    installmentNumber: index + 1,
    installmentCount: purchase.installmentCount,
    amount: (base + (index < remainder ? 1 : 0)) / 100,
    recognitionDate,
    bankDebit: 0,
  }));
}

export interface CreditCardInvoicePayment {
  id: string;
  invoiceId: string;
  accountId: string;
  paidOn: string;
}

export interface CreditCardInvoiceSettlement extends CreditCardInvoicePayment {
  cardId: string;
  amount: number;
  bankDebit: number;
  recognizedExpense: 0;
  installmentIds: string[];
}

/** Full invoice settlement command; caller persists atomically and deduplicates payment/invoice ids. */
export function settleCreditCardInvoice(installments: CreditCardInstallment[], payment: CreditCardInvoicePayment): CreditCardInvoiceSettlement {
  assertDateOnly(payment.paidOn);
  if (!payment.accountId.trim()) throw new Error('Bank account id is required');
  if (!payment.id.trim()) throw new Error('Payment id is required');
  const selected = installments.filter(part => part.invoiceId === payment.invoiceId);
  if (!selected.length) throw new Error('Invoice has no installments');
  if (new Set(selected.map(part => part.id)).size !== selected.length) throw new Error('Duplicate installment link');
  if (selected.some(part => part.cardId !== selected[0].cardId)) throw new Error('Invoice card mismatch');
  const amount = selected.reduce((sum, part) => sum + Math.round(part.amount * 100), 0) / 100;
  return { ...payment, cardId: selected[0].cardId, amount, bankDebit: amount, recognizedExpense: 0, installmentIds: selected.map(part => part.id) };
}

function assertMoney(amount: number): void {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 1e-6) throw new Error('Invalid amount; use positive money with at most two decimals');
}

export function assertDateOnly(value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid date; expected YYYY-MM-DD');
  }
}

function calendarDate(year: number, month: number, day: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Date-only contract; purchases on closing day belong to that closing invoice. */
export function getCreditCardCycle(purchasedOn: string, card: CreditCardConfig): CreditCardCycle {
  assertDateOnly(purchasedOn);
  if (!card.id.trim()) throw new Error('Card id is required');
  for (const day of [card.closingDay, card.dueDay]) {
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Cycle day must be between 1 and 31');
  }
  const [year, month] = purchasedOn.split('-').map(Number);
  let closingMonth = month - 1;
  if (purchasedOn > calendarDate(year, closingMonth, card.closingDay)) closingMonth++;
  const closesOn = calendarDate(year, closingMonth, card.closingDay);
  const previousClosing = calendarDate(year, closingMonth - 1, card.closingDay);
  const startsOn = new Date(Date.parse(previousClosing) + 86400000).toISOString().slice(0, 10);
  const sameMonthDue = calendarDate(year, closingMonth, card.dueDay);
  const dueOn = sameMonthDue > closesOn ? sameMonthDue : calendarDate(year, closingMonth + 1, card.dueDay);
  return { cardId: card.id, invoiceId: `${card.id}:${closesOn.slice(0, 7)}`, startsOn, closesOn, dueOn };
}
