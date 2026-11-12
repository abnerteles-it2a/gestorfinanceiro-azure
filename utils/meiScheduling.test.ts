import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMeiScheduleRequest, type MeiScheduleObligation } from './meiScheduling';

const obligation = (overrides: Partial<MeiScheduleObligation> = {}): MeiScheduleObligation => ({
    id: 'das-1', reference_year: 2026, reference_month: 12,
    principal_amount: '80', interest_amount: '2', penalty_amount: '3', total_amount: '85',
    status: 'pending', source: 'manual', rules_version: 'official-input', notes: 'Data conferida no PGMEI',
    ...overrides,
});

describe('MEI scheduling request contract', () => {
    it('converts UI December and January to API competences and following-month due dates', () => {
        const december = buildMeiScheduleRequest(2026, 11, obligation());
        assert.equal(december.data.referenceMonth, 12);
        assert.equal(december.data.dueDate, '2027-01-20');
        const january = buildMeiScheduleRequest(2026, 0, obligation({ reference_month: 1 }));
        assert.equal(january.data.referenceMonth, 1);
        assert.equal(january.data.dueDate, '2026-02-20');
    });
    it('uses weekend adjustment only when no persisted due date exists', () => {
        assert.equal(buildMeiScheduleRequest(2026, 5, obligation({ reference_month: 6 })).data.dueDate, '2026-07-20');
        assert.equal(buildMeiScheduleRequest(2026, 8, obligation({ reference_month: 9 })).data.dueDate, '2026-10-20');
        assert.equal(buildMeiScheduleRequest(2026, 4, obligation({ reference_month: 5 })).data.dueDate, '2026-06-22');
    });
    it('preserves registered overrides verbatim, id, breakdown and provenance on upsert', () => {
        for (const due_date of ['2027-02-05', '2027-01-23']) {
            const existing = obligation({ due_date });
            assert.deepEqual(buildMeiScheduleRequest(2026, 11, existing), {
                type: 'mei_obligation_upsert', data: {
                    id: 'das-1', referenceYear: 2026, referenceMonth: 12, dueDate: due_date,
                    principalAmount: 80, interestAmount: 2, penaltyAmount: 3, totalAmount: 85,
                    status: 'scheduled', source: 'manual', rulesVersion: 'official-input', notes: existing.notes,
                },
            });
            assert.equal(existing.status, 'pending');
        }
    });
    it('rejects missing, mismatched, terminal and zero-value obligations', () => {
        assert.throws(() => buildMeiScheduleRequest(2026, 11));
        for (const patch of [{ reference_month: 1 }, { reference_year: 2025 }, { status: 'paid' as const }, { status: 'cancelled' as const }, { total_amount: 0 }, { total_amount: 'NaN' }]) {
            assert.throws(() => buildMeiScheduleRequest(2026, 11, obligation(patch)));
        }
        assert.throws(() => buildMeiScheduleRequest(2026, -1, obligation()));
        assert.throws(() => buildMeiScheduleRequest(2026, 12, obligation()));
    });
});
