# Stage 7.6 — Managed Internal Service Secret References

Status: implementation candidate.

## Goal

Keep raw trusted-service credentials out of one shared JSON configuration value and make the
Core runtime compatible with deployment-managed secret injection.

Stage 7.5 binds each trusted service identity to its own key ring. Stage 7.6 keeps that runtime
contract but changes the production configuration boundary:

- service IDs are mapped to environment variable **references**;
- the referenced variables contain the actual secrets;
- a deployment secret manager is responsible for injecting those variables;
- Core resolves the references at startup and fails closed on any inconsistency.

No external secret-manager product is faked or claimed connected by this stage.

## Production configuration

Production requires:

`VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON`

Example non-secret mapping:

```json
{
  "pages-bff": [
    "VIEWS_INTERNAL_PAGES_BFF_KEY_CURRENT"
  ],
  "analytics-cron": [
    "VIEWS_INTERNAL_ANALYTICS_CRON_KEY_CURRENT"
  ]
}
```

The referenced variables are injected as secrets:

- `VIEWS_INTERNAL_PAGES_BFF_KEY_CURRENT`
- `VIEWS_INTERNAL_ANALYTICS_CRON_KEY_CURRENT`

The mapping may be committed as deployment configuration because it contains reference names,
not raw key material. The referenced values must remain in the deployment secret store.

## Rotation

For zero-downtime rotation of one service:

1. create a new secret in the deployment secret manager;
2. inject both the new and previous secret variables;
3. configure that service's reference ring as `[current, previous]`;
4. deploy Core;
5. deploy the sender with the new current secret;
6. use Stage 7.3 key-fingerprint audit to verify old-key traffic has stopped;
7. remove the previous reference and previous secret.

A service ring resolves to at most two accepted keys.

## Fail-closed rules

Core refuses startup when:

- production has no managed reference map;
- the reference JSON is malformed or not an object;
- a service ID is invalid;
- a ring contains zero or more than two references;
- a reference name is not a valid uppercase environment variable name;
- a referenced variable is missing;
- a referenced secret is shorter than 32 characters;
- the same reference is assigned to two different services;
- different references resolve to the same raw key across services;
- both managed references and raw service-key JSON are configured simultaneously.

These checks happen before trusted traffic is served.

## Migration compatibility

`VIEWS_INTERNAL_SERVICE_KEYS_JSON` remains available only as a development/test migration
fallback. Production requires the reference-based boundary.

The Stage 7.2 legacy Core-wide ring remains available for development/test compatibility when no
service-specific map exists.

Stage 7.6 itself keeps the existing caller protocol. Stage 7.7 then adds short-lived signed service
tokens as the preferred path for migrated callers while retaining these service-specific symmetric
references as the rollback/migration fallback.

## Secret-store boundary

This stage deliberately does not couple VIEWS to AWS Secrets Manager, GCP Secret Manager,
Azure Key Vault, HashiCorp Vault, Cloudflare Secrets, or another vendor.

The deployment layer injects secret values into process environment variables. Core consumes only
the references declared in `VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON`.

That keeps the application portable while allowing each deployment platform to use its native
managed secret store.

## Automated acceptance

Tests cover:

- production requiring the managed reference map;
- production resolving pages-bff and analytics-cron independently;
- production rejecting raw service-key JSON as a replacement;
- raw/reference ambiguity rejection;
- malformed reference maps;
- invalid reference names;
- missing referenced secrets;
- weak referenced secrets;
- cross-service reference reuse;
- cross-service raw-key reuse through different references;
- repeated reference deduplication within one service;
- dev/test raw-map and legacy-ring compatibility.

## Next work

- short-lived signed service identity tokens (implemented as the Stage 7.7 candidate);
- retire the symmetric production requirement after every trusted sender migrates;
- key age / rotation SLO alerts;
- network ingress allowlists;
- mTLS when the deployment infrastructure supports it.
