# VIEWS Market — transaction permission gate (Stage 7)

The internal Staff command controllers are registered, but **are not production-ready**. The API runtime's restricted PostgreSQL role cannot INSERT/UPDATE the market tables under current FORCE RLS policies. This is deliberate and must not be worked around by using the database owner, BYPASSRLS, disabling RLS, or placing admin credentials in Pages/Android.

## Required secure implementation
1. Confirm deployed identity schema, staff role codes, and property-scope semantics against migration fixtures.
2. Introduce narrowly scoped write permissions or a reviewed SECURITY DEFINER command boundary that verifies signed actor context, membership status, property scope, order ownership, expected version, and command type. Revoke PUBLIC execution and avoid trusting client-provided actor IDs.
3. Enforce organization/property consistency for assignments and stock rows. Validate that assignee membership belongs to the same organization and is authorized for the target property.
4. Execute assignment/status + stock movements + audit + idempotency in one transaction. An authorization failure must roll back all effects.
5. Test with the **actual restricted API runtime database role** (not just CI admin), including cross-tenant writes, replay, version conflicts, insufficient stock, and two concurrent terminal commands.
6. Keep the BFF write proxy and Staff CRM action buttons disabled until those tests pass.

## Current state
The V-Market demo uses localStorage; server read-only endpoints exist; write controllers are wired but database write access is intentionally denied. No public web/APK release or real payment integration is justified by passing TypeScript/unit CI alone.
