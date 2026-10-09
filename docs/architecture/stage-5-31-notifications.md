# Stage 5.31 — Guest in-app notifications (development)

## Implemented
- Tenant-RLS PostgreSQL table `service_guest_notifications` with per-principal ownership, unique source outbox event and read timestamp.
- `GET /api/v1/me/notifications`: guest-only endpoint that projects recent eligible server events from orders owned by the authenticated guest. The unique source-event constraint prevents duplicates across repeated requests.
- `POST /api/v1/me/notifications/:id/read`: guest-only, idempotent read acknowledgement. Other users and tenants receive 404.
- Projection uses a strict event allowlist and fixed messages. Employee identities, raw event payloads and payment provider secrets are never copied into notifications.
- The guest development interface lists notifications and allows the guest to mark them read.
- PostgreSQL HTTP and Chromium tests cover inbox listing, retries, isolation and read acknowledgements.

## Explicit limitations
- Projection happens when the guest requests the inbox. There is **no background worker** or guaranteed continuous projection.
- The query processes up to the latest 200 eligible source events per request and returns the latest 50 inbox items. Large event backlogs need a durable cursor/batch worker before production.
- No push notifications, SMS, email, external delivery queue, retries, dead-letter queue, or delivery receipts exist yet.
- No persistent public HTTPS environment, full OIDC frontend, live payments or verified Android-device test.
- Only test data should be used with the development token-entry interface.

## Next
Build an independent outbox projector with a durable per-tenant cursor, lease/claim semantics, bounded retries and dead-letter handling, then connect explicit opt-in channels with provider verification. Do not mistake successful inbox polling for external delivery.
