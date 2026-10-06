# Stage 7.15 — Scheduled Tunnel Replica SLO Check

## Goal

Turn the connector metrics SLI into a recurring staging control without giving the observer access to Core, database credentials, or the Cloudflare tunnel token.

## Schedule

The guarded GitHub Actions workflow runs every 15 minutes when:

VIEWS_TUNNEL_OBSERVABILITY_ENABLED=true

is configured as a repository/environment variable and a self-hosted runner with the label:

views-staging-core

is online.

If the flag is absent or false, the scheduled job is skipped.

## Secret-free execution

The scheduled check does not need:

- CLOUDFLARE_TUNNEL_TOKEN
- DATABASE_URL
- POSTGRES_PASSWORD
- service signing private keys

It discovers the already-running cloudflared containers through Docker Compose labels and joins only the internal tunnel_metrics network.

The observer container is:

- ephemeral;
- read-only;
- cap-drop ALL;
- no-new-privileges;
- attached only to tunnel_metrics.

## SLO

Every scheduled check requires both:

- cloudflared-a >= 4 active HA connections;
- cloudflared-b >= 4 active HA connections.

It also fails when heartbeat retry findings are present.

A failed check therefore means connector redundancy is degraded even if the public hostname still returns HTTP 200.

## Evidence

The job writes:

/tmp/stage7.15-tunnel-slo.json

and validates that file as JSON before reporting success.

GitHub Actions marks the scheduled run failed when the SLO is not satisfied, providing a native operational signal without automatically mutating infrastructure.

## Boundary

This control detects connector/process degradation. It does not detect loss of the entire Docker host because the self-hosted runner would also become unavailable. Host-level monitoring must ultimately be external to that failure domain.
