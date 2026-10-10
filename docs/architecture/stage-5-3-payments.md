# Stage 5.3 — payment foundation (not a live gateway)

## Implemented
- PostgreSQL RLS tables for payment attempts, deduplicated provider events and refunds.
- Order-scoped internal payment intents with merchant reference uniqueness.
- Amount derived from the immutable server-calculated `service_orders.total_uzs` snapshot.
- Single active payment attempt per order enforced by a row lock in the transaction.
- Domain transition and refund-bound validation helpers.
- Transactional outbox event for new internal intents.
- CI migration and isolated PostgreSQL integration test.

## Explicitly not implemented
- No provider API credentials, charge initiation, payment webhooks, card storage, payment success updates, refund execution, or payout.
- Do not mark an order as paid from a client request. Only a verified, reconciled provider event may change settlement state.
- `service_payment_events` is a schema for future verified provider notifications; uniqueness is not a substitute for signature verification.
- A saved card token may not be portable between merchants/providers. Require separate provider consent and legal review.
- Financial ledger accounting, partial capture, refunds, chargebacks and reconciliation are separate future steps.

## Next release gates
1. Sandbox adapter contracts for Payme, Click and Uzum using official current documentation.
2. Signed webhook verification and replay-safe processing.
3. Double-entry financial ledger and settlement reconciliation.
4. Concurrent payment intent test and partial refund invariant tests.
5. Identity/authorization for payment initiation and tenant-scoped ownership.
6. Provider sandbox end-to-end tests before any real-money feature is enabled.
