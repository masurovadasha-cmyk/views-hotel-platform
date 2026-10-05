# Stage 6.8 — Durable Analytics Report / Export Jobs

Status: implementation candidate.

## Goal

Provide asynchronous, idempotent exports from the canonical analytics dashboard without running
serialization/download work inside the report-creation HTTP request.

Initial report type:

- `dashboard_summary`

Formats:

- JSON
- CSV

## Architecture

Flow:

1. authenticated actor creates a report job;
2. PostgreSQL stores the normalized request and idempotency hash;
3. a leased worker claims the job;
4. worker calls the canonical Dashboard schema v2 service under the original actor scope;
5. worker renders deterministic JSON or safe CSV;
6. PostgreSQL atomically stores the artifact and marks the job completed;
7. authorized actor downloads the immutable artifact.

The worker does not recalculate KPI formulas independently. It exports the canonical dashboard model.

## Database

Migration:

- `0025_analytics_report_exports.sql` — base jobs/artifacts
- `0026_report_export_hardening.sql` — retention, active-role RLS and lease-safe mutations

Tables:

- `analytics_report_jobs`
- `analytics_report_artifacts`

### Job lifecycle

Statuses:

- queued
- processing
- completed
- failed
- cancelled

Worker fields:

- attempt count
- max attempts
- next attempt time
- lease token
- lease expiry
- last normalized error code

Claim uses `FOR UPDATE SKIP LOCKED`.

If a worker crashes, a `processing` job becomes claimable again after its lease expires.

Failures use bounded exponential retry delay. After max attempts the job becomes `failed`.

Worker mutations require a still-valid lease token. A stale worker whose lease expired cannot
complete or fail a job.

Persisted worker errors are strict machine-readable codes. Arbitrary exception text is not stored.

## Idempotency

Create request requires:

- `Idempotency-Key`

Uniqueness scope:

- organization
- creating membership
- idempotency key

The request hash includes:

- report type
- format
- property scope
- date range

Same key + same request returns the original job.

Same key + different request returns an idempotency conflict.

## Artifact storage

Stage 6.8 intentionally implements a real compact-report storage path without pretending an external
object store is connected.

Artifact bytes are stored in PostgreSQL `bytea` with a hard limit:

- 2 MiB per artifact.

Metadata:

- content type
- filename
- byte size
- SHA-256 checksum
- format
- created timestamp
- artifact expiry timestamp

Retention:

- completed artifacts expire after 30 days;
- bounded cleanup uses `app.prune_analytics_report_artifacts(...)`;
- expired downloads return HTTP 410.

This is appropriate for compact dashboard snapshots.

Large operational extracts / guest-level bulk exports are **not** supported by this inline store and
should later use an object-storage adapter.

## Deterministic JSON

JSON export:

- removes volatile dashboard `cache` metadata;
- recursively sorts object keys;
- preserves canonical arrays;
- writes UTF-8;
- computes SHA-256 over final bytes.

The same dashboard source model produces the same report checksum regardless of cache-hit metadata.

## CSV

CSV is a deterministic long-form export:

- columns: `path,value`
- nested values are flattened into canonical paths
- arrays use numeric indexes
- UTF-8 BOM is included for spreadsheet compatibility

Spreadsheet formula injection is neutralized by prefixing values that begin with:

- =
- +
- -
- @

after optional leading whitespace.

## API

Create:

`POST /v1/analytics/reports`

Required header:

- `Idempotency-Key`

Body:

```json
{
  "reportType": "dashboard_summary",
  "format": "json",
  "from": "2036-01-01",
  "to": "2036-01-31",
  "propertyId": "<optional uuid>"
}
```

Read status:

`GET /v1/analytics/reports/:reportJobId`

Download completed artifact:

`GET /v1/analytics/reports/:reportJobId/download`

Download response uses:

- private cache policy
- report checksum ETag
- If-None-Match / 304 support
- `X-Content-SHA256`
- safe generated filename
- HTTP 410 after artifact expiry

## Authorization / RLS

Create roles:

- host
- owner
- manager
- accountant

Property reports require current property access.

Read rules:

- creator membership can read its jobs;
- owner/manager/accountant can read organization jobs within property scope;
- host cannot read another membership's job.

Artifacts inherit visibility from the associated report job through RLS.

The worker replays the original actor user/membership when building the dashboard. If that actor no
longer has valid access, generation fails rather than bypassing authorization.

## Acceptance

Automated tests verify:

- JSON renderer is deterministic when only volatile cache metadata differs;
- JSON does not export dashboard cache metadata;
- CSV is flattened and formula-safe;
- report creation is idempotent;
- idempotency-key mismatch is rejected;
- worker claims and completes jobs;
- completed job stores source fingerprint and artifact checksum;
- JSON artifact contains canonical Dashboard schema v2 KPI values;
- CSV artifact contains canonical paths/values;
- scoped host cannot read/download a manager-created report.

## Next work

- report scheduler / recurring delivery;
- object-storage port for >2 MiB exports;
- audit event for artifact downloads;
- guest-level operational exports with explicit PII permissions.
