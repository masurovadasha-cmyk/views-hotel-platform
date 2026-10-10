# VIEWS Stage 7 — server order persistence foundation

Source branch: stage7/market-staff-card-20261009. This change adds a **schema only** to the existing API's migration sequence. It is not a live service, not a public API, and not a deployed database migration.

## Tables
- market_service_orders: tenant, property, optional unit and user, idempotency key, SHA-256 request hash, order status, independent payment status, UZS minor-unit totals and optimistic version.
- market_service_order_lines: immutable-at-checkout SKU/price snapshots.
- market_service_assignments: scoped staff assignment, priority, SLA deadline.
- market_service_events: append-only activity records.

## Isolation
All tables have ENABLE and FORCE RLS. Read policies require matching organization context and an approved staff role. No mutation policies exist. The API must not use a privileged bypass-RLS role for user-facing requests. Existing identity helpers and organization memberships are reused.

## Required before activating
1. Confirm exact role codes and property scopes against deployed identity data. A role alone must never grant access outside its assigned properties.
2. Validate the organization/property/unit and assignee membership relationships in a SECURITY INVOKER transaction boundary; the foreign keys alone do not establish matching tenants.
3. Add server-side idempotent checkout in one transaction with stock row locking, reservation ledger, outbox event and authorization.
4. Add version-checked assignment/status commands, append-only audit, payment/refund separation, and durable error responses.
5. Add integration tests with a real PostgreSQL instance including two concurrent checkouts, cross-tenant attempts, unauthenticated requests, repeat keys and RLS.
6. Verify migration forward/backward in staging before any production rollout. No real payment gateway is connected.

The Canva 60-page VIEWS pack is a visual/product reference, not executable code. The local browser demo and task history remain separate until an API migration plan is verified.
