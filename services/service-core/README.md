# VIEWS Service Core — demo API
Run with Node.js 20+: `npm test` and `npm start` from this directory.
Endpoints: GET /health, GET /api/v1/catalog, POST /api/v1/service-orders, GET /api/v1/service-orders/:id.
POST requires an Idempotency-Key header and JSON `{"items":[{"sku":"WATER-15","quantity":2}]}`.
**Not production-ready:** in-memory storage, no authentication, no database, no real payments, no stock transactions. Do not expose publicly or use with real guest information. This is a developer-only prototype to validate request and domain shape.
