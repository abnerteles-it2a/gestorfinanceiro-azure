export type MeiObligationStatus = 'pending' | 'scheduled' | 'paid' | 'overdue' | 'cancelled';

/** Competência: month é 1-based. Estimativa sem calendário oficial de feriados.
 * Datas oficiais/prorrogações já cadastradas devem prevalecer sobre esta regra.
 */
export const getObligationDueDate = (year: number, month: number): string => {
    if (!Number.isInteger(year) || year < 1000 || year > 9998 || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('invalid_mei_competence');
    }
    const date = new Date(Date.UTC(year, month, 20));
    if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
    else if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
};

export const getObligationStatus = ({ status, dueDate, today = new Date() }: {
    status: MeiObligationStatus;
    dueDate: string;
    today?: Date;
}): MeiObligationStatus => {
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (status === 'pending' && dueDate < todayDate) return 'overdue';
    return status;
};

export const getApplicableCompetences = ({ openingDate, today = new Date() }: {
    openingDate?: string;
    today?: Date;
}): Array<{ year: number; month: number; dueDate: string }> => {
    const start = openingDate && /^\d{4}-\d{2}-\d{2}$/.test(openingDate)
        ? new Date(`${openingDate.slice(0, 7)}-01T12:00:00`)
        : new Date(today.getFullYear(), 0, 1, 12);
    const end = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const result: Array<{ year: number; month: number; dueDate: string }> = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
        result.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1, dueDate: getObligationDueDate(cursor.getFullYear(), cursor.getMonth() + 1) });
    }
    return result;
};
