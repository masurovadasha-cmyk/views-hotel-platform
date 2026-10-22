/** Read snapshot of the persisted answer deadline; not an acceptance or first-message SLA.
 * Comparisons use JavaScript millisecond precision; original PostgreSQL timestamps stay intact.
 * This is a visibility hypothesis, never an automatic penalty or escalation decision.
 */
export type ConciergeSla = {
  policy: 'concierge-response-15m-v1';
  hypothesis: true;
  evaluatedAt: string;
  responseDueAt: string;
  state: 'pending' | 'overdue' | 'answered' | 'closed' | 'cancelled';
  overdueSeconds: number;
  answeredLate: boolean | null;
};

export function conciergeSla(
  receipt: {stage: string; responseDueAt: string; answeredAt: string | null},
  evaluatedAt: Date,
): ConciergeSla {
  const due = Date.parse(receipt.responseDueAt);
  const active = receipt.stage === 'requested' || receipt.stage === 'working';
  const elapsed = evaluatedAt.getTime() - due;
  const answered = receipt.stage === 'answered' || receipt.stage === 'closed';
  const state: ConciergeSla['state'] = active
    ? (elapsed > 0 ? 'overdue' : 'pending')
    : receipt.stage === 'cancelled' ? 'cancelled'
    : receipt.stage === 'closed' ? 'closed' : 'answered';
  return {
    policy: 'concierge-response-15m-v1',
    hypothesis: true,
    evaluatedAt: evaluatedAt.toISOString(),
    responseDueAt: receipt.responseDueAt,
    state,
    overdueSeconds: active ? Math.max(0, Math.floor(elapsed / 1000)) : 0,
    answeredLate: answered && receipt.answeredAt !== null ? Date.parse(receipt.answeredAt) > due : null,
  };
}
