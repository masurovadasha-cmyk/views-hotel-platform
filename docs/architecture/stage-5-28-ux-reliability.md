# Stage 5.28 — Checkout and staff UX reliability

## Implemented
- Guest market checkout now separates order creation from subsequent order-status refresh. If creation succeeds but status retrieval fails, the order remains recorded in the UI and checkout stays locked, avoiding accidental duplicate orders.
- While an order creation result is uncertain, the cart, booking selection and catalog reload are locked. Retry sends the same idempotency key and original booking/item payload.
- Product quantity controls have descriptive accessible names.
- Cleaning staff checklists stay open as items are confirmed, and the completion action appears when all required items are confirmed.
- Chromium smoke tests cover both checkout error scenarios and the cleaning checklist progression, in addition to prior mobile and desktop checks.

## Release boundaries
- Tests use a mock API for browser flows, not live provider payment services.
- Server-side idempotency, tenant isolation, stock reservation and task permissions are separately covered by PostgreSQL integration tests.
- There is still no production OIDC browser login, public HTTPS deployment, real card payment, completed Canva visual approval or verified physical Android-device test.
- Do not publish development token entry pages to a public origin.
