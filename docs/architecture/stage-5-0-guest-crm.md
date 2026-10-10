# Stage 5.0 — Guest ↔ CRM integration (development only)

## Routes
- `/guest` — mobile-responsive minimarket prototype
- `/crm` — dispatcher prototype
- Both use `/api/v1/service-orders` on the same PostgreSQL-backed server.
- `GET /api/v1/service-orders/:id` allows a guest to read only an order with matching `created_by`. Staff roles may read organization-scoped orders.

## Security boundaries
- The guest page's manual token field is for isolated developer testing only. It must be replaced with real OIDC login/session before deployment.
- Creating an order requires explicit `order:create` access for the property.
- Editing an order requires `order:manage` access and a dispatcher/admin role.
- The database application role must not bypass PostgreSQL RLS.
- Never make this development service publicly accessible with real guest information.

## Known gaps blocking release
- UI prices are illustrative and do not come from a server-managed catalog.
- The PostgreSQL order line's unit price is not populated. Server-side pricing and price snapshots must be implemented before payment.
- No booking-to-guest access grant automation or guest login flow.
- No real payment provider, refunds, notification worker, staff assignment, or deployment pipeline.
- No browser automation test yet; HTTP asset/API smoke tests are not a substitute.
- Existing guest pages are implementation prototypes inspired by the Canva design system, not a pixel-verified conversion of all approved Canva screens.

## Test gate
GitHub Actions must pass both Node unit tests and PostgreSQL HTTP integration tests after migration 0006. Check the exact commit run before promoting this branch.
