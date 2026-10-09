# Stage 5.32 — Durable in-app notification projector (development)

## Architecture
- `0018_notification_jobs.sql` records one job per tenant and outbox event, with pending/completed/dead state, attempts and next retry time.
- `enqueueNotificationEvents` registers eligible order events with `ON CONFLICT DO NOTHING`. It does not publish externally.
- `processNotificationJobs` claims jobs with PostgreSQL `FOR UPDATE SKIP LOCKED`, projects allowlisted guest-safe messages, and atomically commits inbox insert and job completion. A crash rolls back the transaction and releases its row lock.
- Pure projection failures retry with capped exponential delays and become `dead` after five attempts. Error details are not stored in the database.
- SQL failures are deliberately **not** swallowed as successful retries; they roll back and surface for operator diagnosis.
- `GET /api/v1/me/notifications` now reads the materialized inbox only. No more writes from a guest GET request.
- An opt-in worker can run with `npm run notifications:worker`, `DATABASE_URL` and a trusted `VIEWS_WORKER_ORGANIZATION_ID`. It is tenant-scoped and must use the restricted application DB role.

## Verification
- Integration tests: concurrent workers cannot claim one event twice; retries and dead-letter states are bounded; guests and organizations cannot see each other's notifications.
- Existing HTTP tests now explicitly run the projector before checking inbox contents.
- This worker is **not deployed** automatically to the public Internet or Docker staging stack.

## Important limitations
- There is no external SMS, email, or push transport. This is an internal in-app projection only.
- The event discovery query scans eligible outbox events and is bounded per pass; production-scale deployments will need throughput/load tests, indexes, monitoring and retention.
- A dead job requires explicit operator investigation and a controlled requeue mechanism.
- There is no production identity-provider login, permanent HTTPS hosting, real payment collection or completed Android hardware validation.
- Do not expose development token entry pages publicly.
