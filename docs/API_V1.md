# VIEWS API v1 — staging contract

Current Cloudflare Pages Function contracts.

## Health
- GET /api/health
- GET /api/readiness

## Session boundary
- GET /api/session
- Staging currently accepts explicit demo headers only. This is not production authentication.
- Production email authentication must replace demo headers before any public operational launch.

## Guest service requests
- POST /api/guest-service-orders
- Requires authenticated guest identity.
- Reservation must belong to the guest and be active.
- Guest categories: concierge, cleaning, laundry, minimart, restaurant, bar, rent_car.
- Idempotency-Key supported.

## Staff service orders
- GET /api/service-orders
- POST /api/service-orders
- POST /api/service-order-action
- Server-side category/role restrictions.
- Action writes use optimistic version checks.
- Every mutation appends a domain event/outbox event where applicable.

## Housekeeping
- POST /api/housekeeping-action
- dirty -> cleaning -> inspection -> ready
- DND/service-declined explicit branches.

## Maintenance
- POST /api/maintenance-action
- open/assigned -> in_progress -> waiting/blocked -> inspection -> closed.

## Security
Demo headers are for staging contract verification only and MUST NOT be treated as production identity.
