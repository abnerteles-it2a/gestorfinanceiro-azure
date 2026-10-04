import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getApplicableCompetences, getObligationDueDate, getObligationStatus } from './meiObligationRules';

describe('MEI obligation rules', () => {
    it('uses the following month as the due month', () => {
        assert.equal(getObligationDueDate(2026, 1), '2026-02-20');
        assert.equal(getObligationDueDate(2026, 12), '2027-01-20');
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
