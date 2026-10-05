# Stage 7.10 — Per-Service Signed-Only Enforcement

Status: implementation candidate.

## Goal

Turn the Stage 7.9 evidence into an explicit fail-closed authentication policy, one trusted service at a time.

Stage 7.10 introduces `VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON` with three modes:

- `internal_key_only` — only the managed symmetric service key is accepted;
- `dual` — signed token and managed symmetric service key are both accepted during migration;
- `signed_only` — only a signed Ed25519 service token is accepted.

Production requires an explicit mode for every configured trusted service. There is no implicit production downgrade.

## Credential requirements

`internal_key_only` requires a service-specific symmetric key.

`dual` requires both a service-specific symmetric key and at least one Ed25519 signing public key.

`signed_only` requires at least one Ed25519 signing public key and does not require any symmetric service secret.

Raw `VIEWS_INTERNAL_SERVICE_KEYS_JSON` remains forbidden in production. Symmetric credentials, when used, still come only from the Stage 7.6 managed references.

## Runtime enforcement

Core resolves the claimed `X-Views-Service-Id` to its configured auth mode before accepting a credential.

If a service is `signed_only`, a request carrying only `X-Views-Internal-Key` fails with `INTERNAL_SERVICE_SIGNED_TOKEN_REQUIRED` before business logic executes.

If a service is `internal_key_only`, a request carrying `X-Views-Service-Token` is rejected.

If a token header is present in any token-capable mode, an invalid token never falls back to a valid symmetric key.

The same auth-mode map is used by the global actor guard, global audit interceptor, Dashboard defense-in-depth check and analytics report-cycle defense-in-depth check.

## Telemetry

Migration `0032_signed_only_auth_mode.sql` adds the fixed rejection reason:

`signed_token_required`

This distinguishes an old sender that still uses a symmetric credential from a generic invalid-key attack or configuration error.

## Production rollout

Do not switch a service to `signed_only` merely because signed-token code exists.

Recommended sequence:

1. Keep the service in `dual` while deploying the signed sender.
2. Use Stage 7.9 over an agreed representative window.
3. Require signed traffic to be present and legacy traffic to be zero.
4. Set that one service to `signed_only` while temporarily retaining its symmetric secret for rapid config rollback.
5. Verify normal traffic and zero `signed_token_required` rejections.
6. Remove that service's symmetric key reference and secret.
7. Repeat for the next trusted service.

Pages/BFF and analytics-cron can therefore move independently.

## Rollback

If a signed-only rollout exposes a sender problem:

1. restore the symmetric secret/reference if it was already removed;
2. change the affected service to `dual` or `internal_key_only`;
3. redeploy Core;
4. investigate signed-token telemetry and sender configuration;
5. return to `signed_only` only after Stage 7.9 is clean again.

Rollback is per service; another healthy signed-only service does not need to be downgraded.

## Configuration validation

Core fails startup when:

- production has no explicit auth-mode map;
- a mode is not one of the three allowed values;
- a configured credential service is missing from the production mode map;
- `internal_key_only` lacks a symmetric credential;
- `dual` lacks either credential type;
- `signed_only` lacks a signing public key;
- raw production service-key JSON is supplied.

## Automated acceptance

Tests cover mode parsing, production completeness, mode-specific credential requirements, signed-only operation without symmetric secrets, dual mode, verifier enforcement, no token downgrade, and the signed-only rejection telemetry migration.

## Next work

- remote staging rollout using `dual` first;
- collect Stage 7.9 evidence for both known callers;
- switch each service independently to `signed_only`;
- remove dormant symmetric service secrets after the observation gate;
- add Core network ingress restrictions;
- evaluate mTLS for supported deployment environments.
