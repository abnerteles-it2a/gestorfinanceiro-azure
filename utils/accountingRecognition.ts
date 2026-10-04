import { assertDateOnly } from './creditCard';

export interface RecognitionEvent {
  id: string;
  sourceId: string;
  kind: 'income' | 'expense' | 'settlement';
  amount: number;
  recognitionDate?: string;
  cashDate?: string;
  cashDirection?: 'inflow' | 'outflow';
}

/** Expense/income belongs to recognitionDate, never inferred from invoice due date.
 * A settlement only moves cash; immediate purchases may provide both dates in one event.
 */
export function summarizeRecognition(events: RecognitionEvent[], startsOn: string, endsOn: string) {
  assertDateOnly(startsOn);
  assertDateOnly(endsOn);
  if (endsOn < startsOn) throw new Error('Invalid period');
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate recognition event');
  let income = 0, expenses = 0, inflows = 0, outflows = 0;
  const inPeriod = (date?: string) => !!date && date >= startsOn && date <= endsOn;
  for (const event of events) {
    if (!event.id.trim() || !event.sourceId.trim()) throw new Error('Event and source ids are required');
    const cents = Math.round(event.amount * 100);
    if (!Number.isFinite(event.amount) || event.amount < 0 || !Number.isSafeInteger(cents) || Math.abs(event.amount * 100 - cents) > 1e-6) throw new Error('Invalid amount');
    if (event.kind !== 'settlement' && !event.recognitionDate) throw new Error('Recognition date is required');
    if (event.recognitionDate) assertDateOnly(event.recognitionDate);
    if (event.cashDate) {
      assertDateOnly(event.cashDate);
      if (!event.cashDirection) throw new Error('Cash direction is required');
    }
    if (event.kind === 'settlement' && !event.cashDate) throw new Error('Settlement cash date is required');
    if (inPeriod(event.recognitionDate)) {
      if (event.kind === 'income') income += cents;
      if (event.kind === 'expense') expenses += cents;
    }
    if (inPeriod(event.cashDate)) {
      if (event.cashDirection === 'inflow') inflows += cents;
      if (event.cashDirection === 'outflow') outflows += cents;
    }
  }
  return { income: income / 100, expenses: expenses / 100, result: (income - expenses) / 100, inflows: inflows / 100, outflows: outflows / 100, netCash: (inflows - outflows) / 100 };
}
