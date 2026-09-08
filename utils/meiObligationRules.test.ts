import { describe, expect, it } from 'vitest';
import { getApplicableCompetences, getObligationDueDate, getObligationStatus } from './meiObligationRules';

describe('MEI obligation rules', () => {
    it('uses the following month as the due month', () => {
        expect(getObligationDueDate(2026, 1)).toBe('2026-02-20');
        expect(getObligationDueDate(2026, 12)).toBe('2027-01-20');
    });

    it('does not create competences before opening date', () => {
        const result = getApplicableCompetences({ openingDate: '2026-06-15', today: new Date('2026-08-10T12:00:00') });
        expect(result.map(item => `${item.year}-${item.month}`)).toEqual(['2026-6', '2026-7', '2026-8']);
    });

    it('marks only pending obligations overdue', () => {
        const today = new Date('2026-08-10T12:00:00');
        expect(getObligationStatus({ status: 'pending', dueDate: '2026-07-20', today })).toBe('overdue');
        expect(getObligationStatus({ status: 'scheduled', dueDate: '2026-07-20', today })).toBe('scheduled');
        expect(getObligationStatus({ status: 'paid', dueDate: '2026-07-20', today })).toBe('paid');
        expect(getObligationStatus({ status: 'cancelled', dueDate: '2026-07-20', today })).toBe('cancelled');
    });
});
