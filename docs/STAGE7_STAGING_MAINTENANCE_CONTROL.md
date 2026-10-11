# Stage 7.22 — staged maintenance control and deployment diagnostics

## Actual activation state

This change implements and tests the control layer. It does NOT provision a
persistent host, deploy production, activate external Payme sandbox credentials,
start a scheduler in the user's account, send an alert, merge predecessor PRs,
or publish a new web/APK release. The existing $0/no-new-spend constraint remains.

At discovery the connected Desktop Commander device was offline. Cloudflare
Containers has no Free allocation and requires Workers Paid; it is therefore
not provisioned. No Railway VM/resource, DigitalOcean Droplet, Replit autoscale,
or metered browser automation is used to get around that constraint.

## Same application, isolated process

`apps/api/ops/staging-maintenance.mjs` runs the EXISTING compiled
`dist/payments/run-payme-expiry.js`. It does not duplicate payment logic.

The optional `docker-compose.staging-maintenance.yml` profile shares one immutable
image with Core. The maintenance container joins ONLY internal `core_data`, not
Core ingress, public egress or metrics. It has no HTTP listener, published port,
Docker socket, Cloudflare Tunnel credential or DB-owner password. It runs as
1000:1000 with read-only rootfs, dropped capabilities, and no-new-privileges.
A private named volume holds aggregate receipts. Core stays the source of truth.

The topology validator consumes rendered Compose JSON and rejects image drift,
public-network attachment, extra capabilities, root execution, host mounts,
arbitrary commands, wrong release/tenant environment, or database mismatch.
It does not certify an operator's claimed cloud billing state.

## Explicit enabling

All are required:

- `VIEWS_STAGING_MAINTENANCE_ENABLED=true` (default false).
- `VIEWS_ENV=staging` and sandbox-only Payme configuration.
- `VIEWS_STAGING_COST_ACK=NO_NEW_SPEND` after verifying the existing host's cost.
- A reviewed 40-character `VIEWS_STAGING_RELEASE_SHA` and immutable shared image.
- CLI acknowledgement `--ack=STAGING_MAINTENANCE_ONLY`.

Disabled execution creates no child or report and makes no DB connection.
The Compose service is in a nondefault profile, with no auto-restart. A real
operator must explicitly start it on approved staging. Reboot recovery and
permanent activation are separate operational decisions, not implicit here.

## Scheduling and hard process deadline

Default: one scan of at most 50 candidates, then 300 seconds AFTER completion
before the next scan. No overlap within one supervisor; no rapid retry loop.
The existing expiry worker's database locks protect concurrent execution.
A single supervisor/replica is required for shared latest/incident reporting;
the file reporting protocol is not a distributed lease or split-brain solution.

The child receives 45 seconds total, including app startup and DB connection
waits. The supervisor sends SIGTERM and, after one second, SIGKILL. It waits for
the child to exit. Killing this separate worker process closes its DB sockets;
an incomplete PostgreSQL transaction is rolled back rather than marked success.
Parent SIGTERM stops the child and the schedule. The network container uses init.
Host or kernel failure cannot be bounded by an application-level timeout.

## Durable, bounded and redacted reports

Before dispatch, `latest.json` is atomically replaced by a `running` receipt.
On completion it records healthy/degraded/error/interrupted, source release,
run UUID, timestamps and whitelisted aggregate counters. Child stdout/stderr,
SQL, body, URLs, credential values and payment identifiers are never copied.
Each JSON write uses an exclusive temporary file, fsync, rename and directory
fsync; files are mode 0600. History retains at most 48 receipts. Symlink report
roots and malformed/oversized latest reports fail closed before worker startup.

`incident-latest.json` records state changes and interrupted previous cycles.
It is a LOCAL latest incident record, not remote delivery or an immutable audit
trail. A subsequent recovery can replace it. Runtime financial/audit data remains
in PostgreSQL; these operational files are not a substitute for database audit.

Health checks reject missing, expired, wrong-release or future-dated receipts.
They do not reuse yesterday's green result after a failed scan. Docker health
status itself is NOT an external alert. A separate monitoring host/recipient is
still needed to detect total host loss and send notifications.

## Operator activation checklist (not executed here)

1. Confirm an existing authorized persistent Docker host at zero new spend.
2. Apply reviewed PostgreSQL migrations, restricted runtime grants, and verify a
   backup and restore rehearsal. Never copy fixture passwords into staging.
3. Pin the exact approved Core image and source SHA. Use a staging-only database
   and provider test credentials from an approved secret store.
4. Complete named Tunnel same-hostname failover and direct-origin closure checks.
   Two connectors on one host still do not provide host-level HA.
5. Render the base plus maintenance profile with `--profile ops --profile maintenance`
   into a mode-0600 temporary file; run origin, egress and maintenance topology
   gates. Delete that file afterward because it contains resolved secrets.
6. Run `node /app/ops/staging-maintenance.mjs --once --ack=STAGING_MAINTENANCE_ONLY`
   in the maintenance container. Inspect the local report and health check.
7. Explicitly start the optional watch service only after the preceding evidence
   is approved. Stop only `payme-maintenance` to roll this service back; do not use
   `down -v` on persistent staging. The disposable CI harness uses `down -v` only
   with its uniquely named fixture project and its exact fixture DB URL.
8. Route incidents and stale heartbeats to an approved observer. No alert address
   is invented and no external alert delivery is enabled in this commit.

## Tests

Node acceptance tests exercise actual subprocess termination, output limits,
activation rejection, non-overlap, receipt persistence, stale-result rejection,
report permissions, bounded retention and topology mutation cases.

The container proof applies every migration, seeds one synthetic organization,
and executes the actual expiry CLI twice under restricted runtime configuration.
It recreates the maintenance container between runs and verifies persisted
receipts, production-mode refusal, unchanged receipt after refusal, and stale
heartbeat failure. This fixture has ZERO overdue payments; cancellation behavior
is tested independently by the retained 26-scenario Stage 7.21 regression.
The two one-shot executions do not claim prolonged scheduler or host availability.

The dedicated workflow preserves exact source and measured reports. Pending or
failed jobs are never marked successful in delivery notes.

## Cloudflare build diagnosis

The repository's root `wrangler.toml` is a Pages config (`pages_build_output_dir`).
The attached failing check is named `Workers Builds: views-hotel-platform`.
The diagnostic job uses published Wrangler 4.148.0, attempts Workers
`deploy --dry-run` against the existing config, and separately compiles the
existing Pages Functions without deployment or Cloudflare credentials.

A reproduced Pages/Workers mismatch is an actionable configuration diagnosis,
NOT proof that the inaccessible dashboard build used the same command or that
remote credentials/bindings are correct. The Cloudflare dashboard settings and
private build logs must be inspected before claiming the remote failure fixed.
No dashboard configuration is changed here. The existing Pages/D1 layer is not
silently declared equivalent to the PostgreSQL Core or rewritten into a second
payment engine merely to claim a free persistent deployment.

## Primary references

- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Workers build commands and root selection: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Pages Functions local build: https://developers.cloudflare.com/workers/wrangler/commands/pages/
- Docker Compose override/reset: https://docs.docker.com/reference/compose-file/merge/
- Node child process termination: https://nodejs.org/docs/latest-v22.x/api/child_process.html
