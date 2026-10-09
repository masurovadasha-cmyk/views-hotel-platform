# Stage 5.2 — booking-linked guest market authorization

## Behavior
- Guests retrieve their own active checked-in stays with `GET /api/v1/me/bookings`.
- Guest order creation requires a `bookingId`, not an arbitrary property identifier.
- `createMarketOrder` resolves the booking to the property inside the order transaction.
- Booking access is restricted to the authenticated principal, same organization, checked-in status, and current stay window.
- Dispatcher/admin orders still require explicit `service_property_access.order:create` authorization.
- Idempotency fingerprints include booking and authenticated principal; retries cannot silently reuse a different guest's order.
- Guests may read only their own orders, while CRM routes remain staff-only.

## Critical boundary
`service_guest_bookings` is a temporary authorization projection, NOT the canonical PMS booking table. Only a trusted server-side booking event consumer should populate or update it. Never allow the guest to create or alter their booking access row.

## Release blockers
- Real authentication (OIDC/JWKS), booking event synchronization and revocation handling are not implemented.
- No live payment capture, settlement, refunds or tax calculation.
- No production deployment, operational monitoring or full browser test.
- Canva design parity remains incomplete.
- Development-only market pricing and delivery tariff remain illustrative.

## Verification
CI must apply migration 0008 and pass the PostgreSQL HTTP test covering guest booking listing, guest order creation, cross-principal denial and reserve release.
