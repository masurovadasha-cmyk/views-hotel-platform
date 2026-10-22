# Booking calendar boundaries — 22 October 2026

Base: PR #84, `69e2e4424f7d6a047540f8f95dde192274c71174`, freshly fetched from
`masurovadasha-cmyk/views-hotel-platform`. PR #54 still points to `b0b9b73`.
No running GitHub Actions or newer remote branch commits were observed before
starting. Existing calendar UI drafts #78–83 were inspected; their older frontend
is not silently transplanted into this branch. This increment repairs the current
booking calculation and verifies the current Core projection, without introducing
a second calendar or modifying another contributor's branch.

## Correctness

The guest quote previously measured local-midnight elapsed milliseconds and
rounded up. On a Berlin device, 25–26 October 2026 produced two nights and a total
of 200 at a nightly rate of 100. It now produces one night and 100 in every tested
timezone. Date-only input is round-trip validated: impossible dates, year zero,
noncanonical strings, empty/reversed/equal ranges cannot enable checkout. Unknown
rates and disconnected payments retain their existing explicit gates.

The PostgreSQL reception regression exercises a property-local half-open day:
checkout exactly at its start and arrival exactly at its end are excluded from
`staying`; stays overlapping either edge are included; confirmed stays are not
reported as checked in; a later empty day returns an explicit empty group. This
protects #84's existing projection correction rather than duplicating it.

## Executed verification (working source before commit)

- Root typecheck, review build: exit 0.
- Root Vitest: 91 files, 996 tests passed.
- `node --test scripts/booking-calendar.acceptance.cjs`: 5 processes passed,
  6 stay ranges each, UTC/Tashkent/Berlin/New York/Lord Howe; added to CI.
- API typecheck and build: exit 0.
- `node scripts/cloud-core-tests.cjs src/booking/reception-workspace.integration.test.ts`:
  disposable PostgreSQL 16, all migrations and runner constraint/isolation proofs,
  5 reception integration tests passed. No live database accessed.
- Core network primitive gate: 187 files, no findings.
- Staff mail acceptance: 15 passed; no external mail sent.
- Baseline reproduced the Berlin one-night => two-night error before the fix.

## Audit exception review

A fresh pnpm 10.18.3 audit gate run passed **with exceptions**, not with fixed
vulnerabilities. Both entries expire at **2026-11-15 00:00 UTC**. GitHub's advisory
records still list no patched version on the review date:

- [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
  node-forge <=1.4.0: RSA signature verification forgery. Observed production
  dependency path: `apps__mobile>expo>@expo/cli>node-forge`.
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  braces <=3.0.3: stack exhaustion on nested patterns. Observed path:
  `apps__mobile>expo>@expo/metro>metro-file-map>micromatch>braces`.

Installed source confirms CLI iOS code-signing utilities import node-forge and
Metro file-map watchers use micromatch. This supports a tooling dependency scope,
not a claim that vulnerable operations are unreachable or harmless. Build/dev
hosts remain exposed to relevant untrusted certificates/patterns. No runtime
Core dependency path was reported for these exceptions. `--prod` is not a full
audit of development tooling. The gate rejects expiration, a published fix,
unknown advisories and paths outside its Expo checks, but the predicates are
prefix/substring matches, not an exhaustive runtime reachability proof. The
in-code rationale has no named risk owner/approval reference. This review neither
extends the deadline nor grants production release approval.

## Delivery limitations

Verified #84 branch preview returned HTTP 200 and `release.json` with the exact
base SHA above, `sourceDirty:false`, `mode:static-demo`, `corePublic:false`.
`/api/health` returned 503 `PUBLIC_CORE_NOT_CONNECTED`, `realPayments:false`.
That preview is base evidence, not evidence of this increment until its new
branch deployment reports the new SHA.

The existing Android WebView review packaging path uses SDK 35 already present.
It is separate from the newer React Native application, whose preflight currently
reports missing platform 36, build-tools 36.0.0 and NDK 27.1.12297006. An unsigned
review package is not installable; existing approved signing configuration and a
pinned certificate are required. No signing identity or persistent credential is
created by this work. Static market list/photo checks do not establish a live
order, stock reservation, authentication or payment. Full shared-calendar UI
integration and live web/mobile backend release remain subsequent work.
