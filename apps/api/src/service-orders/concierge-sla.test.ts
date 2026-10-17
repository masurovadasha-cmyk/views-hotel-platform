import {describe, expect, it} from 'vitest';
import {conciergeSla} from './concierge-sla';

const due = '2026-10-12T08:15:00.000Z';
const receipt = {stage: 'requested', responseDueAt: due, answeredAt: null};
describe('Concierge answer deadline snapshot', () => {
  it('uses the persisted deadline and server evaluation instant including exact boundary', () => {
    expect(conciergeSla(receipt, new Date(due))).toMatchObject({state: 'pending', overdueSeconds: 0, hypothesis: true, answeredLate: null});
    expect(conciergeSla(receipt, new Date('2026-10-12T08:15:01.900Z'))).toMatchObject({state: 'overdue', overdueSeconds: 1});
    expect(conciergeSla({...receipt, stage: 'working'}, new Date('2026-10-12T08:14:00Z'))).toMatchObject({state: 'pending', overdueSeconds: 0});
  });
  it('stops active lateness when answered/closed but retains whether the answer was late', () => {
    for (const stage of ['answered', 'closed']) {
      expect(conciergeSla({...receipt, stage, answeredAt: due}, new Date('2026-10-13T10:00:00Z'))).toMatchObject({state: stage, overdueSeconds: 0, answeredLate: false});
      expect(conciergeSla({...receipt, stage, answeredAt: '2026-10-12T08:15:00.001Z'}, new Date('2026-10-13T10:00:00Z'))).toMatchObject({state: stage, overdueSeconds: 0, answeredLate: true});
      expect(conciergeSla({...receipt, stage}, new Date(due)).answeredLate).toBeNull();
    }
  });
  it('does not imply completed answer or active timer after cancellation', () => {
    expect(conciergeSla({...receipt, stage: 'cancelled', answeredAt: due}, new Date('2026-10-13T10:00:00Z'))).toMatchObject({state: 'cancelled', overdueSeconds: 0, answeredLate: null});
  });
  it('compares instants independent of timezone and reports server snapshot', () => {
    expect(conciergeSla({...receipt, responseDueAt: '2026-10-12T13:15:00+05:00'}, new Date(due))).toMatchObject({state: 'pending', evaluatedAt: due});
  });
});
