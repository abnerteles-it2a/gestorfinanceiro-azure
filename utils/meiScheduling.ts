import { getObligationDueDate, type MeiObligationStatus } from './meiObligationRules';

export interface MeiScheduleObligation {
    id: string;
    reference_year: number | string;
    reference_month: number | string;
    due_date?: string | null;
    principal_amount: number | string;
    interest_amount?: number | string;
    penalty_amount?: number | string;
    total_amount: number | string;
    status: MeiObligationStatus;
    source?: string;
    rules_version?: string;
    notes?: string | null;
}

/** Adapta o mês zero-based da UI ao contrato da API, sem emitir guia ou pagar. */
export const buildMeiScheduleRequest = (year: number, monthIndex: number, obligation?: MeiScheduleObligation) => {
    const estimatedDueDate = getObligationDueDate(year, monthIndex + 1);
    if (!obligation?.id || Number(obligation.reference_year) !== year || Number(obligation.reference_month) !== monthIndex + 1) {
        throw new Error('Cadastre a obrigação DAS desta competência antes de agendar.');
    }
    if (obligation.status === 'paid' || obligation.status === 'cancelled') {
        throw new Error('Não é possível agendar uma obrigação paga ou cancelada.');
    }
    const principalAmount = Number(obligation.principal_amount);
    const interestAmount = Number(obligation.interest_amount ?? 0);
    const penaltyAmount = Number(obligation.penalty_amount ?? 0);
    const totalAmount = Number(obligation.total_amount);
    if (![principalAmount, interestAmount, penaltyAmount, totalAmount].every(value => Number.isFinite(value) && value >= 0) || totalAmount <= 0) {
        throw new Error('Informe os valores da guia oficial antes de agendar.');
    }
    return {
        type: 'mei_obligation_upsert' as const,
        data: {
            id: obligation.id,
            referenceYear: year,
            referenceMonth: monthIndex + 1,
            // Nunca recalcular uma data persistida, mesmo que seja fim de semana.
            dueDate: obligation.due_date || estimatedDueDate,
            principalAmount,
            interestAmount,
            penaltyAmount,
            totalAmount,
            status: 'scheduled' as const,
            source: obligation.source || 'manual',
            rulesVersion: obligation.rules_version || 'mei-weekend-estimate-v1',
            notes: obligation.notes ?? null,
        },
    };
};
