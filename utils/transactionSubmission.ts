import { TransactionType, type Transaction } from '../types';
import { assertDateOnly, createCreditCardInstallments } from './creditCard';
import { calcDataParcelas } from './financial';
import { dateKey } from './formatters';

type Draft = Omit<Transaction, 'id'>;
type ViewMode = 'personal' | 'organization';
export interface TransactionSubmissionInput {
    transaction: Draft;
    purchaseDate: string;
    today: string;
    count: number;
    frequency: 'monthly' | 'weekly';
    closingDay: number;
    dueDay: number;
    viewMode: ViewMode;
}
interface ObligationPayload {
    operationId: string;
    title: string;
    amount: number;
    dueDate: string;
    issueDate: string;
    category: string;
    costCenterId?: string;
    isRecurring: boolean;
    isBusinessRevenue?: boolean;
    isBusinessExpense?: boolean;
    notes: string;
}
type SubmissionStep = { type: 'transaction'; data: Draft } | {
    type: 'payables_insert' | 'receivables_insert'; data: ObligationPayload;
};

/** Builds obligations, not bank debits, for EVERY card purchase, including overdue ones. */
export function buildTransactionSubmission(input: TransactionSubmissionInput): SubmissionStep[] {
    const { transaction: tx, purchaseDate, today, count } = input;
    assertDateOnly(purchaseDate);
    assertDateOnly(today);
    if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Quantidade deve estar entre 1 e 60.');
    if (!Number.isFinite(tx.amount) || tx.amount <= 0) throw new Error('Informe um valor positivo.');
    const card = tx.paymentMethod === 'Cartão de Crédito' && tx.transactionType === TransactionType.EXPENSE;
    const installments = card ? createCreditCardInstallments({
        id: 'submission', cardId: tx.accountId, purchasedOn: purchaseDate,
        recognitionDate: purchaseDate, amount: tx.amount, installmentCount: count,
    }, { id: tx.accountId, closingDay: input.closingDay, dueDay: input.dueDay }) : [];
    const dates = input.frequency === 'monthly'
        ? calcDataParcelas(count, `${purchaseDate}T12:00:00Z`).map(value => value.slice(0, 10))
        : Array.from({ length: count }, (_, index) => new Date(Date.parse(`${purchaseDate}T12:00:00Z`) + index * 7 * 86400000).toISOString().slice(0, 10));
    return Array.from({ length: count }, (_, index): SubmissionStep => {
        const dueDate = card ? installments[index].dueOn : dates[index];
        const label = count > 1 ? `${tx.description} (${index + 1}/${count})` : tx.description;
        if (card || (dueDate > today && tx.transactionType !== TransactionType.TRANSFER)) {
            return {
                type: tx.transactionType === TransactionType.INCOME ? 'receivables_insert' : 'payables_insert',
                data: {
                    operationId: crypto.randomUUID(),
                    title: card ? `Compra no cartão: ${label}` : label,
                    amount: card ? installments[index].amount : tx.amount,
                    dueDate,
                    issueDate: card ? purchaseDate : dates[index],
                    category: tx.category,
                    costCenterId: tx.costCenterId,
                    isRecurring: count > 1,
                    isBusinessRevenue: tx.isBusinessRevenue,
                    isBusinessExpense: tx.isBusinessExpense,
                    notes: card ? `Compra em ${purchaseDate}; fechamento em ${installments[index].closesOn}. Pagamento não confirmado.` : `Recorrência gerada em ${today}`,
                },
            };
        }
        return { type: 'transaction', data: { ...tx, date: dueDate, description: label } };
    });
}

export function hasPotentialTransactionDuplicate(tx: Draft, transactions: Transaction[]): boolean {
    const normalize = (value: string) => (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return transactions.some(existing => {
        const sameAccount = existing.accountId === tx.accountId && existing.transactionType === tx.transactionType
            && (tx.transactionType !== TransactionType.TRANSFER || existing.toAccountId === tx.toAccountId);
        const a = normalize(existing.description), b = normalize(tx.description);
        return sameAccount && Math.abs(existing.amount - tx.amount) < 0.01 && dateKey(existing.date) === dateKey(tx.date)
            && (a === b || a.includes(b) || b.includes(a));
    });
}

class SubmissionRejection extends Error {}

export async function sendTransactionObligation(
    step: Exclude<SubmissionStep, { type: 'transaction' }>,
    viewMode: ViewMode,
    token: string,
    transport: typeof fetch = fetch,
): Promise<void> {
    if (!token) throw new SubmissionRejection('Sessão autenticada necessária.');
    const response = await transport('/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-view-mode': viewMode },
        body: JSON.stringify(step),
    });
    if (!response.ok) {
        // Timeout/5xx may follow a commit; obligations replay the same operationId.
        const definite = response.status >= 400 && response.status < 500 && response.status !== 408;
        throw new (definite ? SubmissionRejection : Error)(`Cadastro rejeitado (HTTP ${response.status}).`);
    }
    const result = await response.json();
    if (result.operationId !== step.data.operationId || typeof result.replayed !== 'boolean'
        || !Array.isArray(result.rows) || result.rows.length !== 1 || !result.rows[0]?.id) {
        throw new Error('Resposta de criação inválida; confirmação da operação pendente.');
    }
}

export interface TransactionSubmissionResult {
    status: 'duplicate_confirmation' | 'success' | 'error' | 'stale';
    confirmed: number;
    total: number;
    retryBlocked: boolean;
    message?: string;
}

/** Session-local batch progress, not atomic. Obligation replay requires the API operationId journal. */
export function createTransactionSubmission(input: TransactionSubmissionInput, deps: {
    duplicate: boolean;
    isCurrent: () => boolean;
    getToken: () => string;
    addTransaction: (transaction: Draft) => Promise<void>;
    transport?: typeof fetch;
}) {
    const steps = buildTransactionSubmission(input);
    const viewMode = input.viewMode;
    let confirmed = 0;
    let duplicateAccepted = !deps.duplicate;
    let retryBlocked = false;
    let inFlight: Promise<TransactionSubmissionResult> | undefined;
    const result = (status: TransactionSubmissionResult['status'], message?: string): TransactionSubmissionResult => ({ status, confirmed, total: steps.length, retryBlocked, message });
    const uncertain = 'Resultado incerto: confira os registros antes de cadastrar novamente. Reenvio bloqueado sem idempotência no servidor.';
    const run = async (confirmDuplicate: boolean): Promise<TransactionSubmissionResult> => {
        if (!deps.isCurrent()) return result('stale', 'Usuário ou visão alterados. Retorne ao escopo original para continuar.');
        if (retryBlocked) return result('error', uncertain);
        duplicateAccepted = duplicateAccepted || confirmDuplicate;
        if (!duplicateAccepted) return result('duplicate_confirmation');
        while (confirmed < steps.length) {
            if (!deps.isCurrent()) return result('stale', 'Usuário ou visão alterados. Retorne ao escopo original para continuar.');
            const step = steps[confirmed];
            try {
                if (step.type === 'transaction') await deps.addTransaction({ ...step.data });
                else await sendTransactionObligation(step, viewMode, deps.getToken(), deps.transport);
                confirmed++;
            } catch (error) {
                retryBlocked = step.type === 'transaction';
                const message = error instanceof SubmissionRejection ? error.message
                    : 'Resposta não confirmada. Tente novamente com a mesma operação; não recadastre os itens.';
                return result('error', retryBlocked ? uncertain : message);
            }
        }
        if (!deps.isCurrent()) return result('stale', 'Escopo alterado; registros confirmados na visão original.');
        return result('success');
    };
    return {
        submit(confirmDuplicate = false): Promise<TransactionSubmissionResult> {
            inFlight ??= run(confirmDuplicate).finally(() => { inFlight = undefined; });
            return inFlight;
        },
    };
}
