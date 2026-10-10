# Stage 7.29 — server-enforced assurance for password changes

The first protected account operation is authenticated password change. Once a
nonprivileged local member enrolls a passkey, this operation requires unexpired
UV proof in the exact session submitting it, in addition to the current password.
The existing five-minute proof window applies. Enrollment is the policy boundary;
turning off the passkey UI/API flag does not silently restore password-only change.
Users who have never enrolled a key retain the existing password-change flow.

Migration 0044 replaces app.staff_auth_change without changing its signature or
ACL, and leaves migrations 0001–0043 untouched. It locks membership, credentials,
session and key in the same order as factor replacement. Only after all locks are
acquired does it check live session/credential version, active member/user,
nonprivileged role and wall-clock proof expiry. Proof is never accepted from a
request header or body. The check and password mutation share one transaction.
A missing/expired proof yields STAFF_ASSURANCE_REQUIRED (HTTP 403); credentials
and sessions remain unchanged. Success increments the credential version,
revokes all sessions, clears their assurance and invalidates outstanding password
tokens, with the existing password-change audit event. A replay cannot mutate.

This block does not make privileged routes reachable. It does not enable MFA in
production or require a key for booking. Existing recovery-code rotation and
factor replacement already enforce their own transactional assurance rules.
Email-token password reset remains its separate gated recovery path: it revokes
sessions, retains the registered key and does not grant UV proof. Lost-all-factors
recovery is still unavailable. Real email, HTTPS, physical authenticator checks,
security review and owner activation remain release prerequisites.

## Validation

Run the repository build/typechecks, root tests, cloud:test:core, mail acceptance
suite and network primitive gate. With fixed loopback ports free, run
`npm run cloud:test:passkey`. Its new assurance groups exercise direct Core and
restricted-runtime SQL denial, session binding, expiry after an actual row-lock
wait, unchanged credential version on denial, successful change after Chromium
UV proof, all-session revocation, replay and new-login assurance reset. Existing
mail, replacement, recovery and restore tests remain included.

After a private full database backup, `npm run cloud:start` applies migration 0044
using the existing checksum ledger; run cloud:test:auth and cloud:test:browser to
verify ordinary staff login and booking. No Windows or production deployment is
implied by cloud-local results.

## Executed evidence — 7 October 2026 (Asia/Tashkent)

The initial validation used the dirty continuation of `fd0af20`; machine reports
record their actual sourceCommit/sourceDirty fields. Web and Core typecheck/build
passed, as did 220 root tests (36 files), 261 Core tests (53 files), 15 mail unit
tests and the network gate (116 files, no findings). The combined browser/API/SQL
proof passed 41 groups; restore compared 69 tables including seven private tables
and eight recovery-code rows. No external mail or payments were used.

A private full backup preceded persistent migration: the launcher checked the
prior 43 checksums and applied only 0044. Staff HTTP regression passed 13 groups /
32 calls, including password change without a key. Browser login, quote, hold,
reload, release, gateway restart and logout passed at four viewport widths without
page errors. Exact committed-source reruns are recorded in ignored local machine
evidence, not represented as hosted CI. Windows and production were not changed.
