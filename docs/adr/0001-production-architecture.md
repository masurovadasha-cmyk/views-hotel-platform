# ADR 0001 — VIEWS production architecture

Status: Accepted

## Decision
VIEWS production backend is a NestJS modular monolith backed by PostgreSQL 16. Existing Cloudflare/D1 code remains a staging prototype during migration and is not the production source of truth.

## Core boundaries
identity-access, organizations, properties, inventory, availability, rates, reservations, stays, guests, folio, payments, ledger, taxes, compliance, services, housekeeping, maintenance, messaging, marketplace, payouts, reviews, loyalty, integrations, notifications, analytics, audit.

## Rules
- PostgreSQL is transactional source of truth.
- Tenant scope is organization_id; RLS is defense in depth.
- Money uses bigint minor units + ISO currency.
- Availability conflicts are prevented by a PostgreSQL exclusion constraint, not only application checks.
- Domain events are written transactionally to outbox_events.
- External providers are adapters; country rules are plug-ins.
- Existing Canva UI is preserved and migrated incrementally to production APIs.
