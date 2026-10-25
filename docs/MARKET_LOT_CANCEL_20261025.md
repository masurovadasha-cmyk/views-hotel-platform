# M1: atomic cancellation of private market lot reservations

Base: `20decdfff77b2fb59e73496e6e374d1e42e7638b`. Additive migration 0134; migrations 0001–0133 and their manifest entries remain unchanged.

## Defect and bounded fix

Before this change, the first cancellation of a synthetic order with an active private lot reservation failed at transaction commit with `LOT_RESERVE_ACTIVE`. The existing cancellation changed order status but did not release `market_lot_reservations`; migration 0117 correctly prevented an inconsistent terminal state.

Migration 0134 replaces only `service_private.market_cancel`, preserving its existing payload, registry/session checks, guest ownership locks, revision checks, advisory key lock, stay/order locks and sorted supply-item locks. After eligibility validation it sets `released_at` on this order's active lot rows, constrained by organization and property, before changing the order to cancelled. Final authorization and existing command/audit/outbox recording remain inside the same transaction. A late error or rollback restores every hold and the order state. Historical released rows are not edited, deleted or reactivated. There is no additional physical stock movement, charge, refund or payment.

Guest cancellation remains limited to `reserved`; staff cancellation accepts `reserved`, `picking`, or `ready`. Replays return the existing cancellation receipt without a second release/event; changed payloads still conflict. A competing handover with active private lot holds remains gated and cannot escape with a stock issue. This milestone deliberately does not implement replacement (M2), lot-aware handover (M3), FEFO, delivery, or runtime reserve activation.

## Verification

`scripts/market-lot-cancel-proof.cjs` is called by the existing disposable `market-lot-reserve-proof.cjs` after the private reserve/release proof. It reuses its synthetic stock fixture but creates complete receipt-shaped market orders and a synthetic guest identity. Initial lot holds are owner-seeded; cancellation calls run under `SET LOCAL ROLE views_app`. No new runtime grants or persistent credentials are created.

Coverage:

- Guest reserved and staff reserved/picking/ready cancellation; one command, one audit and one outbox event, unchanged stock/movement count and no folio entry.
- Same-key replay, changed-payload denial, whole-transaction rollback restoring active holds.
- Guest picking denial, foreign guest ownership and foreign tenant denial with unchanged state.
- Observed advisory and lot-row waits followed by guest/staff session revocation; fresh cancellation and cached replay denied.
- Observed lot-row wait followed by staff role/property-scope revocation; release and all subsequent effects roll back.
- Fresh/cached guest replay after ownership withdrawal during the observed advisory wait.
- Concurrent cancellation/handover: terminal cancellation, released lot holds, no physical issue/folio mutation.
- Private `market_lot_command` remains unavailable to `views_app`; existing foundation proof continues to test runtime direct-write denial.

The proof asserts the disposable database marker. It is not intended for a persistent local or production database. Scope is a backend invariant for Canva IDs SG-MK-001/002/004, SD-MK-001/002 and SS-MK-001/002; no screen gains full visual acceptance from this change.

Executed on this worktree: `node scripts/cloud-core-tests.cjs src/service-orders/market` passed all seven targeted files / 105 tests, the private lot foundation/command/M1 proofs, existing market cancellation authorization (14 races) and hold authorization (14 races). The harness also rebuilt the API successfully. Baseline evidence: `/tmp/views-m1-before.log`; final evidence: `/tmp/views-m1-final.log`. Full aggregate and migration upgrade acceptance belong to the integrated SHA, not this scoped result.
