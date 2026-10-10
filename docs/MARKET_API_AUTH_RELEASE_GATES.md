# VIEWS Stage 7 — API authorization release gates

No public V-Market endpoint is enabled by this document. Before wiring any HTTP route, implement and verify:

1. Identity must come from a trusted signed actor guard, not arbitrary headers.
2. Checkout must run inside DatabaseService.withActor using a non-BYPASSRLS role, with authorized property and unit scope.
3. Dispatcher authorization is separate from assignee active-membership/property validation.
4. Checkout, order lines, stock reserve, audit and outbox must commit or roll back atomically.
5. Organization-scoped idempotency: same request replays, changed request returns 409.
6. Payment and refunds are independent of order status.
7. Real PostgreSQL tests: concurrent last-unit orders, cross-tenant access, rollback, replay and terminal retries.
8. Review RLS write policies before opening endpoints; runtime writes remain closed.
9. Browser localStorage remains DEMO until an authenticated API client is verified.
10. Release web and Android only after browser/device tests, security review and rollback readiness.

Status: release gate documentation, not an implemented controller, deployment or APK.
