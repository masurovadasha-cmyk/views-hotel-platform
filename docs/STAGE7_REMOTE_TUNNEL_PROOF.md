# Stage 7.15 — Remote Staging Proof

This acceptance test exercises the real Cloudflare transport without requiring a persistent host or Cloudflare account credential.

## Purpose

The Stage 7.15 production profile is designed for a named, remotely managed Cloudflare Tunnel. Before a permanent tunnel token and host are introduced, CI uses a temporary Cloudflare Quick Tunnel to prove the same network shape:

Internet -> Cloudflare edge -> cloudflared -> private Core

Cloudflare Quick Tunnels are development/testing transports only. Their random trycloudflare.com hostname is destroyed with the CI job and is never used as a production endpoint.

## Proof topology

The test composes PostgreSQL on core_data, a one-shot migration/bootstrap container, Core on core_ingress with no host port, and cloudflared pinned to 172.30.0.2 while Core is pinned to 172.30.0.3.

The production isolation profile is validated first with core-origin-isolation-gate.mjs.

The proof override only replaces the named-tunnel command with:

cloudflared tunnel --no-autoupdate --url http://core:3001

No Cloudflare account, API token, DNS zone, or tunnel token is used by the proof.

## Database proof

The one-shot migration service applies the same PostgreSQL extension bootstrap and all ordered API migrations.

Core then connects as the restricted views_app runtime role rather than the database owner. This keeps RLS/least-privilege behavior active during the network proof.

## Assertions

scripts/stage7-tunnel-proof.sh fails unless all of the following are true:

1. the production Compose profile passes the Stage 7.15 isolation gate;
2. Core becomes ready from the private ingress network;
3. Docker reports no host binding for Core port 3001;
4. 127.0.0.1:3001 is unreachable from the GitHub runner host;
5. a non-connector container that forges CF-Connecting-IP receives HTTP 403;
6. Cloudflare emits a temporary trycloudflare.com URL;
7. /health and /readiness return 200 through Cloudflare;
8. the same guest-auth request through the trusted connector reaches application auth logic and returns 401 for the intentionally invalid token, not the network-boundary 403.

The final machine-readable evidence is written to /tmp/stage7.15-tunnel-proof.json.

## Security interpretation

This proves that the application can be reached through an outbound Cloudflare Tunnel while the host itself exposes no Core listener.

It also proves the Stage 7.13 forwarded-client identity hardening survives the Stage 7.15 topology change: an arbitrary peer on the private network cannot become a trusted proxy simply by sending CF-Connecting-IP.

## Limitation

A Quick Tunnel is not persistent and has no uptime guarantee. Passing this proof does not activate the stable staging hostname.

The remaining activation step is to replace the Quick Tunnel with a named staging tunnel on a persistent Docker host, then repeat the same negative-origin assertions against that host.
