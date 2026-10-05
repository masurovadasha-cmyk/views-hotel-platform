# Stage 7.8 — Signed Analytics Cron Sender

Status: implementation candidate.

## Goal

Migrate the second known trusted Core caller, `analytics-cron`, to the Stage 7.7 short-lived
Ed25519 service-token boundary.

This stage provides a scheduler-ready Node runner. It does **not** claim that a particular external
cron provider is connected or deployed.

## Runner

Command:

```bash
npm run analytics:report-cycle
```

The runner calls:

```
POST /v1/internal/analytics/report-cycle
```

with:

- `X-Views-Service-Id: analytics-cron`;
- a fresh `X-Views-Service-Token`;
- a fresh `X-Request-Id`;
- JSON cycle limits.

It never sends `X-Views-Internal-Key`.

## Sender configuration

Required:

```
VIEWS_CORE_API_URL=https://core.example
VIEWS_ANALYTICS_CRON_SIGNING_KID=analytics-cron-2026-10
VIEWS_ANALYTICS_CRON_SIGNING_PRIVATE_KEY=<Ed25519 PKCS8 private PEM>
```

In production the Core URL must be HTTPS.

Optional bounded limits:

```
VIEWS_ANALYTICS_CRON_SCHEDULE_LIMIT=20
VIEWS_ANALYTICS_CRON_REPORT_LIMIT=20
VIEWS_ANALYTICS_CRON_PRUNE_LIMIT=1000
```

Accepted ranges match the Core controller:

- schedule: 1..100;
- report jobs: 1..100;
- retention prune: 1..10000.

Invalid limits fail before a network request is made.

## Token profile

The runner uses the Stage 7.7 profile:

- `alg=EdDSA`;
- `typ=views-service+jwt`;
- `iss=sub=analytics-cron`;
- `aud=views-core`;
- 30-second TTL;
- fresh UUIDv4 `jti`;
- `htm=POST`;
- `htp=/v1/internal/analytics/report-cycle`;
- `rid=X-Request-Id`.

The Core endpoint verifies the same request binding and the global audit interceptor consumes the
`jti` before controller execution.

## Core public key

Core must include the corresponding analytics-cron public key in:

`VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON`.

Example:

```json
{
  "analytics-cron": [
    {
      "kid": "analytics-cron-2026-10",
      "ref": "VIEWS_INTERNAL_ANALYTICS_CRON_PUBLIC_KEY"
    }
  ]
}
```

The referenced value is an Ed25519 SPKI public key PEM.

The private key belongs only to the runner/scheduler secret store.

## Failure behavior

The runner fails closed on:

- invalid Core URL;
- non-HTTPS production URL;
- missing or invalid `kid`;
- missing, malformed or non-Ed25519 private key;
- invalid cycle limits;
- network failure;
- non-2xx Core response;
- non-JSON success response.

Upstream response bodies are not echoed.

Only an uppercase machine error code is propagated when Core returns one. Arbitrary HTML, debug
text, stack traces or provider details are collapsed to `ANALYTICS_CRON_CORE_ERROR`.

The signing private key and raw service token are never written to the runner output.

## Scheduling boundary

This stage intentionally does not select or pretend to connect an external scheduler.

A deployment may invoke the runner from:

- platform-native cron;
- a CI scheduler;
- Kubernetes CronJob;
- another approved scheduler.

Whichever scheduler is selected must inject the private key as a secret and run only one or a safely
concurrent number of cycles according to the existing database lease semantics.

The Stage 6 report scheduler and worker leases remain the concurrency/idempotency source of truth.

## Automated acceptance

Tests verify:

- Ed25519-only private key loading;
- HTTPS enforcement in production;
- strict analytics-cron service-token claims;
- signature validity;
- signed-token headers and absence of a symmetric internal key;
- bounded cycle inputs;
- normalized upstream errors;
- network-error normalization without secret leakage.

## Migration consequence

With Stage 7.7 Pages/BFF and Stage 7.8 analytics-cron migrated, both known trusted service callers
have a signed-token implementation path.

Production symmetric service keys remain configured only for staged rollback compatibility until
release evidence confirms every deployed sender is using signed tokens.

## Next work

- record/alert credential age and rotation SLO;
- add deployment acceptance proving no symmetric-key traffic remains;
- remove the production symmetric service-key requirement after that acceptance gate;
- add network ingress allowlists;
- evaluate mTLS for supported deployment environments.
