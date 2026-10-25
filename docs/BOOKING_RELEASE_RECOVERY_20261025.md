# B2: durable hold-release recovery

Base: integrated H1/Q1/M2 `e058f84c7d1114553778a75d46a8fe8d8ce6144d`.
This is a separate next-wave slice; it does not alter the preceding 0.21 release.

An initial release keeps `{reservationId}` and its idempotency key. A saved retry
adds `recoveryOnly:true`. Core serializes the release command by organization/key,
returns a current reservation receipt, or commits a not-applied command snapshot.
A later original request cannot execute a fenced command. Existing successful
release snapshots remain compatible. Nothing confirms a stay or cancels a
non-hold reservation. A receipt never promises room availability: another quote
must check inventory.

The browser's existing `views.booking-recovery.v1` IndexedDB version 1 and
`attempts` object store remain unchanged. Existing create-hold record keys and
bytes are preserved. Release records use the `release:` prefix plus the same
authorized four-ID scope, storing only version/scope/reservationId/key. Creation
and release claims check each other atomically in one read/write transaction.
Corrupt data fails closed; another scope's attempts are never removed. No token,
CSRF value, guest details or card information is persisted. Recovery is explicit
and survives browser navigation/reload on the same origin/device.

Core requires current reservation.manage/property access, and local-workspace
HTTP calls also require the current staff session. The existing migration 0133
predicate supplies session/credential/role/clock checks; no new migration or
privilege is needed. Authorization is checked after command waits and after the
current-receipt reservation lock, before commit. Terminal clearance requires a
validated matching receipt; HTTP 404/409/auth/network errors alone do not clear.

Gateway integration is a narrow release-only branch before the generic cached
reservation gate: validate reservation ID/recovery flag; forward the authoritative
fixture property and force recovery-only on a cache miss. Other stay mutations
must retain their existing cache restriction. The coordinator owns that patch.

## Verification

Focused create/release/locale tests and TypeScript/build results are recorded in
the worker report. Added six Core integration scenarios cover release replay,
absence fencing, current confirmed/expired states, races, wrong target/property,
and non-hold safety. `apps/api/db/tests/booking-release-recovery.cjs` takes only
the coordinator's disposable admin/runtime connections, verifies the database
marker and non-superuser runtime, then checks real front-desk/manager access,
isolation and eighteen observed command/reservation/inventory-wait revocations. Test source presence is not a
claim of database execution; integration/CI/browser results follow actual runs.
