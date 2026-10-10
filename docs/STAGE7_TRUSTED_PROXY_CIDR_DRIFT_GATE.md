# Stage 7.14 — Trusted Proxy CIDR Drift Gate

Status: implementation candidate.

## Goal

Prevent VIEWS Core from silently trusting an obsolete or over-broad reverse-proxy network allowlist.

Stage 7.13 only accepts forwarded client identity after the immediate socket peer matches `VIEWS_TRUSTED_PROXY_CIDRS_JSON`. That makes correctness of this allowlist a security boundary. Stage 7.14 adds an independent operational gate that compares the configured production allowlist with Cloudflare's currently published origin-facing IPv4 and IPv6 CIDRs.

## Security rule

The gate is exact-match and fail-closed.

A check is healthy only when every range published by Cloudflare exists in the configured allowlist and every configured range is still published by Cloudflare.

The tool never edits or widens production configuration automatically.

Findings:

- `PROVIDER_RANGE_MISSING_FROM_CONFIG` — Cloudflare publishes a range that production does not trust yet. This can become an availability failure when traffic starts arriving from that range.
- `CONFIG_RANGE_NOT_PUBLISHED_BY_PROVIDER` — production trusts a range that Cloudflare no longer publishes. This is a trust-expansion/security finding.

Malformed provider data, missing configuration, fetch failure, or invalid CIDR syntax are execution errors and return a non-zero exit status.

## Provider source

The checker reads the public Cloudflare API endpoint:

`https://api.cloudflare.com/client/v4/ips`

No Cloudflare API token is required. The response's `ipv4_cidrs`, `ipv6_cidrs`, and optional `etag` are used only as verification evidence.

## CLI

Production-like live check:

```bash
VIEWS_TRUSTED_PROXY_CIDRS_JSON='["..."]' \
  npm run security:trusted-proxy-cidr-gate
```

Deterministic/offline check against a captured provider response:

```bash
VIEWS_TRUSTED_PROXY_CIDRS_JSON='["..."]' \
  node scripts/trusted-proxy-cidr-gate.mjs --provider-file=cloudflare-ips.json
```

Exit codes:

- `0` — exact match.
- `1` — CIDR drift detected.
- `2` — configuration/provider/tooling error.

## Automation

`.github/workflows/trusted-proxy-cidr-drift.yml` runs daily at 03:17 UTC and supports manual dispatch.

The workflow has read-only repository permissions and requires repository variable `VIEWS_TRUSTED_PROXY_CIDRS_JSON`.

A failed drift job is an operational signal to review Cloudflare's published ranges and update the production allowlist through the normal deployment change path. Do not copy a newly observed CIDR into production without reviewing the provider response.

## Separation from runtime

The runtime remains free of provider network calls. Core continues using its already-loaded allowlist on the hot request path.

Stage 7.14 is therefore a deployment/operations control, not an availability dependency for guest requests or internal service traffic.

## Stage 7.15 tunnel compatibility

This provider-range gate applies only to `TRUSTED_PROXY_MODE=cloudflare`, where Cloudflare edge addresses connect directly to a public origin.

When `TRUSTED_PROXY_MODE=cloudflare_tunnel`, the immediate Core peer is the local `cloudflared` connector on a private network. In that mode the gate exits successfully as not applicable; Stage 7.15 instead pins exact connector host CIDRs and validates the tunnel deployment topology.

## Acceptance

Automated tests cover:

- exact-set success;
- newly published provider CIDR;
- stale/extra configured CIDR;
- malformed provider payload;
- duplicate/malformed configured CIDRs;
- IPv4/IPv6 family validation.

## Next work

- prove the gate against the real staging allowlist;
- add infrastructure-level origin firewall/tunnel enforcement;
- evaluate authenticated origin transport (mTLS or equivalent) for trusted service paths;
- retarget the stacked Stage 7 PRs only after predecessor checks are green.
