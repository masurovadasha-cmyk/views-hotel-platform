# Stage 7.23 — Windows local deployment rehearsal

## Scope

This is a user-space local rehearsal, not a replacement for the reviewed Linux
Docker / Cloudflare Tunnel staging topology. It does not certify outbound
network isolation, permanent uptime, external alerts or an external Payme test.
No Windows service, scheduled task, firewall exception, WSL installation,
reboot, paid hosting or production deployment is performed.

The connected Windows computer had Git/Node but no Docker or WSL. The existing
repository was cloned from Stage 7.22, head 8f13085b8093ef1d612e0818f521343d847ca857,
into Documents/VIEWS/views-hotel-platform. Development remains in this repository.

## Boundaries

The new explicit VIEWS_LOCAL_REHEARSAL mode requires NODE_ENV=test,
VIEWS_ENV=local-rehearsal, direct proxy mode, restricted views_app credentials,
and the exact local PostgreSQL endpoint 127.0.0.1:55432/views_local.
It binds Core to 127.0.0.1 only. Existing Docker behavior is unchanged.

PostgreSQL listens only on 127.0.0.1:55432. A separate non-owner runtime login uses
SCRAM authentication. Secrets and data are stored under the user-private
%LOCALAPPDATA%/VIEWS-Staging directory, outside Git. Windows ACL inheritance on
that directory is removed, granting the current user and SYSTEM access. This is
local filesystem access control, not an external secret vault or proof of disk
encryption. Never upload that private directory or the runtime JSON file.

The frontend at http://127.0.0.1:4173/?api=demo is a static review of the shared
web interface. It is NOT silently wired to the PostgreSQL API. The review server
rejects /api and /v1 requests and does not expose configuration files.
Core readiness is separately available at http://127.0.0.1:3001/readiness.

## Tools and provenance

Portable Node.js 22.23.3 was downloaded from nodejs.org and its archive SHA-256
matched the official SHASUMS256.txt. The system Node installation is unchanged.
PostgreSQL 16.15 Windows binaries came from the official EnterpriseDB HTTPS URL.
A local archive SHA-256 was recorded; no independent vendor checksum was
available and the postgres executable reports NotSigned. Do not represent
that local checksum as an independently authenticated vendor signature.
No third-party repackaged PostgreSQL installer or administrative installer ran.

## Repeatable operations

The existing tools and development dependencies must be present first.
Run the portable Node executable with apps/api/ops/windows-local-rehearsal.cjs:

- init: initialize the dedicated cluster, create restricted login, apply the 38
  existing migrations, record their hashes, and reject modified applied files.
- start / verify: start the local database and Core, then assert readiness,
  runtime role and local-only listening addresses.
- test: require an empty synthetic application database, run the existing full
  Payme/expiry fixture through the actual local HTTP API and real PostgreSQL.
  Test provider mode is disabled again afterward. No external payment call runs.
- backup: create a custom-format pg_dump, restore to a separate newly named
  database, and compare row counts across all public tables. It does not delete
  the original database or previous backups.
- stop: stop only the recorded, identity-checked Core process and this PG cluster.

scripts/windows/start-local.cmd and stop-local.cmd also manage the local review
server. No OS startup registration is added. Turning off the PC stops availability.

The PostgreSQL child must inherit file handles, not parent capture pipes, on
Windows startup: otherwise a successful pg_ctl start can leave the launcher
waiting for descendant pipe closure. The launcher handles this explicitly.

## Measured checks on the connected computer

Complete Core TypeScript check and build passed. The selected local-boundary,
Payme adapter and authentication unit suite had 22 passing tests. All 38 SQL
migrations were actually applied on PostgreSQL 16.15.
The existing HTTP/expiry integration ran 26 scenario groups and 87 HTTP calls,
including concurrent replay, capture/refund rollback, tenant isolation, expiry
locks, stale audit recovery and balanced journals. Payme was disabled afterward.
A real backup was restored into another database; row counts matched across all
63 public tables. This is a synthetic-data restore rehearsal, not a production
backup/restore SLA or byte-for-byte equality claim.

Local JSON reports retain their original run sourceCommit (the checked-out
baseline before final commit). Final source file hashes and commit history must
be used to correlate the changes; do not rewrite measured reports to pretend
that tests ran on a later commit.

## Remaining

A signed/reviewed permanent Linux container deployment, stable named Tunnel,
backup encryption/retention/off-host storage, external monitoring, live guest/CRM
wiring, provider certification and production approval remain separate gates.
The old Cloudflare Workers-vs-Pages configuration mismatch is not resolved by
running a native Windows rehearsal. Published web and APK are not changed here.

Primary tool references:
https://www.postgresql.org/download/windows/
https://www.enterprisedb.com/download-postgresql-binaries
https://nodejs.org/dist/v22.23.3/SHASUMS256.txt
