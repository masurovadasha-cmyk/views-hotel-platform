# Stage 0 gap audit

## Reusable now
- Canva-derived Guest/Host/Staff/Admin UI
- typed domain workflow tests
- service-order concepts
- RBAC vocabulary
- audit/outbox concepts
- API client boundary
- CI and staging preview

## Must be replaced/extended for production
- D1/SQLite -> PostgreSQL 16
- Cloudflare Functions transport -> NestJS API
- demo/staging authentication -> production identity provider/session strategy
- frontend role filtering -> DB/API tenant + permission enforcement
- simplistic reservation model -> inventory/rate/availability/hold model
- monetary REAL/number -> bigint minor units
- no DB no-overbooking guarantee -> tstzrange + EXCLUDE
- no double-entry ledger -> journal/entries with balance validation
- no Redis jobs -> Redis + BullMQ
- no object-storage abstraction -> S3-compatible encrypted document storage
- no country plug-in boundary -> tax/compliance/fiscalization/payment adapters

## Migration strategy
Strangler migration inside one repository. New production modules live under apps/api. Existing staging remains available until each vertical slice has production parity and tests.
