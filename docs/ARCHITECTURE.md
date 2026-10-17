# VIEWS architecture

Standalone modular monolith designed to scale from tens to thousands of units.

## Bounded contexts
Identity & Access, Inventory/Properties, Reservations & Stays, Guest CRM, Service Orders, Housekeeping, Maintenance, Payments/Ledger, Notifications, Analytics.

## Cross-cutting rules
- Multi-tenant / multi-property
- API-first
- RBAC and property scope enforced server-side
- Audit log
- Transactional outbox/domain events
- Idempotency keys
- Optimistic versioning
- Stateless horizontally scalable application layer
- Object storage for files/proof
- Structured logging + health/readiness

## Service Order Engine
Guest + apartment + reservation/stay + service + employee + SLA + timeline + revenue.

## Workflow contracts
Housekeeping: occupied → checkout_due → dirty → cleaning → inspection → ready, plus DND/service-declined.

Maintenance: open/reported → assigned/in_progress → waiting/blocked → resolved → inspection/verified → closed.

Guest request: new → accepted → assigned → in_progress → fulfilled/completed/rejected/cancelled.

## Implemented baseline and delivery boundary (2026-10-12)
PostgreSQL is the operational source of truth; NestJS/TypeScript Core serves the
shared React web/Android client through scoped gateways. The current Android
preview uses a WebView wrapper; Flutter/React Native and a full Next.js guest
frontend are not claimed as implemented. See PROGRESS.md for verified status.

Public static preview and local operational Core are separate deployment modes.
A published image/viewer or successful build does not enable Core integrations.
New work preserves server permissions, RLS, audit, outbox, idempotency and
migration compatibility. Shared schemas/contracts should drive generated types
where an authoritative generation source exists; broad codegen migration is
separate work. Sensitive identifiers stay masked/tokenized at application
boundaries, with encrypted protected storage and no sensitive logging.

## Proposed M0 target (awaiting owner approval)
The pnpm/Turborepo, Next.js, Expo, generated-contract and migration-location
plan is specified in [DECISIONS.md](DECISIONS.md). This target does not describe
the current filesystem. Milestone acceptance and the explicit pre-code approval
pause are tracked in [PROGRESS.md](PROGRESS.md).
