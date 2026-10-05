# Stage 7.5 — Service-Specific Internal Key Binding

Status: implementation candidate.

## Goal

Prevent one trusted service from impersonating another service identity.

Before Stage 7.5, Core verified all trusted services against one accepted global key ring. A caller
holding that shared key could authenticate and claim another valid `X-Views-Service-Id`.

Stage 7.5 binds each service ID to its own accepted key ring.

## Production configuration

Required in production:

`VIEWS_INTERNAL_SERVICE_KEYS_JSON`

Example:

```json
{
  "pages-bff": [
    "<pages-current-key>"
  ],
  "analytics-cron": [
    "<cron-current-key>"
  ]
}
```

During rotation one service may temporarily accept two keys:

```json
{
  "pages-bff": [
    "<pages-new-key>",
    "<pages-old-key>"
  ],
  "analytics-cron": [
    "<cron-current-key>"
  ]
}
```

Each key must be at least 32 characters.

A service ring contains one or two keys.

## Key uniqueness

The same raw key cannot appear under two different service IDs.

Configuration fails closed when a key is shared across services.

This is the property that prevents cross-service impersonation.

## Runtime verification

For a request containing:

- `X-Views-Service-Id: pages-bff`
- `X-Views-Internal-Key: ...`

Core:

1. validates the service ID syntax;
2. loads only the `pages-bff` ring;
3. constant-time compares the presented key against every key in that ring;
4. accepts only if one ring key matches;
5. never falls back to another service's ring.

An unknown service ID is rejected with the internal service-not-configured boundary.

## Legacy compatibility

The existing variables remain available:

- `VIEWS_INTERNAL_API_KEY`
- `VIEWS_INTERNAL_API_KEY_PREVIOUS`

They are used only when no service-specific map exists.

This preserves development/test and staged migration compatibility.

Production now requires a non-empty service-specific map.

When the map exists, the legacy ring is not used for trusted-service verification.

## Pages BFF

Pages continues sending:

- `X-Views-Service-Id: pages-bff`
- its server-side `VIEWS_CORE_API_KEY`

That sender key must exist in Core under:

- `pages-bff`

It must not be reused by `analytics-cron` or another service.

## Analytics Cron

Cron/orchestrator calls use:

- `X-Views-Service-Id: analytics-cron`
- a separate analytics-cron key

The pages-bff key must fail when presented as analytics-cron and vice versa.

## Per-service zero-downtime rotation

For one service:

1. Core ring becomes `[new, old]`.
2. Deploy sender with `new`.
3. Use Stage 7.3 audit key fingerprints to verify old-key traffic has stopped.
4. Core ring becomes `[new]`.

Other service rings do not change.

This is safer than rotating one global secret shared by unrelated callers.

## Defense in depth

Service-bound verification is used by:

- global actor gateway;
- global trusted-service audit interceptor;
- Dashboard controller explicit internal-auth check;
- internal analytics/report-cycle controller explicit internal-auth check.

The Stage 7.4 rejection telemetry records wrong-service/wrong-key attempts as fixed rejection reasons.

## Configuration validation

Core rejects:

- invalid JSON;
- non-object JSON;
- invalid service IDs;
- rings with zero or more than two entries;
- keys shorter than 32 characters;
- one key assigned to two service IDs.

Repeated identical keys inside one service ring are deduplicated.

## Automated acceptance

Tests verify:

- production refuses to start without service-specific key config;
- production can run service-specific auth without a legacy global key;
- pages-bff current and previous keys are accepted for pages-bff;
- pages-bff key is rejected as analytics-cron;
- analytics-cron key is rejected as pages-bff;
- unknown service ID is rejected;
- legacy global key is not accepted when service rings exist;
- cross-service duplicate key configuration is rejected;
- per-service duplicate key is deduplicated;
- legacy dev/test verification remains compatible;
- root/API typecheck/tests/build remain green.

## Next work

- move individual service secrets to managed secret-store references;
- short-lived signed service identity tokens;
- key age / rotation SLO alerts;
- network ingress allowlists;
- mTLS when deployment infrastructure supports it.
