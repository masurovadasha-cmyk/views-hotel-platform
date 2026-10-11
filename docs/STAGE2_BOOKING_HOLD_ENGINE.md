# Stage 2 — Booking Hold Engine

Status: implemented in production core.

## Assumptions
- PostgreSQL is the source of truth for availability.
- Payment provider confirmation is not part of Stage 2.
- Hold TTL defaults to 15 minutes and is bounded to 60–3600 seconds.
- Redis/BullMQ will deliver delayed expiry jobs, but correctness never depends on the queue.
- Recovery always scans PostgreSQL for expired holds.

## Schema
Production migrations:
- 0005_booking_hold_engine.sql
- 0006_inventory_rls.sql

Key records:
- reservations(status=hold)
- reservation_price_lines
- booking_commands
- booking_state_events
- inventory_periods(kind=payment_hold)
- outbox_events

## State flow
availability -> hold -> confirmed

or

availability -> hold -> released/expired -> cancelled

A confirmed hold changes inventory_periods.kind from payment_hold to reservation.
A released/expired hold deletes the blocking inventory period.

## Idempotency
Every create/confirm/release command requires an idempotency key.
Reusing the same key with the same request replays the result.
Reusing the same key with a different request fails with an idempotency conflict.

## Concurrency guarantee
PostgreSQL GiST EXCLUDE(unit_id WITH =, stay_period WITH &&) is the final arbiter.
There is intentionally no application-level check-then-insert race.

## Expiration
BookingLifecycleService.expireTenantBatch() is the recovery mechanism.
Use one tenant-scoped worker job at a time with FOR UPDATE SKIP LOCKED.
The HoldExpiryQueuePort is the queue boundary for the future BullMQ adapter.

## Local run
1. docker compose -f docker-compose.production-dev.yml up -d
2. Apply infra/postgres/init/001_extensions.sql.
3. Apply apps/api/db/migrations/0001 through 0006 in order.
4. Create a restricted views_app runtime role as documented in ADR 0002.
5. cd apps/api
6. npm install
7. DATABASE_URL=postgresql://views_app:<password>@localhost:5432/views npm test
8. npm run typecheck
9. npm run build

## Automated tests
The VIEWS Production Core GitHub workflow proves:
- PostgreSQL 16 migrations apply
- adjacent half-open periods are allowed
- overlapping periods are rejected by DB
- tenant/property RLS works under NOBYPASSRLS role
- two concurrent holds produce exactly one winner
- same idempotency request replays
- reused key with changed request is rejected
- confirm converts hold -> reservation
- repeated confirm replays
- manual release frees inventory
- expired hold is cancelled and inventory released

## Risks / manual checks
- CHECK MANUALLY: payment provider late-success behavior after hold expiry.
- CHECK MANUALLY: final hold TTL by payment method.
- CHECK MANUALLY: guest/public auth adapter must derive organization/property context server-side; do not trust tenant headers from browsers.
- CHECK MANUALLY: timezone used for cancellation policy is property timezone, not API server timezone.
- CHECK MANUALLY: queue outage recovery scan frequency and alerting.
