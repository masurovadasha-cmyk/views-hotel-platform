# Stage 7.19 — Durable provider audit and reconciliation

## Goal

Make every future external-provider call recoverable after timeout, process crash,
or an uncertain network outcome without logging credentials, request bodies, query
values, or raw provider responses.

No real provider is enabled by this stage.

## Durable model

provider_egress_attempts stores only:
- organization ID;
- provider and reviewed operation IDs;
- request UUID;
- attempt number;
- deadline;
- delivery classification;
- outcome/status/error code;
- timestamps and duration.

provider_egress_reconciliation_queue stores only the attempt reference, reason,
lease/retry state, safe error/resolution code and timestamps.

Neither table stores URL query values, JSON bodies, authorization values,
credentials, cookies, passport data or provider response payloads.

## Audit integrity

Runtime roles receive SELECT visibility through tenant RLS only.

There are deliberately no INSERT/UPDATE/DELETE RLS policies. Audit mutation is
performed through SECURITY DEFINER functions that read the current organization
context. This means broad table grants cannot be used by the application runtime
to forge or erase audit history.

A repeated begin with the same organization/provider/operation/request UUID is
rejected as PROVIDER_EGRESS_REQUEST_REPLAY before dispatch.

## Uncertain delivery

The Stage 7.18 client writes a durable started event before network dispatch.

If a transport failure is recorded with delivery=unknown, the database
immediately creates reconciliation work.

If a deadline/crash leaves only the started row, a sweeper converts it to
EGRESS_OUTCOME_UNKNOWN after the recorded provider deadline plus a fixed
30-second grace period and queues reconciliation.

This is intentionally conservative: an unknown outcome must be reconciled with
the provider before any resend.

## Existing outbox integration

Stage 7.19 reuses the existing outbox_events table.

New safe events:
- provider.egress.reconciliation_required
- provider.egress.reconciliation_resolved
- provider.egress.reconciliation_dead_letter

Payloads contain only attempt/provider/operation/request identifiers, reason and
safe resolution/error codes.

## Leasing

Claiming reconciliation uses FOR UPDATE SKIP LOCKED and a two-minute lease.

Expired leases may be reclaimed. Failed reconciliation is rescheduled with a
bounded delay. After ten claimed attempts it moves to dead_letter and emits an
outbox event.

Stage 7.19 does not implement provider-specific status lookup. That belongs to
the first sandbox provider adapter.

## Proof

The dedicated CI proof applies every migration to disposable PostgreSQL and
verifies:
- request replay is rejected;
- unknown delivery queues reconciliation;
- stale started rows are recovered;
- runtime direct writes are blocked by RLS;
- a second organization cannot read the first tenant's rows;
- reconciliation leasing, resolve and retry transitions work;
- existing outbox integration emits the expected events;
- outbox payload contains none of the forbidden sensitive fields.

## Next stage

Stage 7.20 should connect the first sandbox provider only after:
- its status/reconciliation API is verified;
- webhook signature verification and replay handling are implemented;
- payment ledger mapping and refund semantics are tested;
- provider credentials are stored in an approved secret store.

Production provider activation remains false.
