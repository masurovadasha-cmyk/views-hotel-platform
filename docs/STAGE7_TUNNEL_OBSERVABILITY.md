# Stage 7.15 — Tunnel Replica Observability and SLO

## Goal

Detect connector degradation before redundancy is lost.

Cloudflare cloudflared exposes a Prometheus metrics endpoint. The Stage 7.15 HA baseline already configures each replica with --metrics 0.0.0.0:2000, but that endpoint is not published to the host or Internet.

VIEWS adds an internal-only tunnel_metrics network and an on-demand observer profile.

## SLI

Primary connector SLI:

cloudflared_tunnel_ha_connections

Cloudflare documents this gauge as the number of active HA connections. A normally healthy tunnel uses four active connections per cloudflared replica.

VIEWS classification:

- healthy: >= 4 active HA connections
- degraded: 1-3
- down: 0

The threshold is configurable only for ephemeral CI proofs. Persistent staging/production uses the default of 4.

Secondary signals:

- cloudflared_tunnel_timer_retries
- cloudflared_tunnel_active_streams
- cloudflared_tunnel_request_errors

Any non-zero timer-retry snapshot is surfaced as a finding.

Request errors are reported as a counter for diagnosis but are not treated as a snapshot failure because counters require a time-window delta to produce a meaningful error-rate SLI.

## Network boundary

The metrics endpoint is not exposed publicly.

Both replicas join tunnel_metrics, an internal Docker network.

The observer joins only tunnel_metrics and has no ingress or Internet egress requirement.

Core does not join tunnel_metrics.

No connector metrics port is published on the Docker host.

## Observer

Run:

docker compose --profile ops run --rm tunnel-observer

or:

npm run security:tunnel-replica-health

when the metrics endpoints are directly reachable.

The observer returns machine-readable JSON containing replica names, HA connection counts, health state, active streams, retry counts, request-error counters, and findings.

It never emits tunnel tokens or metrics endpoint URLs.

## Fail-closed behavior

The command exits non-zero when:

- fewer than two replica endpoints are configured;
- a metrics endpoint is unreachable;
- a replica has fewer than the required HA connections;
- heartbeat retries are present;
- endpoint configuration is malformed.

## Operational SLO

Target for staging and production:

- both replicas healthy;
- 4 or more active HA connections per replica;
- zero heartbeat retries at observation time;
- direct origin remains closed.

A single degraded replica is an operational warning even while the public hostname remains available, because redundancy margin has been reduced.

## Cloudflare basis

Cloudflare documents the Prometheus endpoint and cloudflared_tunnel_ha_connections metric in its Tunnel observability documentation. Cloudflare also describes a healthy tunnel as active and serving through four connections.
