# M1.1 Booking instant validation

Acceptance: invalid dates and absent offsets rejected; validation precedes DB access; reversed absolute instants rejected; leap day and equivalent offsets accepted; DST crossings preserve local night count; controller returns400.

Run from repository root after frozen dependency installation:
```sh
node apps/api/node_modules/vitest/vitest.mjs run --root apps/api src/rates/local-date.test.ts src/rates/pricing.engine.test.ts src/rates/cancellation.test.ts
node scripts/cloud-core-tests.cjs src/rates src/booking
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
```
The Core runner uses disposable PostgreSQL16 and synthetic seeds; never point fixture setup at persistent views_local. No migration or new dependency required.

Manual checks: submit Feb30 and a timestamp without offset to the existing quote endpoint: expect400; submit a valid timezone-qualified stay: expect normal quote; verify two nights across a DST transition. Existing screens unchanged; no browser acceptance claimed.

Risk: clients sending naive dates now receive400 and must provide timezone-qualified instants. This does not certify payments/SMS, public release, native device operation, or all M1 scenarios. Next: audit hold-expiry/late-payment concurrency coverage and implement the next missing scenario.
