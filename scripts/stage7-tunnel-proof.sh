#!/usr/bin/env bash
set -euo pipefail

BASE_FILE="${BASE_FILE:-docker-compose.core-tunnel.yml}"
PROOF_FILE="${PROOF_FILE:-docker-compose.core-tunnel-proof.yml}"
PROJECT_NAME="views-core-tunnel"
INGRESS_NETWORK="${PROJECT_NAME}_core_ingress"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.12.1}"

compose() {
  docker compose -f "$BASE_FILE" -f "$PROOF_FILE" "$@"
}

pull_with_retry() {
  local image="$1"
  for attempt in 1 2 3 4; do
    if docker pull "$image"; then
      return 0
    fi
    if [ "$attempt" -eq 4 ]; then
      echo "Unable to pull $image after retries" >&2
      return 1
    fi
    sleep $((attempt*2))
  done
}

wait_tunnel_observer() {
  local min_connections="$1"
  local output_file="$2"
  local error_file="${output_file}.err"

  for attempt in $(seq 1 60); do
    if compose --profile ops run --rm tunnel-observer \
        node /ops/tunnel-replica-observer.mjs \
        --mode=scrape \
        >"$output_file" 2>"$error_file"; then
      cat "$output_file"
      return 0
    fi
    sleep 2
  done

  echo "Tunnel replica observer did not become healthy" >&2
  cat "$output_file" >&2 2>/dev/null || true
  cat "$error_file" >&2 2>/dev/null || true
  return 1
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "missing required proof environment: $name" >&2
    exit 2
  fi
}

resolve_tunnel_url() {
  local service="$1"
  local url=""
  for attempt in $(seq 1 60); do
    url="$(
      compose logs --no-color "$service" 2>/dev/null         | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com'         | tail -n 1 || true
    )"
    if [ -n "$url" ]; then
      printf '%s' "$url"
      return 0
    fi
    sleep 2
  done
  echo "Quick Tunnel URL was not emitted for $service" >&2
  compose logs "$service" >&2 || true
  return 1
}

prove_tunnel_path() {
  local label="$1"
  local url="$2"
  local health_status=""
  local readiness_status=""

  for attempt in $(seq 1 45); do
    health_status="$(
      curl --silent --output "/tmp/${label}-health.json"         --write-out '%{http_code}'         --max-time 10         "$url/health" || true
    )"
    readiness_status="$(
      curl --silent --output "/tmp/${label}-readiness.json"         --write-out '%{http_code}'         --max-time 10         "$url/readiness" || true
    )"
    if [ "$health_status" = "200" ] && [ "$readiness_status" = "200" ]; then
      break
    fi
    if [ "$attempt" -eq 45 ]; then
      echo "$label did not reach healthy Core" >&2
      echo "health=$health_status readiness=$readiness_status" >&2
      return 1
    fi
    sleep 2
  done

  local guest_status
  guest_status="$(
    curl --silent --output "/tmp/${label}-guest-auth.json"       --write-out '%{http_code}'       --max-time 10       --request POST       --header 'content-type: application/json'       --data '{"token":"fixture"}'       "$url/v1/guest-auth/exchange"
  )"
  if [ "$guest_status" = "403" ]; then
    echo "$label was rejected as an untrusted connector" >&2
    cat "/tmp/${label}-guest-auth.json" >&2 || true
    return 1
  fi
  if [ "$guest_status" != "401" ]; then
    echo "Expected $label invalid guest token to return 401, got $guest_status" >&2
    cat "/tmp/${label}-guest-auth.json" >&2 || true
    return 1
  fi

  printf '%s,%s,%s' "$health_status" "$readiness_status" "$guest_status"
}

require_env POSTGRES_PASSWORD
require_env DATABASE_URL
require_env GUEST_AUTH_RATE_LIMIT_SECRET
require_env VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
require_env VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
require_env VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY

export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

echo "[1/8] Render and validate the production HA isolation profile"
docker compose --profile ops -f "$BASE_FILE" config --format json   >/tmp/views-core-tunnel-production.json
node scripts/core-origin-isolation-gate.mjs   --file=/tmp/views-core-tunnel-production.json

echo "[2/8] Start ephemeral Postgres and apply migrations in foreground"
compose up -d postgres
compose run --rm migrate

echo "[3/8] Start Core and both Cloudflare connector processes"
pull_with_retry "cloudflare/cloudflared:latest"
pull_with_retry "$CURL_IMAGE"
compose up -d --build core cloudflared-a cloudflared-b

for attempt in $(seq 1 45); do
  if docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"       --fail --silent --show-error       http://core:3001/readiness       >/tmp/views-core-readiness.json 2>/dev/null; then
    cat /tmp/views-core-readiness.json
    break
  fi
  if [ "$attempt" -eq 45 ]; then
    echo "Core did not become ready on the private ingress network" >&2
    compose logs core migrate postgres >&2 || true
    exit 1
  fi
  sleep 2
done

echo "[4/9] Prove both replica metrics endpoints are reachable"
wait_tunnel_observer 1 /tmp/stage7.15-tunnel-metrics-proof.json

echo "[5/9] Prove the host has no direct Core origin listener"
CORE_CONTAINER_ID="$(compose ps -q core)"
if [ -z "$CORE_CONTAINER_ID" ]; then
  echo "Core container id is unavailable" >&2
  exit 1
fi
PORT_BINDINGS="$(
  docker inspect --format '{{json .HostConfig.PortBindings}}' "$CORE_CONTAINER_ID"
)"
if [ "$PORT_BINDINGS" != "{}" ] && [ "$PORT_BINDINGS" != "null" ]; then
  echo "Core unexpectedly has host port bindings: $PORT_BINDINGS" >&2
  exit 1
fi
if curl --silent --show-error --fail --max-time 2     http://127.0.0.1:3001/health     >/tmp/direct-origin-body 2>/tmp/direct-origin-error; then
  echo "Direct host access unexpectedly reached Core" >&2
  cat /tmp/direct-origin-body >&2 || true
  exit 1
fi
echo "PASS: 127.0.0.1:3001 is not reachable from the host"

echo "[6/9] Prove an untrusted private peer cannot forge CF client identity"
UNTRUSTED_STATUS="$(
  docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"     --silent --output /dev/null --write-out '%{http_code}'     --request POST     --header 'content-type: application/json'     --header 'cf-connecting-ip: 203.0.113.55'     --data '{"token":"fixture"}'     http://core:3001/v1/guest-auth/exchange
)"
if [ "$UNTRUSTED_STATUS" != "403" ]; then
  echo "Expected 403 from spoofing non-connector peer, got $UNTRUSTED_STATUS" >&2
  exit 1
fi
echo "PASS: spoofed forwarded identity from non-connector peer is denied"

echo "[7/9] Resolve independent Quick Tunnel URLs for both pinned connectors"
TUNNEL_A="$(resolve_tunnel_url cloudflared-a)"
TUNNEL_B="$(resolve_tunnel_url cloudflared-b)"
if [ "$TUNNEL_A" = "$TUNNEL_B" ]; then
  echo "Proof connectors unexpectedly resolved to the same Quick Tunnel URL" >&2
  exit 1
fi
echo "Connector A tunnel: $TUNNEL_A"
echo "Connector B tunnel: $TUNNEL_B"

echo "[8/9] Prove both pinned connector paths reach Core"
IFS=',' read -r A_HEALTH A_READY A_GUEST   <<<"$(prove_tunnel_path connector-a "$TUNNEL_A")"
IFS=',' read -r B_HEALTH B_READY B_GUEST   <<<"$(prove_tunnel_path connector-b "$TUNNEL_B")"
echo "PASS: connector A and B both reached Core through Cloudflare"

echo "[9/9] Stop connector A and prove connector B remains healthy"
compose stop cloudflared-a
SURVIVOR_STATUS="$(
  curl --silent --output /tmp/survivor-health.json     --write-out '%{http_code}'     --max-time 10     "$TUNNEL_B/health" || true
)"
if [ "$SURVIVOR_STATUS" != "200" ]; then
  echo "Connector B did not survive connector A stop: $SURVIVOR_STATUS" >&2
  compose logs cloudflared-b core >&2 || true
  exit 1
fi
echo "PASS: connector B remains healthy after connector A is stopped"

cat >/tmp/stage7.15-tunnel-proof.json <<JSON
{
  "schemaVersion": 2,
  "stage": "7.15",
  "result": "pass",
  "transport": "cloudflare_quick_tunnel_dual_connector",
  "connectorCount": 2,
  "directOriginReachable": false,
  "untrustedPeerSpoofStatus": $UNTRUSTED_STATUS,
  "metricsObserverPass": true,
  "connectorA": {
    "healthStatus": $A_HEALTH,
    "readinessStatus": $A_READY,
    "trustedGuestAuthStatus": $A_GUEST
  },
  "connectorB": {
    "healthStatus": $B_HEALTH,
    "readinessStatus": $B_READY,
    "trustedGuestAuthStatus": $B_GUEST
  },
  "survivingConnectorStatus": $SURVIVOR_STATUS,
  "sameNamedTunnelFailoverProven": false
}
JSON
node -e 'JSON.parse(require("node:fs").readFileSync("/tmp/stage7.15-tunnel-proof.json","utf8"))'
cat /tmp/stage7.15-tunnel-proof.json
