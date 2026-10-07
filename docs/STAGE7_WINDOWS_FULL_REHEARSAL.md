# Stage 7.31: full native Windows upgrade rehearsal

The earlier native runtime suite exercised shared functions, not the whole
stop/backup/migrate/build/restart command. This additional workflow closes that
specific gap on a disposable hosted Windows runner. It does not claim a user-PC
rollout, a Windows Hello ceremony, or permission to bypass a denied host action.

## What executes

The harness creates a fresh LOCALAPPDATA beneath RUNNER_TEMP and copies the
runner's existing Node and PostgreSQL tools into that fixture only. It records
actual tool versions: the directory names are the operator's expected layout,
not evidence of an installed PostgreSQL major version. It refuses to start unless
ports 3001, 4173 and 55432 are free and the checkout is the exact reviewed branch
and SHA. No existing user state, saved browser profile or secret is imported.

It creates a new PostgreSQL cluster, applies migrations 0001–0040, seeds the
nonprivileged LOCAL workspace, and starts actual Core and the actual gateway.
A fixture employee activates an invitation, signs in and reserves two nights
through HTTP. The initial application is the current built source against schema
0040: this is NOT a claim about every older application's binary compatibility.

Next, the EXACT existing windows-local-rollout.cjs command runs in a subprocess.
It uses its unchanged production-safe guards, stops only owned test processes,
backs up and restores public/private data, applies 0041–0044, rebuilds web/Core,
restarts the loopback processes and probes the enabled-but-protected passkey
handler. No mock replaces this orchestration. Wrong-SHA and deliberately corrupted
fixture-ledger tests must fail before stopping the running test application.

The retained fixture password hash/version, staff session and reservation must
survive. Applied migration hashes and timestamps must remain unchanged. A second
real rollout must have no pending migrations and must use a NEW backup. The old
reservation must remain releasable, with zero payment intents created. Logout and
process cleanup are checked afterward. All private fixture files/dumps stay out
of artifacts, and no live process's data directory is deleted.

## Microsecond observation regression

The first full Windows rehearsal at 9451a43 passed, but the parallel Linux native
suite failed at the positive audit/session observation. Its earlier successful
runs did not establish determinism. The observer read PostgreSQL's current time
as a JavaScript Date, which discarded microseconds, then sent that rounded-down
value back as an upper SQL bound. An audit event written during the same
millisecond could consequently be omitted despite preceding the actual clock.

The observer now obtains UTC text with six fractional digits directly from
PostgreSQL and preserves that exact text in BOTH SQL bounds and saved observation
start times. It refuses an accidental Date/millisecond-only clock value. Unit
regressions verify unchanged .123456/.123789 bounds and refusal before evidence
queries when precision has already been lost. The native suite executes the real
revised SQL on Windows PostgreSQL and Linux PostgreSQL 16; no arbitrary sleep,
retry-until-green, widened audit window or disabled test hides the failure.

Primary contract: https://node-postgres.com/features/types (timestamp precision).

## Evidence

Only a source-bound report with all required scenarios, both completed rollouts,
public/private backup equality, protected runtime and closed listeners may be
published as verified. Failed diagnostics are separately named. Source archives
contain code only, never fixture keys, passwords, cookies or database dumps.

## Still not proven

The user's PC has not been changed by hosted CI. Local source conflicts,
missing user-machine dependencies, physical Windows Hello/security-key prompts,
privilege/global-role restoration, external mail and production remain separate.
Host safety denials are not bypassed. This test is isolated engineering work,
not an alternative route for executing a denied user-host operation.
