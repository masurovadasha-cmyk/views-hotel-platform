# V-Market transactional command contract — Stage 7

This contract is a design and implementation gate, not a live API.

## Checkout POST /v1/market/orders
Authenticated actor with verified organization, property access and guest/staff scope. Require Idempotency-Key, propertyId, unitId, delivery slot, payment intent reference and a nonempty list of {sku,quantity}. Client prices are ignored. Request hash includes all semantic fields and canonicalized sorted lines. Server transaction: insert command idempotency record or replay with matching hash; lock SKU balances in deterministic SKU order using SELECT ... FOR UPDATE; read authoritative price snapshots; validate available=on_hand-reserved; insert order, lines, reserve movements and outbox event; increment reserved and balance version; commit. Insufficient stock rolls back everything. Do not mark payment paid without a verified gateway event.

## Status POST /v1/market/orders/:id/status
Actor must have permission for this property and requested transition. Require expected order version and Idempotency-Key. Lock order then stock rows in deterministic order. Transitions new->picking->packed->out_for_delivery->delivered; cancellation only before delivered. On delivered, decrement on_hand and reserved once, append SALE movements; on cancelled, decrement reserved once, append RELEASE movements. Append immutable event and outbox record in same transaction. Payment/refund is a separate state machine.

## Assignment POST /v1/market/orders/:id/assignment
Manager or dispatcher scope; verify assignee is an active membership of same organization and property scope. Require expected order version and idempotency. Lock order, upsert assignment and append audit event. SLA is stored as an absolute timestamptz, not a browser-only countdown.

## Mandatory integration tests
- Two simultaneous checkouts for the last SKU: exactly one succeeds.
- Same key/same payload returns same order; same key/different payload returns 409.
- Cross-tenant/property/role attempts are denied.
- Cancellation releases exactly once; delivery sells exactly once.
- Failed payment does not imply success or real refund.
- Restart/retry and transaction rollback preserve inventory invariants.
- API runtime uses non-bypass-RLS role; no client-supplied actor identity is trusted.

No production deployment, real payment, server endpoint, APK or merge is authorized by this document.
