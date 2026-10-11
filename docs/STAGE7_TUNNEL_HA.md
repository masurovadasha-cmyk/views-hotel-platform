# Stage 7.15 — Cloudflare Tunnel Replica Baseline

## Goal

Add connector-level high availability without weakening the Core origin boundary.

Cloudflare supports multiple cloudflared replicas attached to the same remotely managed tunnel. Each replica establishes its own outbound Cloudflare connections. The production baseline therefore uses two connector identities instead of one.

## Production topology

Pinned private ingress addresses:

- cloudflared-a: 172.30.0.2
- Core: 172.30.0.3
- cloudflared-b: 172.30.0.4

Core trusts exactly:

VIEWS_TRUSTED_PROXY_CIDRS_JSON=["172.30.0.2/32","172.30.0.4/32"]

No subnet-wide trust is permitted.

Both production connector containers receive the same CLOUDFLARE_TUNNEL_TOKEN through TUNNEL_TOKEN. A remotely managed tunnel token identifies the tunnel, so the two connector processes become replicas of the same tunnel when deployed with the real credential.

## Isolation gate v2

The Stage 7.15 origin-isolation gate now requires:

- at least two and at most 25 cloudflared connector services;
- a unique static private IPv4 address for every connector;
- exact Core trust pins for the complete connector set;
- one identical non-empty TUNNEL_TOKEN value across all connectors;
- no token in process arguments;
- no extra container on core_ingress;
- no host-published port on Core, PostgreSQL, or connector containers;
- read-only root filesystems, dropped capabilities, and no-new-privileges.

The gate never prints the token.

## CI resilience proof

CI cannot create a real named tunnel without a Cloudflare account credential. Instead it runs two independent Quick Tunnels, one from each pinned connector address.

This proves:

- both connector IPs are accepted by the Core trust boundary;
- a third private peer is rejected even when it forges CF-Connecting-IP;
- both connector paths reach the same Core;
- stopping connector A leaves connector B able to serve Core traffic;
- Core remains unreachable directly from the runner host.

Because Quick Tunnels are separate temporary tunnels, this CI check does not claim to prove Cloudflare same-tunnel replica failover. The machine-readable proof explicitly records sameNamedTunnelFailoverProven=false.

## Persistent activation requirement

The final same-tunnel failover proof requires a persistent runtime and a real remotely managed staging tunnel:

1. provision or choose a persistent Docker host;
2. create one staging tunnel;
3. inject the same tunnel token into both connector replicas;
4. configure the published hostname to http://core:3001;
5. verify both connector IDs appear on the same Cloudflare tunnel;
6. stop one replica;
7. verify the same public hostname remains healthy through the surviving replica.

For host-level fault tolerance, the second connector must ultimately run on a different host or failure domain. Two containers on one Docker host protect against connector-process failure, not loss of the host itself.

## Cloudflare references

- https://developers.cloudflare.com/tunnel/configuration/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/deploy-replicas/
- https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/
