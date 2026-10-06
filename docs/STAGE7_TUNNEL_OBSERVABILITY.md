# Stage 7.15 — Tunnel Replica Observability and SLO

## Goal

Detect named-tunnel connector degradation before redundancy is lost, while keeping metrics private.

Cloudflare cloudflared exposes a Prometheus metrics endpoint. The VIEWS HA baseline binds each replica metrics server to port 2000 only inside the internal tunnel_metrics Docker network.

## Two observation modes

### Named-tunnel HA mode

Primary SLI:

cloudflared_tunnel_ha_connections

Cloudflare documents a healthy tunnel as serving through four active connections.

VIEWS production/staging classification:

- healthy: 4 or more active HA connections;
- degraded: 1-3;
- down: 0.

This is the default observer mode and is required by the persistent named-tunnel proof.

### Quick-Tunnel scrape mode

Quick Tunnels are development/testing transport and are not used as the production HA signal.

The CI acceptance harness uses:

--mode=scrape

This verifies that each private cloudflared Prometheus endpoint is reachable and exposes the documented build_info gauge. The observed cloudflared_tunnel_ha_connections value is still recorded but is not used to grade Quick Tunnel health.

Public HTTP health/readiness and connector failover behavior remain separate assertions in the Quick Tunnel proof.

## Secondary named-tunnel signals

The observer also records:

- cloudflared_tunnel_timer_retries;
- cloudflared_tunnel_active_streams;
- cloudflared_tunnel_request_errors.

A non-zero timer retry gauge is surfaced as a named-tunnel finding.

Request errors are reported for diagnosis but are not treated as a snapshot failure because a counter needs a time-window delta to define an error-rate SLI.

## Network boundary

The metrics endpoint is never published to the host or Internet.

Both cloudflared replicas join tunnel_metrics.

The tunnel-observer joins only tunnel_metrics.

Core never joins tunnel_metrics.

## Commands

Named-tunnel HA SLO:

docker compose --profile ops run --rm tunnel-observer

Quick Tunnel scrape validation:

docker compose --profile ops run --rm tunnel-observer node /ops/tunnel-replica-observer.mjs --mode=scrape

## Fail-closed behavior

Named-tunnel HA mode exits non-zero if:

- fewer than two replica endpoints are configured;
- an endpoint is unreachable;
- a replica has fewer than four active HA connections;
- heartbeat retries are present;
- configuration is malformed.

Scrape mode exits non-zero if:

- fewer than two endpoints are configured;
- an endpoint is unreachable;
- the response is not valid cloudflared Prometheus output containing build_info.

## Operational target

Persistent staging and production target:

- both replicas healthy;
- at least 4 active HA connections per replica;
- zero heartbeat retries at observation time;
- direct Core origin closed;
- metrics reachable only on tunnel_metrics.

Cloudflare's documentation describes cloudflared_tunnel_ha_connections as the active HA connection gauge and a healthy Tunnel as active through four connections.
