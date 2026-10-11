# Stage 7.18 — Provider-bound HTTPS client

## Scope and activation state

The implementation is a Core library, not an enabled payment/SMS integration.
`ProviderRegistry()` is empty by default. No production provider, merchant key,
new cloud resource, database migration, frontend release or APK is enabled here.
The existing review build remains separate and unchanged.

The library lives only under `apps/api/src/security/egress/`, the existing
Stage 7.16 source-policy boundary. It uses Node standard libraries, with no new
runtime package. Consumers must inject an approved registry, credential resolver,
and durable audit sink. There is deliberately no default/no-op audit sink.

## Request contract

A caller supplies `providerId`, `operationId`, a UUID `requestId`, optional
allowlisted query parameters, JSON body and explicit idempotency key. The caller
cannot supply a URL, host, path, method, arbitrary headers, proxy or TLS options.
Those are bound to reviewed, immutable operation policies in the registry.

Origins must be canonical HTTPS DNS origins without userinfo, port override,
path, query or fragment. Operation paths are fixed, not string templates or
caller URLs. IP literals and local/metadata-style names are rejected. Query
values are encoded using URLSearchParams; only configured keys are permitted.

GET bodies are rejected. POST JSON is bounded by UTF-8 size, nesting depth and
node count. Cycles, getters, symbols, custom serialization and non-JSON values
are rejected. Configuration has a 1 MiB hard maximum for each request/response
limit. Individual providers should use lower limits.

## Transport

`HttpsRelayTransport` defaults to the pinned private relay `172.31.0.3:3128`.
Only this IP gets a TCP connection. An HTTP CONNECT tunnel to the approved
hostname on 443 is followed by TLS with hostname verification, explicit SNI,
`rejectUnauthorized: true` and TLS 1.2 minimum. There is no direct-route fallback
and no environment-proxy discovery. Authentication is sent inside verified TLS,
never in the proxy CONNECT headers.

Responses have header/body size bounds. Redirects and compressed bodies are
rejected rather than followed/decompressed. JSON content types are required
except for a no-content response. Response cookies and arbitrary headers are
not propagated. Response-schema validation remains the provider adapter's job.

One overall deadline covers audit and transport waits; cancellation closes
transport resources. The default local concurrency bound is 16. It is not a
distributed rate limiter.

## Retry and audit semantics

No automatic retry is performed, including POST, 503, TLS failure and timeout.
An idempotency header does not prove that an upstream provider implements
idempotency; its actual guarantee must be tested in the adapter/ledger stage.

Audit events contain only provider/operation IDs, request UUID, attempt number,
duration, status and safe error code. No URL query, body, token, cookie or raw
exception is logged by this library. A started event must be accepted before
dispatch. Failure of that write prevents sending.

Errors expose `retryable: false` and a conservative delivery classification:

- `not-sent`: no application request is known to have been dispatched.
- `unknown`: dispatch may have happened; reconcile before any resend.
- `response`: a response was observed, even if persisting its audit failed.

A durable sink has not been wired to production in this stage. Storage/outbox,
reconciliation and tenant enforcement are activation requirements, not implied
by the successful transport tests. Deadline expiration can leave a pending
audit event that requires reconciliation.

## Relay destination hardening

A domain allowlist alone is insufficient against private destination resolution.
The Squid ACL now disables reverse-DNS allowlist matching and checks the resolved
IPv4/IPv6 destination against private, link-local, loopback and reserved ranges
before the sole CONNECT allow rule. The existing `.views.invalid` production
sentinel remains unchanged. A strict configuration gate detects missing ranges,
rule reordering and additional/unreviewed directives.

The disposable proof adds two TEST-ONLY hosts-file entries within the existing
`.example.com` proof suffix: `private-v4.example.com -> 127.0.0.1` and
`private-v6.example.com -> ::1`. Both must return 403 despite matching the
allowlisted suffix; external example.com:443 must still return CONNECT 200.
This is controlled resolution evidence, not a claim of exhaustive DNS-rebinding
coverage. Relay DNS policy is not enforced independently by the Core library.

## Tests and execution

Install the existing `apps/api` development dependencies, then run:

```sh
node scripts/run-provider-egress-acceptance.mjs
```

The runner strictly compiles the production TypeScript and executes 71 Node
acceptance tests (50 client/transport tests, 21 relay-policy mutation tests).
TLS fixtures and keys are generated locally for the test and removed afterward;
no fixture private key is committed. Test traffic stays on loopback.

The dedicated GitHub workflow also runs the real Docker/Squid proof against a
disposable PostgreSQL/Core stack. That job must be green before treating the
relay hardening as runtime-validated. Evidence is uploaded per run; test results
are not inferred from a workflow being queued or from a previous commit.

## Primary technical references

- Node 22 TLS socket, SNI and certificate verification: https://nodejs.org/docs/latest-v22.x/api/tls.html
- OWASP SSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Squid destination ACL semantics and `-n`: https://www.squid-cache.org/Doc/config/acl/
- Squid hosts-file resolution: https://www.squid-cache.org/Doc/config/hosts_file/
- Docker Compose test-only hosts mappings: https://docs.docker.com/reference/compose-file/services/#extra_hosts
