# VIEWS unified booking calendar — Stage 5.35

Single shared browser module: `services/service-core/public/views-calendar.js`.

## Implemented
- One premium light-theme calendar used in guest and CRM, informed by the supplied references.
- Scrollable month stack, Monday-first weeks, range highlighting with circular start/end, number of nights, reset, save, Escape-to-close, keyboard-accessible buttons.
- Guest: confirmed stay date ranges are loaded from `/api/v1/me/bookings` and synchronized with the selected booking. Saving a date range is **a local preview only**; it does not modify an existing reservation, take payment, or claim room availability.
- CRM: filtered orders and protected read-only reservations from `GET /api/v1/crm/bookings`. The filter uses interval overlap: booking.start < selection.end and booking.end > selection.start.
- The dispatcher is restricted to reservations of properties with `order:manage` access. Admin can read the organization's reservations. The API does not expose guest names or personal data.
- Included the shared JavaScript asset in the development web snapshot and in the HTTP server's dev-only static asset allowlist.
- Added Chromium checks for the same selector in guest and CRM, and PostgreSQL HTTP tests for authorization.

## Not yet implemented
- A real booking mutation workflow (hold, availability lock, rate quote, checkout, confirmation, refunds) requires PMS integration. This stage cannot safely invent or overwrite it.
- The source screenshots also show an occupancy pricing grid with guest avatars and nightly rates; the current service-core schema does not provide verified public name/photo or a rate-calendar API. No fictitious guests/prices were inserted.
- Dark-mode parity, all legacy host/mobile routes, Canva asset-to-code parity, production OIDC, public deployment, and real Android hardware validation are outstanding.

## Invariants
- Check-out is an exclusive date boundary, and the count is based on UTC calendar days, avoiding timezone/DST drift.
- All CRM bookings stay tenant and property scoped in the database.
- A previewed date range is never submitted as a booking without a real availability-and-price verification endpoint.
