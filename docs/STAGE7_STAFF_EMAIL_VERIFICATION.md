# Stage 7.26 cloud verification

## Source and reproduction

Continuation of handoff `ed81a8cfe37689a3cace2c3eafd71b21041205c4`, merged with
cloud launcher `93a8ba368d892b8bd090b4c2d52ae5ad0b15a55e`. Initial checks below
ran against that explicitly dirty working tree. Machine reports record actual
HEAD and dirty status on each run; do not substitute historical SHA evidence.
Run from the repository root with Node >=22, Docker and installed Chromium:

```sh
npm ci
npm --prefix apps/api ci
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
npm run cloud:test:core
npm run cloud:stop
npm run cloud:test:mail
npm run cloud:start
npm run cloud:test:auth
npm run cloud:test:browser
```

## Executed results (2026-10-06 UTC)

- Root typecheck/build: exit 0; 220 tests across 36 files: pass.
- Core typecheck/build: exit 0; 254 tests across 52 files: pass, in disposable
  PostgreSQL with tenant isolation and inventory overlap assertions.
- Network primitive boundary: exit 0, 115 files, no findings.
- Mail policy/token tests: exit 0, 15 tests pass.
- Mail integration: exit 0, 19 scenario groups; 17 direct Core HTTP calls,
  8 actual messages captured exclusively by loopback SMTP, plus browser requests.
- Chromium mail groups: no activation on GET; explicit activation/login/reset;
  same-tab link switching; encoded-fragment removal; consumed/expired rejection;
  reload; no bearer tokens in DOM/storage/request URLs or headers; widths
  360/390/768/1440 without horizontal overflow.
- Backup/restore: 66 tables including all 4 staff_private tables compared by
  row counts and deterministic content digests. Restored queue generates identical
  tokens with separately retained in-memory keyring; missing key fails closed.
  This proves synthetic database restoration, not external key-vault recovery.
- Staff HTTP regression: 13 groups / 32 requests pass after migration 0041.
  Existing staff passwords were not replaced; separate synthetic users are used.
- Chromium booking regression: exit 0; login → quote → hold → reload → release,
  gateway restart preserves session, logout persists, all four viewport widths,
  no page errors or service credential exposure.

## Confirmed corrections

Original saved mail proof passed 13 groups; its historical setup failure was not
reproduced. New regression tests exposed invitation resurrection after a member
was suspended and restored, and encoded fragment keys remaining in the URL.
Migration 0041 permanently revokes outstanding links on offboarding/role changes,
validates recipient/current credentials before dispatch, and rechecks lease time
AFTER waiting for the completion row lock. A controlled concurrent row-lock test
proves expired workers cannot commit acceptance.

Mail UI now receives later hash changes in the same document, clears password
fields between links and ignores stale request completion for a replaced link.
Migration 0040 SHA-256 remains:
`29a0224a4a0b44a6a026568807ae207b29ccdaa61575b5afae21d1a477845f7d`.

A private mode-0600 database dump was saved outside Git before applying 0040/0041
to the cloud development database. Its previous 39 migrations were retained;
the launcher reports 41 applied migrations. The Windows database was not changed.

## Limits and next work

No real email, external mailbox proof, public deployment, main merge, payment,
new paid resource, scheduled worker or privileged login was enabled. GitHub API
access for PR comments returned Forbidden; Git transport remains available.
CI definitions were updated, but local runs are not evidence that hosted CI ran.
Some existing pg tests report a client query concurrency deprecation warning.

Next MFA increment (design, not activation):
1. Define privileged role matrix and server-enforced step-up/session assurance.
2. Implement WebAuthn/passkey enrollment with a maintained server library,
   origin/RP binding, short-lived single-use challenges and audited enrollment.
3. Design recovery codes as one-time digests and audited operator-assisted
   recovery; prevent email-only recovery from bypassing privileged MFA.
4. Add transaction/concurrency, cross-tenant, replay, recovery and browser tests.
5. Keep privileged access disabled until approved HTTPS, real email ownership,
   recovery procedure and rollout gates are independently verified.
