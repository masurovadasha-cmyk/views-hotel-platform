# Stage 7.7 — Short-Lived Signed Service Identity Tokens

Status: implementation candidate.

## Goal

Replace long-lived symmetric service credentials on trusted server-to-server calls with short-lived,
request-bound Ed25519 service identity tokens while preserving a safe migration path for existing
senders.

Stage 7.7 does not remove the Stage 7.6 symmetric service-key ring yet. It adds the stronger
credential path, makes Pages/BFF prefer it, and prevents downgrade when a token header is present.

## Trust model

For each trusted service:

- the sender owns an Ed25519 private key;
- Core stores only the corresponding Ed25519 public key;
- the sender mints a new token for each Core request;
- Core verifies the signature and request binding;
- PostgreSQL consumes the token `jti` before controller execution;
- the same token cannot start a second audited request.

A compromised Core public-key configuration does not reveal a signing private key.

## Token transport

Sender headers:

- `X-Views-Service-Id`
- `X-Views-Service-Token`
- `X-Request-Id`

Actor-forwarding requests continue to include:

- `X-Organization-Id`
- `X-User-Id`
- `X-Membership-Id`

During migration, a caller may still use `X-Views-Internal-Key` when it does not send a service
token.

If `X-Views-Service-Token` is present, Core validates that token and does not fall back to a valid
legacy API key.

## Compact token profile

The token uses JWS compact serialization with a deliberately narrow profile.

Protected header:

```json
{
  "alg": "EdDSA",
  "typ": "views-service+jwt",
  "kid": "pages-bff-2026-10"
}
```

Claims:

```json
{
  "iss": "pages-bff",
  "sub": "pages-bff",
  "aud": "views-core",
  "iat": 1800000000,
  "exp": 1800000030,
  "jti": "uuid-v4",
  "htm": "GET",
  "htp": "/v1/analytics/dashboard/summary",
  "rid": "request-id"
}
```

Validation is mutually specific to this profile:

- `alg` must be exactly `EdDSA`;
- `typ` must be exactly `views-service+jwt`;
- `kid` must match a configured key for the claimed service;
- the key must be Ed25519;
- `iss` and `sub` must both equal `X-Views-Service-Id`;
- `aud` must be exactly `views-core`;
- `htm` must equal the HTTP method;
- `htp` must equal the request pathname;
- `rid` must equal `X-Request-Id`;
- `jti` must be a UUID v4;
- token TTL must not exceed 60 seconds;
- Pages/BFF currently mints tokens with a 30-second TTL;
- Core permits only a 5-second clock skew.

The signature is verified before claims are trusted or classified.

## Request binding

Tokens are not general bearer credentials.

A token minted for:

```
GET /v1/analytics/dashboard/summary
```

cannot be used for:

```
POST /v1/internal/analytics/report-cycle
```

or for another request ID.

Query strings are not signed. The pathname, method and request ID are signed.

Authorization remains separate:

- signed service identity proves which trusted service sent the request;
- actor UUID validation, active membership, RBAC and PostgreSQL RLS continue to decide what the
  forwarded actor may do.

## Replay protection

Migration `0030_signed_service_tokens.sql` extends the durable internal-service audit.

Signed requests store:

- `auth_scheme = signed_token`;
- the token `jti`;
- service ID;
- public-key fingerprint;
- normalized request metadata.

A partial unique index on:

```
(service_id, token_jti)
```

rejects a second use of the same signed token.

The audit row is started before controller execution. A duplicate `jti` is mapped to:

```
INTERNAL_SERVICE_TOKEN_REPLAY
```

and the request is rejected before business logic runs.

Replay attempts are counted under the fixed telemetry reason:

```
service_token_replay
```

No raw token is persisted.

## Core public-key configuration

Core accepts an optional signing public-key reference map:

```
VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
```

Example:

```json
{
  "pages-bff": [
    {
      "kid": "pages-bff-2026-10",
      "ref": "VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY"
    }
  ]
}
```

The referenced variable contains an Ed25519 SPKI public key PEM.

Core fails closed when:

- service ID is malformed;
- a ring contains zero or more than two public keys;
- `kid` or reference name is malformed;
- a referenced key is missing;
- a referenced key is not parseable;
- a referenced key is not Ed25519;
- one reference is assigned to two service identities;
- two different references resolve to the same public key across services.

Two keys per service support zero-downtime signing-key rotation.

## Pages/BFF private-key configuration

Preferred sender configuration:

```
VIEWS_CORE_SIGNING_KID=pages-bff-2026-10
VIEWS_CORE_SIGNING_PRIVATE_KEY=<PKCS8 Ed25519 private PEM secret>
```

The private key belongs in the deployment secret manager.

When both signing variables are present, Pages/BFF:

1. creates a fresh 30-second token;
2. binds it to the Core method/path/request ID;
3. sends `X-Views-Service-Token`;
4. does not send `X-Views-Internal-Key`.

If the signing pair is absent, the existing `VIEWS_CORE_API_KEY` remains the migration fallback.

A partial signing configuration fails closed.

## Rotation

Recommended signing-key rotation:

1. generate a new Ed25519 key pair;
2. add the new public key to Core under a new `kid`, keeping the old public key;
3. deploy Core with both public keys accepted for that service;
4. replace the sender private key and `kid`;
5. verify Stage 7.3 audit traffic uses the new public-key fingerprint;
6. remove the old public key from Core;
7. destroy the old private key according to the deployment secret-store policy.

Do not reuse one key pair for different service IDs or environments.

## Telemetry and redaction

The redacting logger explicitly masks:

- `x-views-internal-key`;
- `x-views-service-token`;
- `VIEWS_CORE_SIGNING_PRIVATE_KEY`;
- generic private-key object fields.

The durable audit stores only a SHA-256 public-key fingerprint truncated to the existing 32-hex
credential fingerprint field.

The raw signed token and private key are never persisted by the Stage 7.7 audit path.

## Migration compatibility

Stage 7.7 is intentionally additive.

Production still requires the Stage 7.6 service-specific symmetric secret-reference map during the
migration window.

This allows:

- Pages/BFF to move to signed tokens first;
- analytics-cron or another trusted sender to migrate independently;
- emergency rollback to the service-specific symmetric credential path when no token header is
  present.

Once every trusted service uses signed tokens and operational evidence is clean, a later stage can
remove the production requirement for long-lived symmetric service keys.

## Automated acceptance

The Stage 7.7 test surface covers:

- Ed25519 signature verification;
- algorithm and explicit-type rejection;
- service/issuer/audience mismatch;
- method/path/request-ID binding;
- expiration, future-issued and overlong tokens;
- unknown `kid`;
- non-Ed25519 public key rejection;
- tampered signatures;
- public-key reference configuration;
- cross-service public-key reuse rejection;
- sender-side WebCrypto token generation;
- signed-mode Pages/BFF preference over the legacy key;
- no-downgrade behavior when an invalid token and valid key are both supplied;
- durable `jti` replay rejection;
- signed-token credential redaction;
- legacy key-path compatibility.

## Standards / implementation notes

The token profile follows the JWT/JWS security principles used by RFC 8725:

- explicit algorithm allowlisting;
- issuer and audience validation;
- explicit token typing;
- mutually specific validation rules for this token class.

Node Core uses the built-in Ed25519 sign/verify support.
Cloudflare Pages Functions uses the Workers Web Crypto Ed25519 implementation.

No third-party JWT library or remote JWKS fetch is introduced in this stage.

## Next work

- migrate analytics-cron to signed tokens;
- add signing-key age / rotation SLO alerts;
- retire the production symmetric service-key requirement after all senders migrate;
- add network ingress allowlists;
- evaluate mTLS when the deployment topology supports it.
