# Stage 6.8 — Analytics Report / Export Layer

Status: implementation candidate.

## Goal

Export canonical VIEWS analytics without recalculating KPI logic in a browser and without pretending
a production object-storage provider is connected when it is not.

The export layer is asynchronous:

1. authenticated staff creates an idempotent export request;
2. a lease-safe worker claims due jobs;
3. the worker reads canonical analytics APIs/services;
4. CSV is rendered with spreadsheet-injection protection;
5. bytes are stored through an explicit storage adapter;
6. job metadata records checksum/size/provider/object key;
7. authorized requester can obtain a short-lived download URL.

## Supported reports

CSV reports:

- `property_daily`
- `booking_cohorts`
- `marketplace_economics`
- `city_daily`
- `country_daily`

Property is required for the first three report types.

Portfolio reports do not accept a property ID.

Maximum period:

- 366 days.

Maximum generated CSV size:

- 10 MiB.

## Database

Migration:

- `0024_analytics_export_jobs.sql`

Table:

- `analytics_export_jobs`

Important fields:

- organization / membership / creator;
- optional property;
- report type / format;
- period;
- idempotency key + request hash;
- status;
- storage provider / object key;
- content SHA-256 / byte length;
- attempt count / next attempt;
- lease token / lease expiry;
- normalized error code;
- completion / cancellation timestamps.

Statuses:

- pending
- processing
- completed
- failed
- cancelled

## RLS and ownership

Export jobs use FORCE RLS.

A job is visible only when:

- organization matches current tenant;
- membership matches current membership;
- property is either null or currently accessible.

This means a completed export is not a cross-membership shared cache.

## Idempotency

Unique identity:

- organization
- membership
- Idempotency-Key

Replay with the same normalized request returns the existing job.

Reuse of the same key with different report/property/period fails with:

- `ANALYTICS_EXPORT_IDEMPOTENCY_CONFLICT`

## Lease worker

Database claim function:

- `app.claim_analytics_export_jobs(...)`

Properties:

- `FOR UPDATE SKIP LOCKED`
- bounded batch
- 5 maximum attempts
- 5-minute processing lease
- exponential retry backoff
- permanent vs transient failure

Permission changes are re-evaluated at render time because report queries run under the original
user/membership actor context.

Examples of permanent failures:

- role no longer allowed;
- property scope revoked;
- invalid report definition;
- generated export exceeds size limit.

Storage unavailable is treated as retryable.

## Storage boundary

Interface:

- `AnalyticsExportStoragePort`

Operations:

- put generated object;
- create short-lived download URL.

The default application does **not** register a fake storage provider.

When no production adapter is connected:

- export processing reports `ANALYTICS_EXPORT_STORAGE_NOT_CONNECTED`;
- download cannot be generated.

Future adapters may target R2/S3/Azure Blob or another approved private object store.

## CSV security

The renderer:

- uses deterministic CRLF CSV;
- quotes commas, quotes and line breaks;
- neutralizes cells beginning with `=`, `+`, `-`, or `@` by prefixing an apostrophe.

This prevents exported dimension text from becoming a spreadsheet formula when opened in Excel-like tools.

## APIs

Create:

`POST /v1/analytics/exports`

Required:

- `Idempotency-Key`

Body example:

```json
{
  "reportType": "property_daily",
  "propertyId": "<uuid>",
  "from": "2034-06-01",
  "to": "2034-06-30"
}
```

Status:

`GET /v1/analytics/exports/:id`

Cancel pending:

`POST /v1/analytics/exports/:id/cancel`

Short-lived download URL:

`GET /v1/analytics/exports/:id/download`

The worker itself is not exposed as a public HTTP endpoint.

## Canonical data sources

Exports call existing analytics query services:

- property materialized rollups;
- canonical booking cohorts;
- finalized marketplace economics;
- city portfolio rollups;
- country portfolio rollups.

No duplicate KPI formulas are implemented in the exporter.

## Automated acceptance

Tests verify:

- idempotent request creation;
- idempotency conflict;
- lease claim;
- canonical property rollup query;
- CSV generation;
- object checksum / byte metadata;
- completed status;
- signed download URL;
- pending cancellation;
- front-desk RBAC denial;
- formula-injection neutralization;
- deterministic CSV escaping.

## Next work

- production R2/S3/blob storage adapter;
- scheduler binding for export worker;
- export retention / automatic object deletion;
- XLSX/PDF presentation adapters;
- scheduled report delivery.
