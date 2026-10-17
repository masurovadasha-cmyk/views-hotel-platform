# Stage 7.32 — explicit synthetic check-in and checkout

The local reception screen can now check in a confirmed synthetic reservation and
check out an occupied one. This is a bounded operational rehearsal, not activation
of real guest processing. All existing production gates remain closed.

## Boundary

The Core requires NODE_ENV=test, local rehearsal, staff-auth pilot, the separate
VIEWS_STAFF_STAY_PILOT_ENABLED flag and the configured organization. The cloud-local
launcher opts in; other launchers default off. Only a trusted local-workspace
caller with a live front-desk session, reservation.manage and property scope can
mutate. The gateway accepts only reservationId, with CSRF and a UUID idempotency
key; the Core accepts an empty body and fixed check-in/check-out actions.

Eligible reservations must have a server-prepared localStayPilot=true snapshot,
zero total, an assigned active unit, a primary synthetic guest, no payment intent
and a matching full reservation inventory interval. Normal quotes/holds cannot
set this marker. Priced reservations and financial processing are excluded.
Primary guest presence here is NOT document verification or government registration.

Check-in is allowed only inside the scheduled interval, from confirmed, and only
when the unit has no checked-in stay. Checkout starts only from checked_in. It
shortens the inventory period to the actual exit time (bounded by scheduled end),
preserving past occupancy and freeing the remaining interval. It does not certify
cleaning, settle a folio, issue a receipt, refund, or transmit external registration.

Migrations 0045 and 0046 add a private-data authorization function with fixed search_path
and no PUBLIC execution. The scope lock uses a narrow definer routine;
read-only scope RLS policies and role grants remain unchanged. It locks membership → credentials → session and checks
wall-clock expiry, revocation, identity and permission. Those locks remain in the
same transaction as the stay write. The service locks property scope, reservation
and unit, rechecks session validity after waits, and serializes duplicate command
keys. State/version, idempotency result, booking event, outbox and audit commit or
roll back together. Replays return the original result without a second mutation.
The UI always refreshes server state; an uncertain reply does not cause automatic
mutation retry. An explicit confirmation precedes each action.

## Local use

```sh
npm run cloud:start
npm run cloud:prepare:stay
```

The preparation command adds one dedicated synthetic unit, a zero-charge confirmed
stay and a named synthetic primary guest to the existing marked local fixture.
It does not alter any existing reservation, password, role, or real guest. Each
invocation adds a separate fixture; it is not an automatic seed/reset or schedule.
The reception arrivals group shows the new stay, with “Заселить (тест)”. After
confirmation it appears under current stays with “Оформить выезд (тест)”.

```sh
npm run cloud:test:core
npm run cloud:test:auth
npm run cloud:test:stay
npm run cloud:test:browser
```

The stay browser proof creates its own separate synthetic stay, tests CSRF/scope/
body rejection, cancellation, duplicate check-in rejection, both transitions and
reload persistence at four widths. Existing reservations remain intact. Reports
are private under the local evidence directory. No credentials go in source or
published evidence.

## Remaining operational work

Before real use: agreed confirmation/payment/folio policy, guest entry and verified
documents, registration workflow, housekeeping readiness, early/late stay policies,
real HTTPS/email and explicit release review. A zero-charge synthetic cycle does
not prove those integrations. General staff confirmation/payment routes remain
unavailable through this local gateway.

## Executed verification — 7 October 2026 (Asia/Tashkent)

Initial checks ran on the dirty continuation of b88b523; machine evidence records
its exact parent/dirty status. Web/Core build and typecheck, 220 root tests, 271
Core tests (55 files), 15 mail unit tests and the 118-file network gate passed.
Core tests cover default-off/production refusal, live session/property/permission
checks, normal and priced reservation refusal, guest/window checks, concurrent
idempotent replay, state replay rejection, inventory preservation/release, audit,
outbox rollback, key binding and revoked sessions.

The dedicated stay browser proof passed five groups: CSRF/workspace/body allowlist,
explicit cancellation, check-in/reload, four widths, checkout/reload. Ordinary staff
HTTP proof passed 13 groups / 32 calls; the reception and booking browser journey
also passed without page errors. Existing mail/passkey/recovery proof passed 47
groups and restored 69 tables, including seven private tables and eight recovery
codes. Final committed-source reports supersede earlier dirty-source reports.

Private full database backups preceded the authorization migration and the scope
lock correction. Earlier migration checksums were retained. Migration 0045 was
already applied locally when the RLS scope-lock issue was found; correction 0046
was added without rewriting 0045. The launcher now applies 46 migrations. No
Windows installation, real customer record, live payment or external email was
changed; synthetic test stays remain as local rehearsal history.
