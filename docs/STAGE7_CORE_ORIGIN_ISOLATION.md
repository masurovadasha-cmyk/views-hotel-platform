# Stage 7.15 — Core Origin Isolation via Cloudflare Tunnel

Status: implementation candidate with dual-connector HA baseline.

## Goal

Remove the VIEWS Core API from direct Internet ingress and keep the origin available if one cloudflared connector process fails.

Stage 7.12-7.14 protected a public-origin topology. Stage 7.15 uses Cloudflare Tunnel so cloudflared establishes outbound connections to Cloudflare and Core publishes no host port.

## Trust topology

The reference Compose topology has:

- core_ingress — internal-only ingress network;
- core_data — internal-only database network;
- core_egress — Core outbound network;
- tunnel_egress — connector outbound network.

Pinned ingress addresses:

- cloudflared-a: 172.30.0.2
- Core: 172.30.0.3
- cloudflared-b: 172.30.0.4

Core runs with:

TRUSTED_PROXY_MODE=cloudflare_tunnel

and trusts exactly:

VIEWS_TRUSTED_PROXY_CIDRS_JSON=["172.30.0.2/32","172.30.0.4/32"]

Only these exact peers may supply forwarded Cloudflare client identity.

## Replica model

Both production connector containers receive the same remotely managed tunnel credential through TUNNEL_TOKEN.

Cloudflare supports multiple cloudflared replicas on one tunnel. Each replica establishes additional outbound connections and Cloudflare can continue through remaining replicas when one connector fails.

The Stage 7.15 baseline requires two connector processes. This protects against a connector process/container failure on the reference host. It does not protect against complete loss of that host.

Host-level high availability requires moving the second replica to a separate failure domain while preserving a private route to Core.

## Runtime behavior

cloudflare_tunnel behaves like the existing Cloudflare proxy mode for forwarded client identity, but the immediate trusted peers are the pinned connector addresses rather than Cloudflare public edge ranges.

Production startup still rejects subnet-wide connector trust: every trusted tunnel CIDR must be a single host CIDR.

Signed Ed25519 service authentication remains mandatory. Tunnel isolation does not replace service identity.

## Database boundary

The bundled PostgreSQL container is the database owner/bootstrap service only.

Core receives DATABASE_URL as a deployment secret for the restricted runtime role and does not construct an owner connection from POSTGRES_PASSWORD. RLS and least-privilege behavior therefore remain active.

## Container hardening

Core and both cloudflared replicas:

- publish no host ports;
- use read-only root filesystems;
- drop all Linux capabilities;
- enable no-new-privileges;
- do not use host networking or privileged mode.

The tunnel token is injected via TUNNEL_TOKEN and is never placed in process arguments.

## Isolation gate v2

scripts/core-origin-isolation-gate.mjs validates rendered Compose JSON and fails closed if the topology weakens.

It requires:

- 2..25 cloudflared replicas;
- no published host ports for Core, PostgreSQL, or replicas;
- core_ingress marked internal;
- only Core and cloudflared replicas on core_ingress;
- unique static connector addresses;
- exact Core CIDR trust equal to the complete connector address set;
- the same non-empty tunnel token on all production replicas;
- cloudflared tunnel run with --no-autoupdate;
- no --token command-line secret;
- outbound tunnel_egress connectivity;
- hardened Core and replica containers.

The gate does not emit tunnel-token values.

## Stage 7.14 interaction

The public Cloudflare CIDR drift gate applies to TRUSTED_PROXY_MODE=cloudflare.

In cloudflare_tunnel mode, the immediate peers are the local connector replicas, so Stage 7.15 topology validation is the relevant network control.

## Automated staging proof

The branch uses two temporary Cloudflare Quick Tunnels in CI because Quick Tunnels need no Cloudflare account credential.

CI proves:

- all migrations and restricted runtime DB readiness;
- no host listener for Core;
- spoofed CF-Connecting-IP from an untrusted private peer returns 403;
- connector A reaches Core through Cloudflare;
- connector B reaches Core through Cloudflare;
- both connector paths reach guest-auth logic and return 401 for an intentionally invalid token;
- connector B remains healthy after connector A is stopped.

Quick Tunnels are independent temporary tunnels. This proves the VIEWS dual-connector trust and process-resilience behavior but does not claim same-named-tunnel failover.

## Persistent activation required

To complete the persistent same-tunnel proof:

1. choose a persistent Docker runtime;
2. create one remotely managed staging tunnel;
3. inject the same tunnel token into both replicas;
4. publish the staging Core hostname to http://core:3001;
5. verify both replica connector IDs appear under that one tunnel;
6. verify the hostname returns health/readiness 200;
7. stop replica A;
8. verify the same hostname remains available through replica B;
9. repeat with replica B stopped;
10. keep direct origin access closed throughout.

## Next work

- persistent named-tunnel activation when a no-surprise-cost runtime is selected;
- move the second replica to a separate failure domain for host-level HA;
- controlled Core outbound egress policy;
- tunnel health/replica observability and alerts;
- edge WAF and API rate-limit policy.
