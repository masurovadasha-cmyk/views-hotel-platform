# Stage 7.13 — Trusted Proxy Client Identity Hardening

Status: implementation candidate.

## Goal

Prevent a caller that reaches Core directly from forging CF-Connecting-IP and bypassing client-network rate limits on public endpoints such as guest-auth exchange.

Stage 7.12 already requires internal trusted-service traffic to arrive through an approved reverse proxy. Stage 7.13 applies the same immediate-peer trust rule before Core accepts forwarded public client identity.

## Trust rule

In direct mode, Core derives client network identity only from the socket peer.

In cloudflare mode, Core first checks the socket peer against VIEWS_TRUSTED_PROXY_CIDRS_JSON. Only then may CF-Connecting-IP be used as the effective client address.

If the immediate peer is not trusted, Core throws CLIENT_PROXY_NOT_TRUSTED and never hashes or rate-limits on the attacker-supplied forwarded value.

## Guest-auth exchange

The public guest-auth exchange endpoint now passes the configured trusted proxy CIDRs into clientNetworkKey.

An untrusted direct-origin request in cloudflare mode receives a generic forbidden CLIENT_NETWORK_NOT_TRUSTED response before the exchange rate-limit key is computed.

A request through an approved proxy still uses a HMAC of the verified forwarded client IP. Raw client IPs are not persisted.

## Internal rejection telemetry

Configured cloudflare-mode security telemetry now also validates the immediate proxy before trusting CF-Connecting-IP.

Stage 7.12 ingress denials remain special: they intentionally hash the direct socket peer because the proxy has already failed trust validation.

## Deployment

VIEWS_TRUSTED_PROXY_CIDRS_JSON therefore has two security responsibilities:

1. restrict internal trusted-service origin paths at the application boundary;
2. define which immediate peers are allowed to supply forwarded public client identity.

The list must represent the actual reverse-proxy network that connects to Core and must be refreshed by deployment operations when the provider changes its ranges.

## Failure behavior

CLIENT_PROXY_NOT_TRUSTED indicates either a direct-origin attempt or a reverse-proxy CIDR configuration drift. Investigate proxy routing before widening the allowlist.

CLIENT_NETWORK_IDENTITY_UNAVAILABLE still means the trusted path did not provide a usable client address.

## Automated acceptance

Tests cover direct-mode socket identity, trusted proxy forwarded identity, missing forwarded identity, and spoofed forwarded identity from an untrusted immediate peer.

## Next work

- remote staging proof that direct guest-auth origin access cannot spoof client identity;
- automate trusted proxy CIDR refresh validation;
- infrastructure-level origin firewall or tunnel;
- mTLS evaluation for service-to-service paths.
