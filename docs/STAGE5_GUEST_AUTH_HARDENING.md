# Stage 5.3 — Guest Auth Abuse & Telemetry Hardening

Status: implementation candidate.

## Goal

Harden the public guest-auth boundary against brute force, replay and accidental secret/PII leakage
without introducing per-process state that breaks horizontal scaling.

## Distributed rate limits

Rate-limit state lives in PostgreSQL through:

- `app.security_rate_limit_counters`
- `app.consume_security_rate_limit(...)`
- `app.prune_security_rate_limits(...)`

The counter update is atomic and shared by all stateless API instances.

Current guest-auth policy:

- challenge creation: 5 requests / 15 minutes per organization + reservation + channel;
- exchange network budget: 60 requests / 5 minutes per pseudonymous client-network key;
- exchange token budget: 6 requests / 5 minutes per exchange-token hash.

A rejected request returns HTTP 429 with a retry-after value in the response payload.

## Client network privacy

Raw client IP addresses are not persisted in the rate-limit table.

The API derives:

`HMAC-SHA256(GUEST_AUTH_RATE_LIMIT_SECRET, client_ip)`

and stores only the 64-character HMAC key.

`TRUSTED_PROXY_MODE` is explicit:

- `direct`: use the socket remote address;
- `cloudflare`: use `CF-Connecting-IP`.

In Cloudflare mode, absence of the trusted header fails closed. The API does not fall back to
user-controlled forwarded headers.

## Production configuration

Required in production:

- `GUEST_AUTH_RATE_LIMIT_SECRET` — at least 32 characters;
- `TRUSTED_PROXY_MODE=cloudflare` when the API is reachable only through the trusted Cloudflare edge.

Production startup fails when the rate-limit HMAC secret is missing.

## Telemetry redaction

NestJS uses `RedactingLogger` at bootstrap.

The redaction boundary removes or masks:

- authorization;
- cookies;
- token/accessToken/exchangeToken fields;
- password/secret fields;
- guest token-shaped `vge_` / `vga_` strings;
- email addresses;
- E.164-like phone numbers.

Provider delivery errors are normalized before persistence. Arbitrary provider response metadata is
not stored in the guest-auth challenge table.

## Operational maintenance

Expired counters can be removed in bounded batches with:

`SELECT app.prune_security_rate_limits(10000, now());`

This can be scheduled through the platform job runner once the general production scheduler is connected.

## Automated verification

- PostgreSQL integration test verifies atomic counter increments, blocking and window/key separation.
- Security boundary unit tests verify HMAC client identity behavior and telemetry redaction.
- Guest-auth integration suite continues to verify one-time challenge exchange and reservation scope.
- Production Core CI applies migration 0013 and runs the complete API typecheck/test/build suite.

## Remaining work before public launch

- connect real approved email/SMS provider;
- add provider-specific bounce and delivery webhook processing;
- expose standard `Retry-After` response header in the HTTP adapter;
- add edge/WAF rate limits as a second layer, not as a replacement for application limits;
- add security alerts for sustained rate-limit exhaustion;
- penetration-test enumeration, replay, race and credential-stuffing scenarios.
