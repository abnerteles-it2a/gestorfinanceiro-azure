import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCreditCardCycle, createCreditCardInstallments, settleCreditCardInvoice } from './creditCard';

test('settlement rejects duplicate installment links and missing invoice instead of double debiting', () => {
  const parts = createCreditCardInstallments({ id: 'p', cardId: 'c', purchasedOn: '2027-01-01', amount: 100, installmentCount: 1 }, { id: 'c', closingDay: 20, dueDay: 5 });
  const payment = { id: 'payment', invoiceId: 'c:2027-01', accountId: 'bank', paidOn: '2027-02-05' };
  assert.throws(() => settleCreditCardInvoice([...parts, ...parts], payment), /duplicate/i);
  assert.throws(() => settleCreditCardInvoice([], payment), /invoice/i);
  assert.throws(() => settleCreditCardInvoice(parts, { ...payment, accountId: '' }), /account/i);
});

test('invoice settlement creates one linked bank debit without recognizing the expense again', () => {
  const parts = createCreditCardInstallments({ id: 'p', cardId: 'c', purchasedOn: '2027-01-01', amount: 100, installmentCount: 2 }, { id: 'c', closingDay: 20, dueDay: 5 });
  const settlement = settleCreditCardInvoice(parts, { id: 'payment-1', invoiceId: 'c:2027-01', accountId: 'bank-1', paidOn: '2027-02-05' });
  assert.deepEqual(settlement, { id: 'payment-1', invoiceId: 'c:2027-01', cardId: 'c', accountId: 'bank-1', paidOn: '2027-02-05', amount: 50, bankDebit: 50, recognizedExpense: 0, installmentIds: ['p:1'] });
});

test('installments preserve cents, purchase recognition and explicit invoice links without bank debits', () => {
  const parts = createCreditCardInstallments({ id: 'purchase-1', cardId: 'card-1', purchasedOn: '2027-01-31', amount: 100, installmentCount: 3 }, { id: 'card-1', closingDay: 31, dueDay: 31 });
  assert.deepEqual(parts.map(p => [p.amount, p.invoiceId, p.closesOn, p.dueOn, p.recognitionDate, p.bankDebit]), [
    [33.34, 'card-1:2027-01', '2027-01-31', '2027-02-28', '2027-01-31', 0],
    [33.33, 'card-1:2027-02', '2027-02-28', '2027-03-31', '2027-01-31', 0],
    [33.33, 'card-1:2027-03', '2027-03-31', '2027-04-30', '2027-01-31', 0],
  ]);
  assert.equal(parts[2].purchaseId, 'purchase-1');
  assert.equal(parts[2].installmentNumber, 3);
});

test('installments reject mismatched cards, fractional counts and invalid money', () => {
  const card = { id: 'card-1', closingDay: 20, dueDay: 5 };
  const purchase = { id: 'p', cardId: 'card-1', purchasedOn: '2027-01-01', amount: 100, installmentCount: 2 };
  assert.throws(() => createCreditCardInstallments({ ...purchase, cardId: 'other' }, card), /card/i);
  assert.throws(() => createCreditCardInstallments({ ...purchase, installmentCount: 1.5 }, card), /installment/i);
  assert.throws(() => createCreditCardInstallments({ ...purchase, amount: NaN }, card), /amount/i);
  assert.throws(() => createCreditCardInstallments({ ...purchase, amount: 1.001 }, card), /amount/i);
  assert.throws(() => createCreditCardInstallments({ ...purchase, recognitionDate: '2027-02-30' }, card), /date/i);
});

test('invalid dates and cycle days are rejected instead of silently rolling the calendar', () => {
  assert.throws(() => getCreditCardCycle('2027-02-30', { id: 'card-1', closingDay: 31, dueDay: 10 }), /date/i);
  assert.throws(() => getCreditCardCycle('2027-02-28', { id: 'card-1', closingDay: 0, dueDay: 10 }), /day/i);
});

test('purchase after December closing belongs to January invoice with its explicit window', () => {
  assert.deepEqual(getCreditCardCycle('2026-12-21', { id: 'card-1', closingDay: 20, dueDay: 5 }), {
    cardId: 'card-1', invoiceId: 'card-1:2027-01', startsOn: '2026-12-21', closesOn: '2027-01-20', dueOn: '2027-02-05',
  });
});
