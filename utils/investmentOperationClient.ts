import type { InvestmentDisposalRequest, InvestmentDisposalResponse, InvestmentDisposalResult } from '../types';

export function buildInvestmentDisposalRequest(input: {
    operationId: string; date: string; assetType: string; assetId?: string; ticker?: string;
    quantity: number; unitPrice: number; amount: number; cash: InvestmentDisposalRequest['cash'];
}): InvestmentDisposalRequest {
    if (input.assetType === 'Renda Fixa') {
        if (!input.assetId) throw new Error('Selecione o investimento de renda fixa a resgatar.');
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Principal deve ser maior que zero.');
        return { operationId: input.operationId, kind: 'fixed', assetId: input.assetId, date: input.date, principalAmount: input.amount, cash: input.cash };
    }
    if (!(Number.isFinite(input.unitPrice) && input.unitPrice > 0)) throw new Error('Preço unitário deve ser maior que zero.');
    const quantity = input.assetType === 'Criptomoeda' ? Number((input.amount / input.unitPrice).toFixed(8)) : input.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity * 1e8 - Math.round(quantity * 1e8)) > 0.00001) throw new Error('Quantidade deve ser positiva com até oito casas decimais.');
    return { operationId: input.operationId, kind: 'variable', date: input.date, assetId: input.assetId, assetType: input.assetType, ticker: input.ticker, quantity, cash: input.cash };
}

class InvestmentRejection extends Error {}

export async function sendInvestmentDisposal(request: InvestmentDisposalRequest, headers: Record<string, string>, transport: typeof fetch = fetch): Promise<InvestmentDisposalResponse> {
    if (!headers.authorization) throw new InvestmentRejection('Sessão autenticada necessária.');
    const response = await transport('/api/query', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'investment_dispose', data: request }) });
    const text = await response.text();
    if (!response.ok) {
        const definite = [400, 401, 402, 403, 404, 409].includes(response.status) || (response.status === 503 && /investment_operation_schema_unavailable|database_not_configured/.test(text));
        const ErrorType = definite ? InvestmentRejection : Error;
        throw new ErrorType(`Falha na operação (${response.status}): ${text}`);
    }
    const result = JSON.parse(text);
    if (result.operationId !== request.operationId || result.kind !== request.kind || typeof result.replayed !== 'boolean' || !Array.isArray(result.updated) || !Array.isArray(result.removedIds)) throw new Error('Resposta da operação inválida; tente novamente com a mesma operação.');
    return result;
}

export function createInvestmentOperationController(deps: {
    execute: (request: InvestmentDisposalRequest) => Promise<InvestmentDisposalResponse>;
    reconcile: () => Promise<void>;
    isCurrent: () => boolean;
    isRemote: () => boolean;
}) {
    let pending: InvestmentDisposalRequest | undefined;
    let committed: InvestmentDisposalResponse | undefined;
    let inFlight: Promise<InvestmentDisposalResult> | undefined;
    const run = async (request: InvestmentDisposalRequest): Promise<InvestmentDisposalResult> => {
            if (!deps.isCurrent()) return { status: 'stale', committed: !!committed, message: 'Usuário ou visão alterados; reabra a operação na visão original.' };
            if (!deps.isRemote()) return { status: 'error', committed: false, message: 'Venda e resgate exigem sessão autenticada e banco remoto.' };
            pending ??= Object.freeze({ ...request, cash: request.cash ? Object.freeze({ ...request.cash }) : null }) as InvestmentDisposalRequest;
            try {
                committed ??= await deps.execute(pending);
            } catch (error) {
                if (error instanceof InvestmentRejection) pending = undefined;
                return { status: 'error', committed: false, message: error instanceof Error ? error.message : 'Falha na operação.', ...(error instanceof InvestmentRejection ? { rejected: true as const } : {}) };
            }
            if (!deps.isCurrent()) return { status: 'stale', committed: true, message: 'Usuário ou visão alterados; reabra a operação na visão original.' };
            try {
                await deps.reconcile();
            } catch (error) {
                return { status: 'reconciliation_pending', committed: true, operationId: committed.operationId, message: error instanceof Error ? error.message : 'Atualização pendente.' };
            }
            if (!deps.isCurrent()) return { status: 'stale', committed: true, message: 'Usuário ou visão alterados; reabra a operação na visão original.' };
            const result: InvestmentDisposalResult = { status: 'success', committed: true, operationId: committed.operationId, replayed: committed.replayed };
            pending = undefined;
            committed = undefined;
            return result;
    };
    return {
        submit(request: InvestmentDisposalRequest): Promise<InvestmentDisposalResult> {
            inFlight ??= run(request).finally(() => { inFlight = undefined; });
            return inFlight;
        },
    };
}
