# Stage 7.31 — Windows runtime repair and verified local rollout gates

## Current scope

This fixes the three defects found after the first Stage 7.31 unit/syntax pass.
The prior pass did NOT prove that Windows child processes or the observation SQL
worked. Current completion claims must refer to the new native Windows and
PostgreSQL runtime workflow, not the earlier seven mock/syntax tests.

No user-computer deployment is implied by the CI result. A platform safety layer
blocked the previous local preparation operation. Do not bypass that denial with
a differently encoded script, different tool or broader sandbox permission.
These repository changes and disposable CI tests are separate work. User-host
execution must use a legitimately permitted session, not an evasion of that block.

## Fixed defects

1. Observation uses the real public.audit_log.created_at column. The shared
   read-only snapshot query joins each audit event to the SAME live session and
   verifies tenant/member, role, credential version, absolute/idle expiry and
   fresh passkey assurance. It cannot borrow assurance from another session.
2. Builds invoke the selected Node executable with its bundled
   node_modules/npm/bin/npm-cli.js. No direct npm.cmd spawn and no arbitrary shell
   interpolation. The npm CLI and both typechecks are checked BEFORE downtime.
3. The rollout explicitly opts in through windows-local-passkey-start.cjs. This
   wrapper sets the local pilot flag for the Core subprocess only, retains the
   existing local/test boundaries, and records its source and selected mode.
   An actual protected-handler probe must return STAFF_SESSION_REQUIRED (401)
   when no user token is supplied; a healthy readiness response is not enough.
   Disabled mode (404), wrong gateway auth and an unprotected 200 all fail proof.

The default VIEWS Local Start is unchanged. After an ordinary stop/restart the
pilot may be off. A separately approved local restart can use:

```text
node apps/api/ops/windows-local-passkey-start.cjs --ack=LOCAL_PASSKEY_PILOT
```

This is not production enablement, a new service or an always-on scheduler.

## Rollout

In a clean existing Windows checkout of stage7/windows-passkey-rollout-v1:

```text
node apps/api/ops/windows-local-rollout.cjs apply --ack=LOCAL_STAGE731_ROLLOUT --expected=<exact-current-sha>
```

The verified 0903a01 source must be an ancestor; all applied migration byte hashes
must match. Existing migration 0040 is required. No reset, clean, force push,
package install, firewall change, new Windows service or public tunnel is done.
Only the owned Core and web processes are stopped. PostgreSQL stays running.
The existing helper applies only forward migrations; applied SQL is unchanged.

Backup and row-manifest use one exported PostgreSQL snapshot. A full custom dump
is restored into a uniquely named TEMPORARY database, and public/staff_private
row counts and row-content digests must match. The dump is retained privately;
only the temporary restored database is deleted. Both schemas are required, and
empty/malformed evidence cannot pass. MD5 row multisets are consistency checks,
not a signature against an adversarial backup source. Dump SHA-256 is retained.
Global roles, external secret keys and restore privilege equivalence are NOT
claimed verified by this row-content test.

After building and restarting, the runtime/session-required probe and migration
ledger are rechecked. Reports contain the actual completed phase, so a build
failure cannot imply successful activation. A failure does not auto-restore the
persistent DB or claim the old application has been restarted.

## Physical passkey observation

After a permitted, successful local rollout:

```text
node apps/api/ops/windows-physical-passkey-proof.cjs begin --ack=LOCAL_PHYSICAL_PASSKEY_PROOF --expected=<same-sha>
```

The command checks the running process's source/mode record and protected handler,
records a 30-minute observation window and existing key fingerprints, then opens
http://localhost:4173/?api=local-core. localhost is the fixed WebAuthn RP origin.
It does NOT log in, set a password, read browser profiles or create a credential.

The user signs in and chooses Register key or Confirm with key in the existing
panel, then completes the native Windows Hello/security-key prompt. PIN/password
and recovery codes must never be sent to chat. Finish only after an actual user
confirmation:

```text
node apps/api/ops/windows-physical-passkey-proof.cjs finish --ack=LOCAL_PHYSICAL_PASSKEY_PROOF --expected=<same-sha> --authenticator=windows-hello --user-verified=yes
```

Use security-key/platform-passkey/other-local only for the actually observed UI.
Registration requires a new key plus a registration event; authentication requires
an unchanged key fingerprint plus a verification event. Expired/revoked/mismatched
sessions and out-of-window records are rejected. Missing evidence leaves the
observation pending instead of falsely marking success. Hardware make/model is
operator-observed, NOT cryptographically attested by the current schema.

## Runtime CI and limitations

stage7-windows-rollout.yml runs on standard Windows Server 2025 and Ubuntu 24.04
hosted runners. Windows actually invokes bundled npm (including a directory with
spaces) and builds the real web/Core. A new disposable local PostgreSQL cluster
uses the runner's preinstalled binaries; the tool/server version is recorded.
Linux uses PostgreSQL 16. No user VIEWS-Staging state, browser profile, credentials
or persistent data are accessed.

Both runners apply all existing migrations, run the exact observation SQL against
synthetic keys/sessions/audit, exercise negative evidence cases, run real dump and
restore, and start Core with the pilot disabled/enabled to check its protection.
Positive audit/session fixtures are deliberately simulated: they do NOT certify
physical WebAuthn or Windows Hello. The hosted test does not run the user-specific
stop/switch/migration orchestration end-to-end, and does not certify that the
user's installed dependencies or computer are ready. Report those separately.

No production/main/public web/APK changes, real email or payment activation.

## Primary references

- Node 22 Windows .cmd limitations: https://nodejs.org/download/release/latest-jod/docs/api/child_process.html
- PostgreSQL 16 exported dump snapshot: https://www.postgresql.org/docs/16/app-pgdump.html
- Windows passkey user verification: https://learn.microsoft.com/en-us/windows/apps/develop/security/reference
