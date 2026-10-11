# Stage 7.12 — Core Trusted-Service Ingress Boundary

Status: implementation candidate.

## Goal

Add a network-origin boundary in front of the Stage 7 signed-service authentication stack without blocking public Core routes such as provider webhooks, guest auth and health endpoints.

This stage is defense in depth. Signed service tokens remain mandatory according to the Stage 7.10 per-service auth mode. A network allowlist never replaces cryptographic service authentication.

## Request classification

The global InternalIngressGuard activates only when a request carries an internal marker: service ID, service token, internal key, or forwarded actor headers.

Requests without internal markers bypass this guard and continue to their existing public security boundary. Malformed or missing service identities are left for the existing authentication guards.

## Direct mode

When TRUSTED_PROXY_MODE=direct, production requires VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON for every configured trusted service. The immediate socket address must match the claimed service's configured source range.

## Reverse-proxy / Cloudflare mode

When TRUSTED_PROXY_MODE=cloudflare, production requires VIEWS_TRUSTED_PROXY_CIDRS_JSON. The immediate socket peer must match one of these trusted reverse-proxy ranges. A caller that knows a valid service token but reaches the origin directly from another network is rejected before business logic.

Provider CIDRs are deployment configuration, not application constants. Do not hard-code a vendor network list in the repository; deployment automation must supply and refresh approved ranges.

### Optional stable service egress

If a trusted sender has stable egress, VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON adds a second per-service boundary. After the immediate proxy is trusted, Core checks CF-Connecting-IP against that service's source ranges.

If sender egress is dynamic, omit the per-service layer and retain the reverse-proxy edge boundary plus Ed25519 signed service authentication.

## Fail-closed rules

Production refuses startup when cloudflare mode has no trusted proxy ranges, direct mode lacks a source entry for a configured service, CIDRs are invalid, or a production source policy names an unknown service.

Runtime failures are returned as a generic forbidden response and aggregated under service_ingress_denied. Raw source IPs are not added to the security database.

## IPv4 / IPv6

The matcher supports IPv4, IPv6, exact host addresses and IPv4-mapped IPv6 socket addresses using Node's built-in BlockList. No external network-matching dependency is introduced.

## Rollout

1. Configure trusted reverse-proxy ranges in staging.
2. Verify normal Pages/BFF and analytics-cron traffic.
3. Verify a direct-origin internal request is denied.
4. Add stable per-service egress ranges only where deployment can guarantee them.
5. Monitor service_ingress_denied telemetry.
6. Apply the same topology to production only after remote staging evidence is clean.

## Infrastructure boundary

This application guard is not a substitute for an origin firewall, private network, reverse-proxy tunnel, load-balancer security group or equivalent infrastructure control. Where available, block direct origin access at infrastructure level too.

## Automated acceptance

Tests cover IPv4/IPv6 matching, malformed CIDRs, direct-mode service allow/deny, reverse-proxy enforcement, spoofed forwarded source from an untrusted peer, optional service egress restriction, production config requirements and migration coverage.

## Next work

- remote staging proof of direct-origin rejection;
- infrastructure-level origin firewall or tunnel configuration;
- proxy CIDR refresh procedure;
- mTLS evaluation once the deployment topology supports stable service certificates.
