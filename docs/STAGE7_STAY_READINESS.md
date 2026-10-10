# Stage 7.33 — synthetic stay readiness

The reception card now shows the primary synthetic guest and explains why a
check-in or checkout cannot proceed. The PostgreSQL projection checks unit
activity, the full inventory reservation, absence of payment intents, operation
time and current occupancy. Missing readiness data also disables the action.

The projection is advisory: a concurrent change can invalidate it. The existing
transactional stay service remains authoritative and rechecks authorization and
all prerequisites when the employee confirms. The pilot marker must be a JSON
boolean, matching the write service; a string containing “true” does not qualify.
Guest names are returned only for opted-in, marked, zero-charge pilot stays,
within the existing organization/property authorization. No documents, dates of
birth or tokens are added to the response.

## Verification

Executed 7 October 2026 on the dirty continuation of
`1e5da3f7aeecf505294afdf68476f983784c73d3`:

- Web and Core build/typecheck: passed.
- Root tests: 220 passed, 36 files.
- Disposable PostgreSQL Core suite: 272 passed, 55 files.
- Mail policy: 15 passed; network gate: 118 files, no findings.
- Staff authentication HTTP proof: 13 groups, 32 calls, passed.
- Stay browser proof: six groups passed, including primary guest display, a
  disabled missing-guest action and HTTP 409/STAY_GUEST_REQUIRED when bypassing
  that UI. Confirmation cancellation, reload persistence, check-in/checkout and
  four viewport widths also passed.
- Booking browser regression: passed at 360/390/768/1440 pixels, including
  gateway restart and logout persistence.

The negative browser fixture uses the explicit `--without-guest` option of the
synthetic preparation helper. Both fixtures get separate new units/reservations;
existing reservations and accounts are not rewritten. No migrations were added;
the persistent cloud rehearsal retains 46.

## Remaining scope

This is a local synthetic workflow. Real guest entry/editing, document checks,
mandatory registration, paid-stay prerequisites and housekeeping after checkout
remain separate operational work. External email, real payments and production
remain disabled. These checks do not establish hosted CI or Windows rollout.
