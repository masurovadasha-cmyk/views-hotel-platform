# Stage 7.1 — Core Actor Gateway Boundary

Status: implementation candidate.

## Problem

The Core Nest API uses trusted actor context headers:

- `X-Organization-Id`
- `X-User-Id`
- `X-Membership-Id`

Those headers select PostgreSQL tenant/user/membership context and therefore must never be trusted
from an arbitrary public client.

Stage 6.9 introduced a server-side Pages BFF for Dashboard reads and an internal shared secret.
Stage 7.1 generalizes that trust boundary across the whole Core HTTP API.

## Global guard

`InternalActorAuthGuard` is registered through Nest `APP_GUARD`.

For every HTTP request:

1. if none of the three actor headers are present, the guard does nothing;
2. if any actor header is present, all three actor headers are required;
3. the request must also contain `X-Views-Internal-Key`;
4. the key is compared through the existing constant-time hash comparison;
5. only then may controller-level actor UUID parsing and RBAC/RLS logic run.

## Why header-presence based

This preserves independent public authentication boundaries.

Routes that do not use Core actor headers continue to use their own security mechanism, including:

- payment provider webhooks -> provider signature verification;
- guest auth exchange -> one-time exchange token;
- guest self-service -> reservation-scoped Bearer token;
- health/readiness style endpoints -> no actor context;
- internal worker routes -> their own internal-key controller check.

A public route that accidentally receives actor headers without the internal key fails closed.

## Staff / trusted-service requests

Any BFF or trusted service forwarding Core actor context must send:

- `X-Views-Internal-Key`
- `X-Views-Service-Id`
- `X-Organization-Id`
- `X-User-Id`
- `X-Membership-Id`
- optional `X-Request-Id`

The internal key is server-side only.

It must never be exposed through:

- browser JavaScript;
- Vite public env;
- URLs/query strings;
- response bodies;
- telemetry/logs.

## Production config

Stage 7.1 originally used one global `VIEWS_INTERNAL_API_KEY`. The runtime trust boundary has since
evolved without changing the actor-header contract:

- Stage 7.5 binds `X-Views-Service-Id` to a service-specific key ring;
- Stage 7.6 requires production service rings to be resolved from
  `VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON`;
- the referenced environment variables are injected by the deployment secret manager;
- the legacy global key ring remains development/test migration compatibility only.

The Pages BFF continues using its own server-side `VIEWS_CORE_API_KEY`, which must match the
current secret resolved for the `pages-bff` service identity.

## Defense in depth

The existing Dashboard controller keeps its explicit internal-key check.

The global guard is the broad boundary for all actor-header routes.

Controller/service/database controls still remain necessary:

- UUID validation;
- active membership role;
- property scope;
- PostgreSQL RLS;
- operation-specific permissions;
- idempotency;
- audit.

The internal key proves the actor headers came through a trusted server path. It does not grant a role
by itself.

## Telemetry

The redacting logger now treats:

- `x-views-internal-key`

as a sensitive object key.

Even if a future code path logs a headers object, the key value is replaced with `[REDACTED]`.

## Fail-closed behavior

Rejected cases:

- only one/two actor headers present;
- actor triplet present without internal key;
- mismatched internal key;
- duplicated internal-key header that cannot be represented as one trusted value.

Expected response at HTTP boundary:

- 401 Unauthorized.

## Automated acceptance

Tests verify:

- request with no actor context passes the global boundary;
- internal-only request with no actor context is left for its controller-specific key check;
- partial actor triplet is rejected;
- actor context without key is rejected;
- wrong key is rejected;
- correct key + complete actor triplet passes;
- duplicated security header is rejected;
- telemetry redacts the internal key;
- root/API typecheck/tests/build remain green.

## Deployment impact

Before exposing the Core API on a network reachable outside the trusted BFF/service layer:

- configure `VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON` and inject every referenced secret;
- ensure every server-side actor-context caller sends its own `X-Views-Service-Id` and matching key;
- do not permit browser code to call Core staff endpoints directly;
- keep provider webhook routes reachable only as required by providers;
- prefer network-level restrictions in addition to this application-layer boundary.

## Next work

- route/network policy documentation for Core ingress;
- service-to-service key rotation strategy;
- optional signed service identity/JWT or mTLS upgrade;
- centralized request audit for trusted-service actor calls (implemented in Stage 7.3);
- provider webhook rate/replay hardening where provider contracts allow it.
