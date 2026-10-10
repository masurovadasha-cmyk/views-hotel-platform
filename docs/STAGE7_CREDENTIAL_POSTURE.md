# Stage 7.9 — Internal Service Credential Posture

Status: implementation candidate.

## Goal

Turn the Stage 7.7/7.8 signed-service migration into an observable release decision instead of removing the symmetric fallback based on configuration assumptions.

Stage 7.9 answers two separate questions:

1. Are all known trusted services actually using signed tokens, with no legacy symmetric-key traffic in the selected observation window?
2. Are the configured signing credentials inside their declared rotation SLO?

These stay separate: signed-only traffic gates symmetric fallback retirement; rotation posture gates safe operation of asymmetric credentials.

## Data source

The source of truth is the durable `internal_service_request_audit`.

Migration `0031_internal_service_credential_posture.sql` adds:

- `credential_id` (`kid`) for signed-token requests;
- an index over service / scheme / credential / time;
- audit begin function v3;
- a platform-admin-only aggregate function for posture queries.

Raw tokens, private keys and raw symmetric keys are never stored.

## Access boundary

API:

```
GET /v1/security/internal-service-posture?hours=24
```

The route still passes through the global trusted-service actor boundary. PostgreSQL additionally requires `platform_admin`. The observation window is bounded to 1 hour through 90 days.

## Migration readiness

For every known service the response reports signed request count, legacy request count, last signed request, last legacy request and per-service readiness.

A service is ready only when at least one signed request has been observed and zero legacy symmetric requests have been observed in the same window. Global readiness requires every known service to be ready.

Known services are the union of configured symmetric identities, configured signing-key identities and identities observed in the audit window. This prevents an unobserved configured service from disappearing from the decision.

## Signing credential metadata

Stage 7.9 extends each production public-key reference entry with `activatedAt` and `rotateBy` timestamps. Production requires both; Core validates that both timestamps are valid and that `rotateBy` is later than `activatedAt`.

Development/test may omit this metadata to preserve fixture and migration compatibility.

## Rotation posture

Each configured signing credential reports service ID, `kid`, activation time, rotate-by time, age in days, days until rotation, observed request count, first/last observed use, fingerprints and status.

Statuses:

- `healthy` — more than 14 days remain;
- `due_soon` — 14 days or less remain;
- `overdue` — rotate-by time has passed;
- `metadata_missing` — possible only outside the production-required metadata contract.

Machine-stable alerts:

- `LEGACY_INTERNAL_KEY_TRAFFIC`;
- `SIGNED_SERVICE_TRAFFIC_MISSING`;
- `SIGNED_CREDENTIAL_ROTATION_DUE_SOON`;
- `SIGNED_CREDENTIAL_ROTATION_OVERDUE`;
- `SIGNED_CREDENTIAL_ROTATION_METADATA_MISSING`.

## Release decision for symmetric-key retirement

Do not remove production symmetric service-key support solely because Stage 7.7 and 7.8 code exists.

Before switching production to signed-only authentication:

1. deploy signed Pages/BFF and analytics-cron credentials;
2. observe a representative traffic window;
3. query Stage 7.9 posture as platform admin;
4. require `migration.ready = true`;
5. confirm there are no `LEGACY_INTERNAL_KEY_TRAFFIC` alerts;
6. confirm every expected service has signed traffic;
7. investigate any unknown observed service identity;
8. verify signing credentials are not overdue;
9. only then enable a signed-only production gate.

If legacy traffic reappears, readiness becomes false for any window containing that request.

## Rotation procedure

1. Generate a replacement Ed25519 key pair.
2. Add its public key under a new `kid` with activation and rotate-by metadata.
3. Keep the previous public key temporarily; the service ring remains bounded to two keys.
4. Deploy Core.
5. Move the sender to the new private key and `kid`.
6. Verify posture shows traffic on the new credential.
7. Verify old-credential traffic has stopped for the agreed window.
8. Remove the old public key.
9. Destroy the old private key according to secret-store policy.

Never reuse a signing key pair across services or environments.

## Failure / rollback

Stage 7.9 is read/observe only for authentication decisions. It does not automatically remove credentials, rotate keys, disable services or mutate historical audit rows. If posture is unhealthy, keep the current authentication mode and investigate.

## Automated acceptance

Tests cover signed vs legacy aggregation, platform-admin-only access, bounded windows, signed-traffic readiness, legacy traffic blocking, rotation calculations, due-soon/overdue alerts, production-required metadata, signed audit `kid` persistence and migration `0031`.

## Next work

- Stage 7.10 signed-only production enforcement switch;
- deployment acceptance proving a representative signed-only traffic window;
- Core network ingress allowlists;
- mTLS evaluation when deployment topology supports it.
