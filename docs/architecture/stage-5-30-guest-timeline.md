# Stage 5.30 — Guest order progress from CRM and staff events

## Implemented
- New read-only `GET /api/v1/me/orders/:orderId/timeline` endpoint for authenticated guests.
- Tenant-scoped transaction verifies `service_orders.created_by` matches the authenticated guest before reading the order's outbox events.
- Timeline reads server-owned events already emitted by order creation, CRM fulfillment changes, dispatcher task assignment, staff task progress, cleaning completion, and laundry bag custody.
- The public response uses an explicit event allowlist and field projection. **Raw outbox payloads, employee IDs, task IDs and other operational data are not returned.**
- Guest interface displays event history and timestamps when opening an order or refreshing its status. No push notifications or background polling have been enabled.
- Existing CRM/staff actions and order-status transitions remain the source of truth; the timeline is read-only and does not mutate fulfillment or payments.

## Tests
- PostgreSQL HTTP integration: own timeline, foreign principal denied, cross-organization denied, staff-only role denied, private employee identifier never returned.
- Chromium: reopen an order and see the market delivery assignment in the guest timeline.
- Syntax check for the timeline module.

## Release blockers
- This is an in-app event history, **not** an SMS/push/email notification system.
- The outbox is still a transactional event store; a durable notification projection/worker and delivery receipts require a separate design and retry/dead-letter policy.
- Production OIDC browser login, canonical PMS sync, permanent HTTPS staging, Canva parity, real payment processing, and Android hardware testing remain incomplete.
