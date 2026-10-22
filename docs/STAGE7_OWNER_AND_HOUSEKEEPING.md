# Stage 7.47–7.48: owner inventory drafts and housekeeping workspace

The owner form can prepare an Uzbekistan property, one room category, 1–100
unique unit codes, a UZS nightly price and an explicit cancellation cutoff.
Core writes the property, category, units, inactive rate and policy, audit and
outbox in one transaction. Money is a decimal minor-unit string throughout.
The resulting fund is a **draft**: units are not active and neither rate nor
policy can be used for a quote. This is not a sales activation workflow.

Only an existing active owner/manager with `property.manage` can use the draft
service. Migration 0048 locks membership/user/role/permission authority for the
transaction; it creates no users, credentials or sessions. Scoped hosts and
front desk are denied. An actor-bound idempotency key serializes concurrent
requests; changed content with the same key conflicts. Browser uncertainty
keeps the form locked and retries the identical body/key. A reload loses that
in-memory attempt, so inspect the property list before creating another draft.

The separate housekeeper screen lists unit codes, task age and assignment,
without guest names, documents, contact details or financial data. An existing
scoped housekeeper can claim, release or complete its own synthetic turnover.
Claim contention has one winner; a colleague cannot complete/release it. A
completed task leaves the pending queue. Completion requires explicit keyboard
accessible confirmation. Reception retains its existing readiness workflow.

Migration 0049 adds a nullable assignment to `local_stay_turnovers` and a narrow
session authorization function. It locks membership, credential, session, user,
permission and property scope; expiry is rechecked after task/unit lock waits.
Mutations require a zero-charge synthetic checked-out reservation and a vacant
unit. Assignment/completion, audit and outbox are atomic and replay-safe.
These are synthetic readiness tasks, not proof of physical cleaning.

## Activation boundaries

Both routes are default-off:

- `VIEWS_OWNER_INVENTORY_DRAFT_ENABLED=true` additionally requires `NODE_ENV=test`
  and `VIEWS_LOCAL_REHEARSAL=true`. Privileged owner/manager login remains closed
  by the existing identity pilot. No password/account has been promoted.
- `VIEWS_HOUSEKEEPING_PILOT_ENABLED=true` additionally requires test rehearsal and
  the matching `VIEWS_STAFF_AUTH_ORGANIZATION_ID`. Session, existing
  `housekeeping.work`, role and property scope are checked again by PostgreSQL.

The normal persistent launcher enables neither flag. Its migration ledger now
contains 49 migrations, preserving all 47 earlier checksums. The only new
housekeeper identities/sessions are **disposable CI fixtures** in
`production-core.yml`; they are not seeded into `views_local`.

The shared frontend selects owner/reception/housekeeper sections using the
resolved permissions. Each backend route remains authoritative. Forms, errors,
queue labels and confirmations support RU/UZ/EN, retaining the staff preference.
The public Pages preview and existing published APK are unchanged.

## Executed checks

Base SHA `664df32298118f931bc99892ef4306da469c4c17`, dirty increment, 7 October
2026. Successful commands exited 0; earlier fixture failures were fixed by
supplying the required cancellation snapshot and byte-buffer HTTP test body,
without relaxing production checks.

- Root typecheck/build and Core typecheck/build.
- `npm test`: 238 tests in 39 files, including gateway default-off, permission,
  property binding, forged actor/body and CSRF refusal.
- `npm run cloud:test:core`: 298 tests in 59 files on a disposable PostgreSQL 16
  database with a non-superuser/non-BYPASSRLS runtime. Includes owner atomic
  create/replay/concurrency/rollback/quote refusal and housekeeping claim races,
  self-assignment, occupied-unit refusal, revoked-session denial and rollback.
- Core network gate: 126 files, no findings. Mail acceptance: 15 passed.
- Owner and housekeeper browser proofs: 3 languages × 4 widths, no page errors
  or external requests; exact-price conversion, unchanged-key retries, role
  separation, list reload, filters, partial-list warning and dialog keyboard
  behavior. **HTTP responses are synthetic fixtures**, not privileged account
  activation or a browser-to-Core owner/housekeeper login proof.
- Persistent restart: 2 new migrations; original checksums retained. Staff auth
  13 groups / 32 HTTP calls; stay 16 groups; booking/auth browser and staff locale
  8 groups passed with the new build. Existing front-desk behavior remains usable.
- Local restore: 71 tables, 7 private tables, 24 encrypted documents and 16
  turnovers; all digests matched, separate document key required.

`npm run test:workspaces` repeats the two offline UI proofs after `npm run build`.
It is included in `cloud:verify`; the entire aggregate command was not rerun as
one operation in this increment.

## Still open

Verified business data, multi-category editing and opening real inventory for
sale; approved owner identity/MFA and a connected privileged login proof; actual
housekeeper onboarding/assignment policy and a connected housekeeper browser
proof. No production activation, real money, email or deployment is implied.
Legacy staff/demo localization, real guest/provider flows and previously recorded
hosting/Android acceptance requirements remain separate work.
