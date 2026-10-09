# Stage 5.29 — Guest order recovery (development)

The guest market interface can now recover previously created orders after a browser reload by calling `GET /api/v1/me/orders`.

## Authorization
- Requires an authenticated principal with the guest role.
- PostgreSQL query is executed inside a tenant-scoped transaction and filters by both `organization_id` and the authenticated `created_by` identity.
- Returns at most 20 newest orders; no guest identity or tenant identifier is accepted from URL parameters.
- The existing `GET /api/v1/service-orders/:id` endpoint independently checks ownership again before showing details.

## UI behavior
- A guest may open their own order history and select an order to see current server status.
- Once an order is selected, the checkout is locked to avoid accidental duplicate purchases from the same view.
- The development token is not stored in localStorage or sessionStorage.
- Changing a test token before an order starts clears catalog, cart, booking selection and history to avoid carrying another user's cached UI into a new session.
- Pending checkout continues to use its original idempotency key and request payload. History cannot override an unresolved checkout.

## Tests
- PostgreSQL HTTP test: own history visible, other guest's history empty, unauthenticated 401, staff-only 403.
- Chromium test: new page loads history, selects order, displays server total and locks checkout.

## Limitations
- No pagination beyond 20 newest orders.
- No production browser login, token refresh or authenticated Android user session.
- Order recovery depends on the user signing in again; it is not offline storage.
- Real payment collection and production release remain disabled.
