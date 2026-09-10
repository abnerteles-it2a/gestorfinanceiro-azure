import { BankAccount, Transaction, TransactionType } from '../types';

/**
 * Normaliza e verifica se uma transação é do tipo Entrada / Receita.
 * Aceita variações: 'Entrada', 'entrada', 'income', 'receita', 'Receita'.
 */
export const isIncomeTx = (type?: string | null): boolean => {
  if (!type) return false;
  const t = String(type).trim().toLowerCase();
  return t === 'entrada' || t === 'income' || t === 'receita';
};

/**
 * Normaliza e verifica se uma transação é do tipo Saída / Despesa.
 * Aceita variações: 'Saída', 'saída', 'saida', 'expense', 'despesa', 'Despesa'.
 */
export const isExpenseTx = (type?: string | null): boolean => {
  if (!type) return false;
  const t = String(type).trim().toLowerCase();
  return t === 'saída' || t === 'saida' || t === 'expense' || t === 'despesa';
};

/**
 * Normaliza e verifica se uma transação é do tipo Transferência entre contas.
 * Aceita variações: 'Transferência', 'transferência', 'transferencia', 'transfer', 'Transfer'.
 */
export const isTransferTx = (type?: string | null): boolean => {
  if (!type) return false;
  const t = String(type).trim().toLowerCase();
  return t === 'transferência' || t === 'transferencia' || t === 'transfer';
};

/**
 * Normaliza qualquer variante textual de tipo para o enum canônico TransactionType.
 */
export const normalizeTransactionType = (type?: string | null): TransactionType => {
  if (isTransferTx(type)) return TransactionType.TRANSFER;
  if (isIncomeTx(type)) return TransactionType.INCOME;
  return TransactionType.EXPENSE;
};

/**
 * Calcula o efeito financeiro líquido de uma transação sobre uma conta ou visão global.
 *
 * Regras:
 * 1. Visão consolidada (selectedAccountId === 'all'):
 *    - Entrada: +amount
 *    - Saída: -amount
 *    - Transferência: 0 (não cria nem destrói patrimônio dentro da entidade)
 *
 * 2. Visão de conta específica:
 *    - Se for transferência:
 *        - Se a conta selecionada for a de origem (accountId): -amount (débito)
 *        - Se a conta selecionada for a de destino (toAccountId): +amount (crédito)
 *        - Caso contrário: 0
 *    - Se não for transferência:
 *        - Se accountId !== selectedAccountId: 0
 *        - Se Entrada: +amount
 *        - Se Saída: -amount
 */
export const calculateTransactionEffect = (
  tx: {
    transactionType?: string | null;
    amount?: number | string | null;
    accountId?: string | null;
    toAccountId?: string | null;
  },
  selectedAccountId: string = 'all'
): number => {
  const amount = Number(tx.amount || 0);
  if (isNaN(amount) || amount === 0) return 0;
  const type = tx.transactionType;

  // 1. Visão consolidada (Todas as contas)
  if (selectedAccountId === 'all') {
    if (isIncomeTx(type)) return amount;
    if (isExpenseTx(type)) return -amount;
    return 0; // Transferência interna líquida = 0
  }

  // 2. Transferência entre contas
  if (isTransferTx(type)) {
    if (tx.accountId === selectedAccountId) return -amount;
    if (tx.toAccountId === selectedAccountId) return amount;
    return 0;
  }

  // 3. Lançamento padrão em conta específica
  if (tx.accountId !== selectedAccountId) return 0;
  if (isIncomeTx(type)) return amount;
  if (isExpenseTx(type)) return -amount;

  return 0;
};

/**
 * Calcula os saldos em tempo real de cada conta a partir dos saldos iniciais e das transações.
 */
export const calculateAccountBalances = (
  accounts: BankAccount[],
  transactions: Transaction[]
): Record<string, number> => {
  const balances: Record<string, number> = {};

  // Inicializa com os saldos iniciais das contas
  accounts.forEach(acc => {
    balances[acc.id] = Number(acc.initialBalance || 0);
  });

  // Itera sobre as transações aplicando débitos e créditos
  transactions.forEach(tx => {
    const amount = Number(tx.amount || 0);
    if (isNaN(amount) || amount === 0) return;

    if (isTransferTx(tx.transactionType)) {
      // Débito na conta de origem
      if (tx.accountId && balances[tx.accountId] !== undefined) {
        balances[tx.accountId] -= amount;
      }
      // Crédito na conta de destino
      if (tx.toAccountId && balances[tx.toAccountId] !== undefined) {
        balances[tx.toAccountId] += amount;
      }
    } else if (isIncomeTx(tx.transactionType)) {
      if (tx.accountId && balances[tx.accountId] !== undefined) {
        balances[tx.accountId] += amount;
      }
    } else if (isExpenseTx(tx.transactionType)) {
      if (tx.accountId && balances[tx.accountId] !== undefined) {
        balances[tx.accountId] -= amount;
      }
    }
  });

  // Arredonda para 2 casas decimais
  Object.keys(balances).forEach(id => {
    balances[id] = Number(balances[id].toFixed(2));
  });

  return balances;
};
