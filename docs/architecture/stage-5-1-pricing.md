# Stage 5.1 — server-owned market pricing

- `market_catalog` is scoped by `organization_id` and protected by PostgreSQL RLS.
- `GET /api/v1/market/catalog` requires a verified token and returns active tenant products.
- `POST /api/v1/service-orders` looks up active SKU prices in the same transaction that creates the order, reserves inventory, and records outbox events.
- Each `service_order_items.unit_price_uzs` and `service_orders.total_uzs` is a snapshot. Future catalog updates do not modify historical orders.
- The 15,000 UZS delivery fee is a **development-only assumption**, not a configured or approved business tariff.
- The guest UI shows an estimate; the server-calculated amount is authoritative.
- No real payments may be initiated. Taxes, promotions, price validity, inventory sellability, refunds and guest booking ownership need review before release.
- The development token field is not a login system. Replace with OIDC and proper session management.
- CI applies migration 0007 and tests catalog lookups, stored totals, tenant isolation and immutable price snapshots.

Next: price versioning and merchant settings, booking-linked permissions, payment sandbox, and UI parity review against approved Canva screens.
