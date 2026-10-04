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
