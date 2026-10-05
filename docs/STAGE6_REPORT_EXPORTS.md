# Stage 6.8 — Durable Analytics Report Exports

Status: implementation candidate.

## Goal

Turn the canonical Dashboard schema v2 into durable, reproducible report snapshots without
recalculating hospitality or marketplace KPI definitions in a second reporting engine.

Reports are aggregate analytics only. They contain no guest passport/document data, payment card data,
raw provider secrets, email addresses or phone numbers.

## Source

Every report is generated from:

- Analytics Dashboard Read Model schema v2;
- its membership/property scope;
- its source fingerprint;
- its canonical hospitality/lifecycle/marketplace calculations.

The report worker does not query transactional reservations to redefine KPI math.

## Migration

- `0025_analytics_report_exports.sql`

Table:

- `analytics_report_jobs`

## Job contract

Supported report kind:

- `dashboard_summary`

Formats:

- `json`
- `csv`

Job states:

- `queued`
- `processing`
- `completed`
- `failed`

A completed report stores:

- source fingerprint;
- immutable JSON snapshot;
- rendered content text;
- content type;
- file name;
- SHA-256 content hash;
- completion timestamp;
- 30-day expiry.

Completed job content is immutable.

## Idempotency

Create requests require:

- `Idempotency-Key`

Uniqueness:

- organization;
- membership;
- idempotency key.

The request hash includes:

- report kind;
- format;
- property scope;
- date range;
- report schema version.

Same key + same request returns the same job.
Same key + different request fails with `REPORT_IDEMPOTENCY_CONFLICT`.

## Authorization / scope

Read/write RLS requires:

- current organization;
- exact requesting membership;
- active analytics read role:
  - host
  - owner
  - manager
  - accountant
- requested property still accessible when property-scoped.

A manager report is not visible to another membership merely because both belong to the same organization.

## Worker

Cross-tenant claiming uses:

- `app.claim_analytics_report_jobs(...)`

Properties:

- `FOR UPDATE SKIP LOCKED`;
- bounded lease;
- attempt counter;
- stale processing leases can be reclaimed.

Completion uses a lease-token SECURITY DEFINER function.
A worker whose lease expired cannot complete the job.

Failures use:

- exponential retry for transient worker/network errors;
- deterministic authorization/input failures fail immediately;
- maximum retry count for transient failures.

Only normalized error codes are persisted. Arbitrary exception text is not stored.

## Snapshot generation

Worker reconstructs the original actor context from the durable job:

- organization;
- user;
- membership;
- optional property;
- original date range.

It invokes the same Dashboard service used by the management UI.

The transient dashboard cache metadata is removed from the immutable report snapshot.

## JSON

JSON content contains:

- report metadata;
- canonical Dashboard schema v2 payload.

Content is pretty-printed UTF-8 JSON and hashed with SHA-256.

## CSV

CSV is a deterministic flattened representation of canonical dashboard sections:

- hospitality;
- lifecycle;
- marketplace economics;
- geography;
- channel/segment breakdown.

CSV values are escaped using standard quote-doubling rules.

It does not merge different currencies into one money amount.

## API

Create:

`POST /v1/analytics/reports`

Headers:

- `Idempotency-Key`
- normal staff actor context headers.

Body:

```json
{
  "from": "2036-09-01",
  "to": "2036-09-30",
  "propertyId": "<optional uuid>",
  "format": "json"
}
```

Status:

`GET /v1/analytics/reports/:jobId`

Content:

`GET /v1/analytics/reports/:jobId/content`

Content endpoint returns:

- `ETag: "sha256-..."`
- `X-Content-SHA256`
- `Cache-Control: private, no-cache, must-revalidate`
- attachment file name.

Matching `If-None-Match` returns HTTP 304.

Expired report content returns HTTP 410.

## Retention

Completed report content expires after 30 days.

Bounded cleanup:

`SELECT app.prune_analytics_report_jobs(10000, now());`

Failed jobs older than 30 days can also be pruned.

## Automated acceptance

Production Core verifies:

- migration chain;
- RLS / tenant isolation;
- idempotent job creation;
- idempotency conflict;
- not-ready state before worker processing;
- leased worker generation;
- JSON snapshot integrity;
- SHA-256 content integrity;
- immutable completed report;
- deterministic CSV;
- membership isolation;
- property scope denial;
- scoped host report generation.

## Next work

- scheduler trigger for report worker cycles;
- scheduled recurring report subscriptions;
- email/provider delivery adapters;
- object-storage adapter for future large/detail exports;
- signed short-lived external download links if required.
