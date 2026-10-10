# Stage 5.33 — Controlled dead-letter recovery

## Administrator API
- `POST /api/v1/admin/notifications/dead-letters/requeue` accepts only an authenticated `admin` for the token's organization.
- Requests contain 1–25 dead job IDs and a 10–500 character reason. Duplicate or malformed IDs are rejected.
- Recovery resets a job to `pending`, clears its stored failure marker, resets attempts to zero, and makes it eligible immediately. It does not create a second guest inbox entry because the projector remains idempotent on the source event.
- A tenant-scoped transaction locks the organization's recovery budget and the selected dead jobs. Missing, completed, pending, or foreign-tenant IDs fail the entire request.

## Audit and limits
- Each recovered job appends its actor, reason, prior attempt count, tenant, job ID and timestamp to `service_notification_recovery_audit`. The database rejects audit updates and deletes.
- The API limits recovery to 100 jobs per organization during any rolling 15-minute window. Batch and rate-limit failures leave every job unchanged.
- Audit reads are protected by row-level tenant security. Responses contain job IDs and counts only; source payloads and guest data are never returned.

## Operational boundary
- Recovery repeats only the internal in-app notification projection. No SMS, email, push transport, external provider, dev auth secret, or live payment is involved.
- The action is not exposed in a guest or staff route; an `admin` role is required.
