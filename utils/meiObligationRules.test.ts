import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getApplicableCompetences, getObligationDueDate, getObligationStatus } from './meiObligationRules';

describe('MEI obligation rules', () => {
    it('uses the following month as the due month', () => {
        assert.equal(getObligationDueDate(2026, 1), '2026-02-20');
        assert.equal(getObligationDueDate(2026, 12), '2027-01-20');
    });

    it('moves Saturdays and Sundays to Monday without inventing holidays', () => {
        assert.equal(getObligationDueDate(2026, 5), '2026-06-22'); // Saturday
        assert.equal(getObligationDueDate(2026, 8), '2026-09-21'); // Sunday
        assert.equal(getObligationDueDate(2026, 10), '2026-11-20'); // No certified holiday calendar
        assert.equal(getObligationDueDate(2025, 11), '2025-12-22');
        assert.throws(() => getObligationDueDate(2026, 0));
        assert.throws(() => getObligationDueDate(2026, 13));
    });

    it('keeps pending status for the entire local due date', () => {
        assert.equal(getObligationStatus({ status: 'pending', dueDate: '2026-07-20', today: new Date(2026, 6, 20, 23, 59) }), 'pending');
        assert.equal(getObligationStatus({ status: 'pending', dueDate: '2026-07-20', today: new Date(2026, 6, 21, 0, 0) }), 'overdue');
    });

    it('generates competences across the December/January boundary', () => {
        assert.deepEqual(getApplicableCompetences({ openingDate: '2025-12-31', today: new Date(2026, 0, 2) }), [
            { year: 2025, month: 12, dueDate: '2026-01-20' },
            { year: 2026, month: 1, dueDate: '2026-02-20' },
        ]);
    });

    it('does not create competences before opening date', () => {
        const result = getApplicableCompetences({ openingDate: '2026-06-15', today: new Date('2026-08-10T12:00:00') });
        assert.deepEqual(result.map(item => `${item.year}-${item.month}`), ['2026-6', '2026-7', '2026-8']);
    });

    it('marks only pending obligations overdue', () => {
        const today = new Date('2026-08-10T12:00:00');
        assert.equal(getObligationStatus({ status: 'pending', dueDate: '2026-07-20', today }), 'overdue');
        assert.equal(getObligationStatus({ status: 'scheduled', dueDate: '2026-07-20', today }), 'scheduled');
        assert.equal(getObligationStatus({ status: 'paid', dueDate: '2026-07-20', today }), 'paid');
        assert.equal(getObligationStatus({ status: 'cancelled', dueDate: '2026-07-20', today }), 'cancelled');
    });
});
