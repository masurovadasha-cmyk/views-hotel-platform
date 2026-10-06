# Stage 7.15 — Dual-Connector Remote Staging Proof

## Purpose

Exercise the real Cloudflare transport while preserving the hardened Core origin boundary and testing two independently pinned connector paths.

The production topology uses two replicas of one named tunnel. CI cannot create that named tunnel without a Cloudflare account credential, so the automated proof uses two independent temporary Quick Tunnels.

## Proof topology

CI composes:

- PostgreSQL on core_data;
- a one-shot migration/bootstrap container;
- Core at 172.30.0.3 on core_ingress;
- cloudflared-a at 172.30.0.2;
- cloudflared-b at 172.30.0.4.

Core trusts exactly both connector /32 addresses.

The production Compose model is rendered and checked by core-origin-isolation-gate.mjs before any proof containers start.

## Database proof

All ordered migrations are applied.

Core then connects as the restricted views_app role, not as the PostgreSQL owner.

## Assertions

scripts/stage7-tunnel-proof.sh fails unless:

1. the production dual-replica topology passes isolation gate v2;
2. Core becomes ready on the private ingress network;
3. Core has no Docker host port binding;
4. 127.0.0.1:3001 is unreachable from the runner host;
5. an untrusted private peer forging CF-Connecting-IP gets HTTP 403;
6. cloudflared-a receives a Quick Tunnel URL;
7. cloudflared-b receives a different Quick Tunnel URL;
8. connector A /health and /readiness return 200 through Cloudflare;
9. connector B /health and /readiness return 200 through Cloudflare;
10. invalid guest-auth tokens through each trusted connector return 401 rather than network-boundary 403;
11. connector B remains healthy after connector A is stopped.

Final evidence is written to:

/tmp/stage7.15-tunnel-proof.json

Schema version 2 records sameNamedTunnelFailoverProven=false so the CI result cannot be mistaken for the final persistent named-tunnel failover proof.

## Interpretation

A successful run proves the VIEWS application side of connector redundancy:

- multiple exact connector peers can be trusted without trusting their subnet;
- unrelated private peers cannot forge forwarded identity;
- each connector can independently reach Core through Cloudflare;
- one connector process can disappear while another path remains healthy;
- Core still has no public origin listener.

## Limitation

Two Quick Tunnels are not replicas of one named tunnel.

The final same-hostname Cloudflare failover check requires one remotely managed staging tunnel and its credential on a persistent runtime.

For complete host-level high availability, the two production replicas must ultimately be split across separate failure domains.
