# PostgreSQL-backed API (development-only)
Run migrations 0001..0003 against PostgreSQL 15+ using a migration role.
Use a separate application DB role without BYPASSRLS or table ownership.
Install dependencies: `npm install`.
Start the DB-backed service: `npm run start:db`.
The existing `npm start` remains an isolated in-memory demo.

The DB service uses signed development context tokens and currently restricts reads to dispatcher/admin. It does not yet validate guest booking ownership or property authorization, so do not expose it publicly or use real guest data.
POST /api/v1/service-orders requires Authorization: Bearer <signed-context>, Idempotency-Key, and JSON with propertyId (UUID) and items [{sku,quantity}]. Catalog pricing and payments are not implemented. No customer-facing charge should be attempted.
