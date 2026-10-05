# Stage 6.10 — Recurring Analytics Report Schedules

Status: implementation candidate.

## Goal

Turn the Stage 6.8 durable report/export jobs into a recurring scheduler without pretending an email
or messaging delivery provider is connected.

This stage schedules and generates report artifacts. Delivery remains artifact-only until a real
provider adapter is configured.

## Supported schedules

Cadence:

- daily
- weekly
- monthly

Schedule time is interpreted in the property timezone for property-scoped reports, or the
organization timezone for organization-scoped reports.

Weekly schedules use ISO weekday:

- 1 = Monday
- 7 = Sunday

Monthly schedules accept day 1-28 to avoid ambiguous month-end behavior.

## Supported report periods

- previous_day
- previous_7_days
- previous_month

The report period is calculated from the scheduled occurrence in the schedule timezone.

The current day is not included.

## Database

Migration:

- 0026_analytics_report_schedules.sql

Table:

- analytics_report_schedules

Each schedule stores:

- tenant/property scope
- report type / format
- cadence / period
- timezone / local run time
- creator user / membership
- next scheduled run
- retry-not-before timestamp
- lease token / lease expiry
- consecutive failures / max failures
- last normalized error code
- last enqueued occurrence
- last report job ID

## Idempotency

Every scheduled occurrence uses:

schedule:<scheduleId>:<scheduledForISO>

as the report-job idempotency key.

If the scheduler repeats the same occurrence after a crash, AnalyticsReportService returns the same
job instead of creating a duplicate.

## Scheduler lease

Function:

- app.claim_due_analytics_report_schedules(...)

uses:

- FOR UPDATE SKIP LOCKED
- lease token
- lease expiry
- next_run_at
- next_attempt_at

This allows multiple scheduler workers without double-claiming one occurrence.

## Completion

A successful enqueue:

1. creates/replays one report job;
2. verifies that the job belongs to the same organization and creator membership as the schedule;
3. records last_report_job_id;
4. records last_enqueued_at;
5. advances next_run_at using the schedule timezone;
6. clears the lease and failure state.

## Failure and retry

Scheduler errors are normalized.

Retry delay uses bounded exponential backoff.

After max consecutive failures:

- the schedule becomes paused;
- no later occurrence is silently skipped;
- an operator must resume the schedule.

Resume recalculates the next future occurrence from current time and clears the failure state.

## API

Create schedule:

POST /v1/analytics/report-schedules

Required:

- Idempotency-Key
- normal Core actor context

Body example:

```json
{
  "reportType": "dashboard_summary",
  "format": "csv",
  "cadence": "weekly",
  "periodKind": "previous_7_days",
  "localTime": "08:00",
  "isoWeekday": 1,
  "propertyId": "<optional Core property UUID>"
}
```

Read:

- GET /v1/analytics/report-schedules
- GET /v1/analytics/report-schedules/:id

Control:

- POST /v1/analytics/report-schedules/:id/pause
- POST /v1/analytics/report-schedules/:id/resume

## Internal Cron / worker endpoint

POST /v1/internal/analytics/report-cycle

Required:

- X-Views-Internal-Key

Optional body:

```json
{
  "scheduleLimit": 20,
  "reportLimit": 20
}
```

The endpoint runs:

1. due schedule enqueue cycle;
2. report render worker cycle.

It uses the Stage 6.9 internal server-to-server authentication key.

A browser must never call this endpoint directly.

## Authorization

Schedule create/read/control roles:

- host
- owner
- manager
- accountant

Property access is enforced by app.can_access_property.

A schedule created by one membership is visible to that membership. Owner/manager/accountant may
also read organization schedules subject to property scope.

The scheduler replays the original creator actor when it creates the report job.

If that membership no longer has access, generation fails and the schedule follows retry/error
semantics rather than bypassing authorization.

## Automated acceptance

Integration tests verify:

- timezone-aware next run calculation;
- daily / weekly / monthly validation;
- previous-period calculation;
- idempotent schedule creation;
- paused schedules are not claimed;
- due schedules enqueue exactly one report job;
- replay does not duplicate the occurrence;
- next_run_at advances;
- last_enqueued_at is recorded;
- last_report_job_id points to the enqueued job;
- report worker renders the generated artifact;
- scoped host cannot read a manager-owned schedule;
- pause/resume behavior;
- internal cron endpoint rejects missing internal key.

## Not implemented / not faked

This stage does not claim to send:

- email
- SMS
- Telegram
- Slack
- push notifications

Those require a real delivery adapter, verified destinations, bounce/error handling and delivery
audit.

## Next work

- report delivery adapter interface
- email/Slack/Telegram adapters only after real credentials/contracts exist
- report retention / expiry
- download audit event
- object storage for large exports
