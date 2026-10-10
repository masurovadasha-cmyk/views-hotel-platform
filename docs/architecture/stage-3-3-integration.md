# Stage 3.3 — integration gates

## Current status
The HTTP demo server uses process memory and is bound to localhost. PostgreSQL transaction helpers and the RLS migration are separate modules; **they are not wired into the demo server**. No production deployment or payment processing is authorized.

## Authentication
The experimental signed-context verifier in src/auth.mjs is a testable building block only, not a production identity service. Use OIDC with JWKS, issuer/audience validation, expiry and key rotation for deployment. Derive organization_id and roles from verified identity, not from client JSON.

## Critical checks before connecting the DB
1. Run migration 0001, 0002 and 0003 on an isolated PostgreSQL 15+ instance.
2. Use a DB application role without table ownership or BYPASSRLS.
3. Test tenant isolation on reads, updates and inserts.
4. Check two concurrent orders competing for the same lot; exactly one may reserve when stock is insufficient.
5. Persist request fingerprints and verify identical retries return one order, changed payload yields 409.
6. Add server-side price snapshots and item totals before charging or presenting final payable amounts.
7. Persist order state transitions, actor identity and outbox events in the same transaction.
8. Add reservation release/consume paths and tests for cancellations and completed deliveries.
9. Restrict dispatcher status updates with server-side RBAC and audit logging.
10. Test payment webhooks, refunds and reconciliation separately using provider sandbox credentials.

## Canva implementation
The 60-page Canva working copy is a visual reference, not an executable UI. Map each approved screen to reusable frontend components and API contracts. Do not publish a production service until these gates pass.
