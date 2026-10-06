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

require_env POSTGRES_PASSWORD
require_env DATABASE_URL
require_env GUEST_AUTH_RATE_LIMIT_SECRET
require_env VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
require_env VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
require_env VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY

export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

echo "[1/7] Render and validate the production isolation profile"
docker compose -f "$BASE_FILE" config --format json >/tmp/views-core-tunnel-production.json
node scripts/core-origin-isolation-gate.mjs   --file=/tmp/views-core-tunnel-production.json

echo "[2/7] Start ephemeral Postgres and apply migrations in foreground"
compose up -d postgres
compose run --rm migrate

echo "[3/7] Start Core and Cloudflare Quick Tunnel, then verify private readiness"
compose up -d --build core cloudflared
for attempt in $(seq 1 45); do
  if docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"       --fail --silent --show-error       http://core:3001/readiness >/tmp/views-core-readiness.json 2>/dev/null; then
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

echo "[4/7] Prove the host has no direct Core origin listener"
if docker compose -f "$BASE_FILE" port core 3001 2>/tmp/views-core-port.err | grep -q .; then
  echo "Core unexpectedly has a published host port" >&2
  docker compose -f "$BASE_FILE" port core 3001 >&2 || true
  exit 1
fi
if curl --silent --show-error --fail --max-time 2     http://127.0.0.1:3001/health >/tmp/direct-origin-body 2>/tmp/direct-origin-error; then
  echo "Direct host access unexpectedly reached Core" >&2
  cat /tmp/direct-origin-body >&2 || true
  exit 1
fi
echo "PASS: 127.0.0.1:3001 is not reachable from the host"

echo "[5/7] Prove an untrusted private peer cannot forge CF client identity"
UNTRUSTED_STATUS="$(
  docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"     --silent --output /dev/null --write-out '%{http_code}'     --request POST     --header 'content-type: application/json'     --header 'cf-connecting-ip: 203.0.113.55'     --data '{"token":"fixture"}'     http://core:3001/v1/guest-auth/exchange
)"
if [ "$UNTRUSTED_STATUS" != "403" ]; then
  echo "Expected 403 from spoofing non-connector peer, got $UNTRUSTED_STATUS" >&2
  exit 1
fi
echo "PASS: spoofed forwarded identity from non-connector peer is denied"

echo "[6/7] Resolve the temporary Cloudflare Quick Tunnel URL"
TUNNEL_URL=""
for attempt in $(seq 1 60); do
  TUNNEL_URL="$(
    compose logs --no-color cloudflared 2>/dev/null       | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com'       | tail -n 1 || true
  )"
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "Quick Tunnel URL was not emitted" >&2
    compose logs cloudflared >&2 || true
    exit 1
  fi
  sleep 2
done
echo "Tunnel: $TUNNEL_URL"

echo "[7/7] Prove Cloudflare edge reaches Core only through the trusted connector"
for attempt in $(seq 1 45); do
  HEALTH_STATUS="$(
    curl --silent --output /tmp/tunnel-health.json       --write-out '%{http_code}'       --max-time 10       "$TUNNEL_URL/health" || true
  )"
  READY_STATUS="$(
    curl --silent --output /tmp/tunnel-readiness.json       --write-out '%{http_code}'       --max-time 10       "$TUNNEL_URL/readiness" || true
  )"
  if [ "$HEALTH_STATUS" = "200" ] && [ "$READY_STATUS" = "200" ]; then
    break
  fi
  if [ "$attempt" -eq 45 ]; then
    echo "Cloudflare Quick Tunnel did not reach healthy Core" >&2
    echo "health=$HEALTH_STATUS readiness=$READY_STATUS" >&2
    compose logs cloudflared core >&2 || true
    exit 1
  fi
  sleep 2
done

TRUSTED_STATUS="$(
  curl --silent --output /tmp/tunnel-guest-auth.json     --write-out '%{http_code}'     --max-time 10     --request POST     --header 'content-type: application/json'     --data '{"token":"fixture"}'     "$TUNNEL_URL/v1/guest-auth/exchange"
)"
if [ "$TRUSTED_STATUS" = "403" ]; then
  echo "Trusted Cloudflare connector path was rejected as an untrusted network" >&2
  cat /tmp/tunnel-guest-auth.json >&2 || true
  exit 1
fi
if [ "$TRUSTED_STATUS" != "401" ]; then
  echo "Expected invalid guest token to reach auth logic and return 401, got $TRUSTED_STATUS" >&2
  cat /tmp/tunnel-guest-auth.json >&2 || true
  exit 1
fi

cat >/tmp/stage7.15-tunnel-proof.json <<JSON
{
  "schemaVersion": 1,
  "stage": "7.15",
  "result": "pass",
  "transport": "cloudflare_quick_tunnel",
  "directOriginReachable": false,
  "untrustedPeerSpoofStatus": $UNTRUSTED_STATUS,
  "trustedTunnelGuestAuthStatus": $TRUSTED_STATUS,
  "healthStatus": $HEALTH_STATUS,
  "readinessStatus": $READY_STATUS
}
JSON
cat /tmp/stage7.15-tunnel-proof.json
