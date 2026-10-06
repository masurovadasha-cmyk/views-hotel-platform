#!/usr/bin/env bash
set -euo pipefail

STAGING_URL="${VIEWS_STAGING_CORE_URL:-}"
METRICS_NETWORK="${VIEWS_TUNNEL_METRICS_NETWORK:-views-core-tunnel_tunnel_metrics}"
NODE_IMAGE="${VIEWS_TUNNEL_OBSERVER_IMAGE:-node:22-alpine}"
EVIDENCE_FILE="${VIEWS_TUNNEL_HEALTH_EVIDENCE_FILE:-/tmp/stage7.15-tunnel-health-watch.json}"
OBSERVER_FILE="/tmp/stage7.15-tunnel-health-observer.json"

fail() {
  local message="$*"
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::error title=VIEWS Tunnel Health::$message" >&2
  else
    echo "ERROR: $message" >&2
  fi
  exit 1
}

case "$STAGING_URL" in
  https://*) ;;
  *) fail "VIEWS_STAGING_CORE_URL must be an https:// staging URL";;
esac

if ! docker network inspect "$METRICS_NETWORK" >/dev/null 2>&1; then
  fail "metrics network is unavailable: $METRICS_NETWORK"
fi

echo "[1/4] Check both named-tunnel replica metrics against HA SLO"
if ! docker run --rm --pull=missing     --network "$METRICS_NETWORK"     --read-only     --cap-drop ALL     --security-opt no-new-privileges:true     -v "$PWD/scripts/tunnel-replica-observer.mjs:/ops/tunnel-replica-observer.mjs:ro"     "$NODE_IMAGE"     node /ops/tunnel-replica-observer.mjs       --endpoint=cloudflared-a=http://cloudflared-a:2000/metrics       --endpoint=cloudflared-b=http://cloudflared-b:2000/metrics       >"$OBSERVER_FILE"; then
  cat "$OBSERVER_FILE" >&2 2>/dev/null || true
  fail "one or more Cloudflare Tunnel replicas violated the HA SLO"
fi
cat "$OBSERVER_FILE"

check_public() {
  local label="$1"
  local path="$2"
  local expected="$3"
  local status=""

  for attempt in 1 2 3 4 5; do
    status="$(
      curl --silent --output "/tmp/${label}.body"         --write-out '%{http_code}'         --max-time 8         "${STAGING_URL%/}$path" || true
    )"
    if [ "$status" = "$expected" ]; then
      printf '%s' "$status"
      return 0
    fi
    sleep 2
  done

  echo "$label expected HTTP $expected but got $status" >&2
  cat "/tmp/${label}.body" >&2 2>/dev/null || true
  return 1
}

echo "[2/4] Check stable staging hostname"
HEALTH_STATUS="$(check_public health /health 200)"   || fail "staging health endpoint is unavailable"
READINESS_STATUS="$(check_public readiness /readiness 200)"   || fail "staging readiness endpoint is unavailable"

echo "[3/4] Re-prove direct Core host listener remains closed"
if curl --silent --show-error --fail --max-time 2     http://127.0.0.1:3001/health     >/tmp/stage7.15-direct-origin.body 2>/dev/null; then
  fail "direct Core listener became reachable on 127.0.0.1:3001"
fi

echo "[4/4] Write health-watch evidence"
OBSERVER_JSON="$(cat "$OBSERVER_FILE")"
cat >"$EVIDENCE_FILE" <<JSON
{
  "schemaVersion": 1,
  "stage": "7.15",
  "result": "pass",
  "stableHostname": "$STAGING_URL",
  "healthStatus": $HEALTH_STATUS,
  "readinessStatus": $READINESS_STATUS,
  "directOriginReachable": false,
  "observer": $OBSERVER_JSON
}
JSON
cat "$EVIDENCE_FILE"
