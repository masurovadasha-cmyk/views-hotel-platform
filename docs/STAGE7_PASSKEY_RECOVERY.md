# Stage 7.28 — passkey replacement and recovery codes

This extends the opt-in local nonprivileged WebAuthn pilot. Privileged login,
production MFA, external mail and public ingress remain disabled. It uses the
same fixed localhost RP/origin and the existing password/session/CSRF boundary.

## Enrollment and replacement contract

Eight random 128-bit recovery codes may be issued only after current-password
reauthentication and a fresh UV passkey proof in the same session. Issuance
consumes that proof. The response shows codes once; only tenant/member-bound
SHA-256 digests are stored in staff_private. Codes expire after 180 days. A new
batch invalidates the previous batch atomically. Codes are redacted from
structured telemetry and are never placed in URLs or browser storage. The UI
clears the displayed batch on acknowledgement, page exit/reload or after five
minutes. If the response is lost, use the live key to issue a new batch; the
previous codes may already have been invalidated.

Replacement requires password reauthentication plus either fresh UV proof or
one unused recovery code. The code is consumed atomically when the replacement
ceremony starts, not after enrollment. A cancelled/failed/expired ceremony burns
that code, while leaving the old server-side key intact. Recovery never sets
session assurance or grants a privileged role.

The new two-minute one-use challenge binds the session and exact current key.
The old key is excluded from WebAuthn registration: replacement uses a different
authenticator. The server verifies the new UV credential before atomically
removing the old key, registering the new one, invalidating all remaining codes
and challenges, revoking every session, and writing the audit event. The user
then logs in again and generates fresh backup codes after proving the new key.
An insert failure rolls back key deletion and session revocation. An uncertain
HTTP response does not imply the operation failed; the UI asks the user to log
in and check the registered key.

Migration 0043 supersedes the MFA function without rewriting applied migration
0042. Existing unfinished ceremonies are invalidated because they predate
explicit current-key binding. No existing key or staff password is replaced by
the migration. The routine follows the existing membership → credentials →
session → passkey locking order. Concurrent recovery-code uses have one winner.
Rate limits remain eight password reauthentications per membership per five
minutes and twelve ceremonies per session per five minutes. Codes alone, email
reset alone and password alone cannot replace a key.

## Reproduce

```sh
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
npm run cloud:test:core
node --test scripts/staff-mail.acceptance.cjs
node scripts/core-network-primitive-gate.mjs
npm run cloud:stop
npm run cloud:test:passkey
npm run cloud:start
npm run cloud:test:auth
npm run cloud:test:browser
```

The combined proof uses its own disposable PostgreSQL, loopback SMTP and Chromium
virtual authenticators. Raw codes stay in test memory; reports, screenshots and
Git artifacts must not contain them. The backup proof includes nonempty recovery
code rows and compares private-schema content digests after restoration.

## Remaining release work

Lost-all-factors recovery is deliberately unavailable. It requires a separately
reviewed identity-verification process, independent authorization, notifications,
cooldown rules, audit and escalation; no operator password-only bypass is added.
Physical authenticator and phone validation, real verified email, HTTPS/RP
configuration, security review and owner approval remain prerequisites for
privileged MFA activation. The next implementation block is server-enforced
assurance for sensitive operations and the corresponding privileged-flow tests,
kept behind existing activation gates.

## Verification — 7 October 2026 (Asia/Tashkent)

Initial execution used the dirty continuation of `0bfd8d3`. Machine reports in
ignored `mail-evidence/integration.json` and private local evidence record the
actual HEAD/dirty status, not an inferred remote CI result. Successful commands:

- Web/Core build and typecheck; network primitive gate: 116 files, no findings.
- Root unit suite: 220 tests / 36 files; Core suite: 261 tests / 53 files.
- Mail policy unit suite: 15 tests.
- Combined mail/passkey/recovery proof: 38 groups, including nine recovery groups,
  38 direct Core calls plus browser requests, 13 loopback-captured messages.
- Code display/reload/storage checks and four viewport widths; password-only
  denial; concurrent code replay; recovery with a new virtual authenticator;
  all-session revocation; rotation, expiry and membership binding; replacement
  through the current key; unique-constraint failure after DELETE with rollback;
  late completion; private table grants and safe audit.
- Restore compares 69 tables, including seven private auth tables and eight
  nonempty recovery-code rows. Restored row counts and content digests match.
- Existing staff HTTP proof: 13 groups / 32 calls; browser login → quote → hold →
  reload → release → gateway restart → logout, four widths, no page errors.

A private mode-0600 full database dump was saved before applying migration 0043
to cloud development. The prior 42 checksummed migrations were unchanged; the
launcher now reports 43 and real readiness. No Windows installation was changed.
Local browser proof uses virtual hardware; hosted CI/physical authenticators,
production MFA and external email are not claimed.
