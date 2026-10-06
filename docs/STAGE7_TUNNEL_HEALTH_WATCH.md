# Stage 7.15 — Tunnel Health Watch

## Goal

Turn the Stage 7.15 replica SLO into an operational guard instead of a one-time deployment proof.

The health watch is intentionally disabled until a persistent staging Docker host is connected as a self-hosted GitHub Actions runner with label:

views-staging-core

Enable it only by setting repository variable:

VIEWS_TUNNEL_HEALTH_WATCH_ENABLED=true

## Cadence

The workflow is scheduled every five minutes and can also be run manually.

GitHub scheduled workflows are an operational guard, not a substitute for a dedicated real-time monitoring system. They may be delayed by runner or GitHub scheduling conditions.

## What every run checks

1. The private Docker metrics network exists.
2. cloudflared-a exposes valid metrics.
3. cloudflared-b exposes valid metrics.
4. Each named-tunnel replica has at least four active HA connections.
5. The heartbeat retry gauge is zero at observation time.
6. The stable staging /health endpoint returns HTTP 200.
7. The stable staging /readiness endpoint returns HTTP 200.
8. 127.0.0.1:3001 remains unreachable from the host.

A failure makes the GitHub Actions run fail and emits a GitHub workflow error annotation.

## Security boundary

The scheduled watch requires no Cloudflare Tunnel token and no database password.

It joins the already-existing internal Docker tunnel_metrics network with a disposable read-only Node container and scrapes:

- http://cloudflared-a:2000/metrics
- http://cloudflared-b:2000/metrics

The metrics network is internal-only and is validated by the Stage 7.15 origin-isolation gate.

The observer output never contains metrics endpoint URLs or tunnel credentials.

## Evidence

A successful run writes:

/tmp/stage7.15-tunnel-health-watch.json

It contains public health status, direct-origin status, and the observer's machine-readable replica health result.

## Alert behavior

GitHub Actions marks the scheduled run failed when a replica is degraded/down or staging health fails.

Repository/organization notification rules should route failed workflow notifications to the operations channel or on-call recipient when staging becomes persistent.

For production, this scheduled workflow should later be supplemented by continuous Prometheus/Grafana or another dedicated alerting stack.

## Cloudflare SLI basis

Cloudflare documents cloudflared_tunnel_ha_connections as the number of active HA connections and describes a healthy Tunnel as serving through four connections to the Cloudflare network.
