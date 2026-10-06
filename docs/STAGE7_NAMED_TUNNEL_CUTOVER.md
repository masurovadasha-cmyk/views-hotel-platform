# Stage 7.15 — Named Tunnel Cutover and Failover Proof

## Purpose

This is the final Stage 7.15 activation proof for a persistent staging deployment.

The earlier Quick Tunnel proof validates the VIEWS application boundary with no Cloudflare account credential. This proof is different: it requires one real remotely managed Cloudflare Tunnel, one stable staging hostname, and the same tunnel token on both production-style cloudflared replicas.

Cloudflare documents replicas as additional cloudflared instances pointing to the same tunnel. If one replica fails, remaining replicas continue to serve traffic. A remotely managed tunnel requires only its tunnel token to run. The token is therefore a secret and must never be committed or printed.

## Required staging state

Before running:

- a persistent Docker host is available;
- the Stage 7.15 Compose profile is checked out;
- one remotely managed Cloudflare Tunnel exists;
- its published application hostname routes to http://core:3001;
- the same tunnel token is injected as CLOUDFLARE_TUNNEL_TOKEN;
- all VIEWS runtime secrets are available to Docker Compose;
- the hostname is staging-only.

Required environment:

- CLOUDFLARE_TUNNEL_TOKEN
- VIEWS_STAGING_CORE_URL
- DATABASE_URL
- POSTGRES_PASSWORD
- GUEST_AUTH_RATE_LIMIT_SECRET
- VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
- VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
- VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY
- any other public keys referenced by the configured service set

The proof must also be explicitly armed:

VIEWS_NAMED_TUNNEL_PROOF_ACK=I_UNDERSTAND_STAGING_CONNECTORS_WILL_BE_RESTARTED

This prevents accidental execution against a production host because the script intentionally stops connector replicas one at a time.

## What the script proves

scripts/stage7-named-tunnel-failover-proof.sh:

1. renders the real Compose model with restrictive file permissions;
2. runs Core origin-isolation gate v2 without printing the tunnel token;
3. starts Core and both connector replicas;
4. verifies health, readiness, and guest-auth behavior on the stable hostname;
5. stops replica B and proves the same hostname remains healthy through replica A;
6. restores B;
7. stops replica A and proves the same hostname remains healthy through replica B;
8. restores A and proves the baseline is healthy again;
9. confirms Core still has no host port binding;
10. confirms an untrusted private peer forging CF-Connecting-IP still receives HTTP 403.

A passing result writes:

/tmp/stage7.15-named-tunnel-proof.json

and sets:

sameNamedTunnelFailoverProven=true

## Why this proves same-tunnel failover

The production Compose gate requires both replicas to receive the same TUNNEL_TOKEN.

The proof then shows the same public staging hostname stays healthy when only A is alive and again when only B is alive. That combination demonstrates that either replica can serve the same named-tunnel route.

No Cloudflare management API token is required for this proof.

## Security notes

- Never store CLOUDFLARE_TUNNEL_TOKEN in the repository.
- Never echo the token or render Compose JSON to a public log.
- The temporary rendered topology file is created with umask 077 and removed on exit.
- The proof restores both connector replicas on any normal or error exit.
- Run this only in staging.

## Host-level availability limitation

Two containers on one Docker host prove connector-process failover, not host failover.

The next infrastructure step after this proof is to move the second connector to another host or failure domain with private reachability to Core, or to redesign Core as an HA service behind multiple private origins.

## Cloudflare basis

Cloudflare states that each cloudflared instance maintains multiple outbound connections to its network and that additional replicas can point to the same tunnel. Cloudflare allows up to 25 replicas per tunnel. For intelligent traffic steering and health-based origin failover beyond replica availability, Cloudflare recommends Load Balancing.
