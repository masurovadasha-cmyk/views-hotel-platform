# Stage 6.11 — Analytics Report Governance

Status: implementation candidate.

## Goal

Harden the existing dashboard report/export pipeline with:

- explicit artifact retention;
- lease-safe worker mutation;
- deterministic expired-download behavior;
- bounded artifact cleanup;
- audit of successful report downloads.

This stage does not add a fake delivery provider or large-object storage.

## Migration

- `0027_report_governance.sql`

It runs after:

- `0025_analytics_report_exports.sql`
- `0026_analytics_report_schedules.sql`

## Retention

Completed report artifacts have a retention deadline:

- 30 days from successful report completion.

`analytics_report_jobs.artifact_expires_at` stores the deadline.

A completed job must have:

- completed_at;
- source_fingerprint;
- artifact_expires_at > completed_at.

The report status remains completed after bytes expire. The job is still an audit/history record.

## Download behavior

Before expiry:

- authorized download returns the immutable artifact.

After expiry:

- artifact access fails with `REPORT_EXPIRED`;
- HTTP controller maps this to 410 Gone.

Download response includes:

- private/no-cache policy;
- checksum ETag;
- `X-Content-SHA256`;
- `X-Artifact-Expires-At`;
- safe filename.

Conditional 304 does not count as a download and is not audited.

## Download audit

A successful 200 download records one existing `audit_log` event:

- action = `analytics.report.download`
- entity_type = `analytics_report_job`
- entity_id = report job UUID
- actor user / membership / request ID from the verified Core actor context

The audit payload contains only:

- format;
- byte size;
- SHA-256 checksum.

It does not contain:

- report bytes;
- report JSON/CSV contents;
- provider secrets;
- guest PII.

## Worker lease hardening

`app.complete_analytics_report_job(...)` now requires:

- status = processing;
- matching lease token;
- lease_until > now().

`app.fail_analytics_report_job(...)` requires the same active lease boundary.

A stale worker cannot complete or fail a job after its lease expires.

Worker result distinguishes:

- completed;
- queued;
- failed;
- lease_lost.

Persisted worker errors remain normalized machine codes. Arbitrary exception strings are not persisted.

## RLS hardening

Report job reads require a currently active role:

- host
- owner
- manager
- accountant

Creator ownership alone is not sufficient when the membership is no longer active.

Property scope remains enforced.

## Bounded cleanup

Function:

`app.prune_analytics_report_artifacts(limit, now)`

Deletes only artifact bytes whose report retention deadline has passed.

It does not delete the report job/history row.

Limit:

- 1..100000 at SQL boundary;
- internal application cycle uses 1..10000.

## Internal operations cycle

The protected endpoint introduced in Stage 6.10:

`POST /v1/internal/analytics/report-cycle`

now performs:

1. due schedule enqueue;
2. report rendering;
3. bounded expired-artifact cleanup.

Optional body:

```json
{
  "scheduleLimit": 20,
  "reportLimit": 20,
  "pruneLimit": 1000
}
```

Requires:

- `X-Views-Internal-Key`

## Acceptance

Automated tests verify:

- completed jobs expose artifact expiry;
- artifact expiry is later than completion;
- artifact access fails after a supplied post-expiry clock;
- successful download audit stores only checksum/size/format;
- report bytes are not stored in audit state;
- 304 response does not create a download audit;
- 200 response creates exactly one audit call;
- response exposes checksum and expiry headers;
- internal report cycle invokes bounded retention cleanup;
- migration chain/typecheck/API tests/build stay green.

## Not implemented / not faked

No claim is made that VIEWS currently sends scheduled reports through:

- email;
- SMS;
- Telegram;
- Slack;
- push.

No external object storage is claimed connected.

## Next work

- object-storage port for artifacts larger than 2 MiB;
- real delivery adapter interface;
- provider-specific delivery only after credentials/contracts exist;
- configurable retention policies if legal/business requirements demand them;
- guest-level exports only with explicit PII permissions.
