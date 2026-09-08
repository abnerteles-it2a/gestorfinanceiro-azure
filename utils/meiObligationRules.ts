export type MeiObligationStatus = 'pending' | 'scheduled' | 'paid' | 'overdue' | 'cancelled';

export const getObligationDueDate = (year: number, month: number): string => {
    const date = new Date(year, month, 20, 12);
    return date.toISOString().slice(0, 10);
};

export const getObligationStatus = ({ status, dueDate, today = new Date() }: {
    status: MeiObligationStatus;
    dueDate: string;
    today?: Date;
}): MeiObligationStatus => {
    if (status === 'pending' && new Date(`${dueDate}T12:00:00`) < today) return 'overdue';
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
