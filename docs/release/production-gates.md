# VIEWS production release gates
This branch is a developer prototype and MUST NOT be deployed for real guest data or payment processing.

## Blocking gaps
- HTTP demo still stores orders in process memory; PostgreSQL adapter not wired to routes.
- Demo CRM routes have no authentication or role enforcement.
- Financial prices are not yet sourced from a tenant-scoped catalog and not persisted as immutable snapshots.
- Inventory reservation release/consumption, refunds, cancellations and settlement are incomplete.
- Guest-to-order ownership and employee permissions are not enforced in the HTTP layer.
- No payment provider integration, webhook verification, secret rotation or reconciliation.
- No deployment smoke tests, Android build, operational backups or monitoring.

## Required verification
- CI Node tests and PostgreSQL migration job green.
- PostgreSQL integration tests with two concurrent requests and tenant RLS checks.
- API authorization and ownership tests; disallow cross-tenant reads/writes.
- End-to-end guest order → reserve → dispatch → consume → ledger, including rollback.
- Payment sandbox tests, webhook idempotency, refund tests.
- Responsive and accessible Canva-derived UI, including UZ/RU/EN.
- Review by finance/security before production release.
