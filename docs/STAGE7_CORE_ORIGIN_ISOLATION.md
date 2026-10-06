# Stage 7.15 — Core Origin Isolation via Cloudflare Tunnel

Status: implementation candidate.

## Goal

Remove the VIEWS Core API from direct Internet ingress rather than relying only on application-level source checks.

Stage 7.12-7.14 protected a public-origin topology. Stage 7.15 adds a Cloudflare Tunnel deployment profile where `cloudflared` establishes the outbound connection to Cloudflare and Core publishes no host port.

## Why Tunnel

Cloudflare Tunnel uses outbound-only connector sessions. The origin does not need a publicly routable IP or inbound firewall opening.

This topology is intentionally separate from Authenticated Origin Pulls. AOP is for public HTTPS origins that accept Cloudflare client certificates. Tunnel already authenticates the connector using its tunnel credential and should not be combined with AOP for the same hostname.

## Trust topology

The reference Compose topology creates four logical networks:

- `core_ingress` — internal-only network shared by exactly Core and cloudflared.
- `core_data` — internal-only database network.
- `core_egress` — Core outbound network for provider integrations; no host port is published.
- `tunnel_egress` — cloudflared outbound network used to reach Cloudflare.

Pinned addresses:

- cloudflared: `172.30.0.2`
- Core: `172.30.0.3`

Core runs with:

`TRUSTED_PROXY_MODE=cloudflare_tunnel`

and:

`VIEWS_TRUSTED_PROXY_CIDRS_JSON=["172.30.0.2/32"]`

Only the exact connector address may supply `CF-Connecting-IP`.

## Runtime behavior

`cloudflare_tunnel` behaves like the existing Cloudflare proxy mode for forwarded client identity, but the immediate-peer boundary is the local connector instead of Cloudflare public edge ranges.

Production startup fails when tunnel mode has no trusted connector CIDR or when a tunnel CIDR is broader than a single host. This avoids accidentally trusting an entire Docker/private subnet.

Signed Ed25519 service authentication from Stage 7.7-7.11 remains mandatory. Network isolation does not replace service identity.

## Database boundary

The bundled Postgres container is the database owner/bootstrap service only. Core does not construct a superuser connection string from that password.

`DATABASE_URL` is a required deployment secret and must identify the restricted runtime database role created by the existing migration/bootstrap process. This preserves RLS and least-privilege behavior from the previous stages.

## Container hardening

Core and cloudflared:

- publish no host ports;
- use read-only root filesystems;
- drop all Linux capabilities;
- enable no-new-privileges;
- do not use host networking or privileged mode.

The tunnel token is injected through `TUNNEL_TOKEN`; it is not placed in cloudflared command-line arguments.

## Deployment

Use a remotely managed Cloudflare Tunnel.

Configure the tunnel's published application route to send the Core hostname to:

`http://core:3001`

The connector container and Core must be deployed from the same Compose project so the private service name resolves on `core_ingress`.

Required deployment secrets/config include:

- `CLOUDFLARE_TUNNEL_TOKEN`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` for the restricted Core runtime role
- `GUEST_AUTH_RATE_LIMIT_SECRET`
- Stage 7 signed-service public-key configuration and referenced values.

Do not publish port 3001 on the host or add the Core container to host networking.

## Validation gate

`scripts/core-origin-isolation-gate.mjs` evaluates rendered Docker Compose JSON and fails closed if the isolation contract is weakened.

It verifies:

- Core, cloudflared and Postgres have no published host ports;
- `core_ingress` is internal;
- only Core and cloudflared join that ingress network;
- both connector and Core have pinned distinct addresses;
- Core is in `cloudflare_tunnel` mode;
- Core trusts exactly the connector `/32`;
- cloudflared uses `TUNNEL_TOKEN`, not `--token` process arguments;
- Core and cloudflared container hardening remains enabled.

GitHub Actions renders the actual Compose model and runs this gate on relevant changes, then builds the Core image.

## Stage 7.14 interaction

The Cloudflare public edge CIDR drift gate is applicable only to `TRUSTED_PROXY_MODE=cloudflare`.

In `cloudflare_tunnel` mode, the immediate peer is the pinned local connector, so the provider public-CIDR drift checker reports itself as not applicable. The Stage 7.15 isolation gate becomes the relevant network topology control.

## Automated remote staging proof

Before a persistent named tunnel is provisioned, the branch runs a real Cloudflare Quick Tunnel acceptance test in GitHub Actions.

The proof uses docker-compose.core-tunnel-proof.yml and scripts/stage7-tunnel-proof.sh to exercise Cloudflare edge -> cloudflared -> private Core while proving the runner host has no direct listener on Core port 3001.

It also injects an untrusted container into the private ingress network and confirms a forged CF-Connecting-IP is rejected with HTTP 403. The same intentionally invalid guest-auth token sent through the real Cloudflare tunnel must reach application auth logic and return HTTP 401 instead.

Quick Tunnels are test-only. They do not replace the named staging/production tunnel.

## Activation proof required before production cutover

1. Create a dedicated staging/production remotely managed tunnel.
2. Store the tunnel token in the deployment secret manager.
3. Route the Core hostname to `http://core:3001`.
4. Start the hardened Compose profile with the restricted runtime `DATABASE_URL`.
5. Verify the public hostname reaches `/health` through Cloudflare.
6. Verify the host has no published Core port.
7. Verify direct requests to the server IP cannot reach Core.
8. Verify spoofed `CF-Connecting-IP` from any non-connector peer is rejected.
9. Keep service-token and ingress-rejection telemetry clean before retargeting the stacked PR.

## Next work

- remote staging activation and direct-origin negative proof;
- tunnel replica/high-availability strategy;
- controlled Core outbound egress policy;
- per-host WAF/rate-limit policy at the Cloudflare edge.
