# Stage 7.17 — Controlled Core Egress Relay

## Goal

Allow future provider integrations without ever restoring direct Internet access to Core.

Stage 7.16 made every Core network internal. Stage 7.17 introduces a dedicated forward proxy that is the only workload attached to both the private Core egress network and an Internet-capable network.

## Topology

- Core: core_egress 172.31.0.2
- egress-relay: core_egress 172.31.0.3
- egress-relay only: egress_public
- Core never joins egress_public
- core_egress remains internal

The relay has no host-published port.

## Proxy implementation

The relay uses Canonical's verified ubuntu/squid image, pinned to an immutable multi-platform digest.

Squid is configured as a CONNECT-only HTTPS forward proxy.

Policy:
- source must be Core's pinned private IP;
- method must be CONNECT;
- destination port must be 443;
- destination hostname must match the reviewed domain allowlist;
- everything else is denied.

Caching is disabled.

## Production allowlist

infra/egress/allowed-domains.txt initially contains only:

.views.invalid

This is intentional. Stage 7.17 proves the boundary without opening a real provider endpoint.

Real Payme, Click, Uzum, SMS, fiscal, storage, or other destinations must be introduced by later reviewed changes to the allowlist together with adapter tests.

## Policy format

Each entry is an exact hostname or dot-prefixed DNS suffix.

Accepted examples:
- api.provider.example
- .provider.example

Rejected:
- URLs
- ports
- IP literals
- wildcard syntax
- localhost/local/internal/arpa names
- metadata.google.internal

## Source-code boundary

Stage 7.16's TypeScript AST gate continues to reject direct networking outside apps/api/src/security/egress/.

Future adapters must therefore call a centralized egress implementation rather than creating their own socket/fetch/http clients.

## Proof

CI uses a separate proof allowlist for .example.com.

The proof demonstrates:
1. production topology gates are green;
2. production allowlist stays fail-closed;
3. private DB/readiness remains healthy;
4. Core still cannot reach the Internet directly;
5. Core can connect to the relay over core_egress;
6. CONNECT example.com:443 through the relay returns HTTP 200;
7. CONNECT to a non-allowlisted hostname returns HTTP 403;
8. plain HTTP proxying is denied;
9. link-local metadata destinations are denied by relay policy;
10. relay port 3128 is not published on the host.

## Image provenance

Canonical publishes ubuntu/squid as a verified publisher image. The selected 6.6/Ubuntu 24.04 line is supported through 2029 according to the publisher metadata.

The Compose file pins the image to the multi-platform digest so tag mutation cannot silently alter the relay image.

## Next layer

Stage 7.18 should add the centralized application egress client contract:
- explicit provider identity;
- destination binding;
- timeout/retry policy;
- request/response redaction;
- audit event;
- SSRF-safe URL construction;
- no arbitrary caller-supplied URL.

Only after that layer should the first real payment provider adapter be connected.
