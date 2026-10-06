#!/usr/bin/env bash
set -euo pipefail

BASE_FILE="${BASE_FILE:-docker-compose.core-tunnel.yml}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.12.1}"
STAGING_URL="${VIEWS_STAGING_CORE_URL:-}"
ACK="${VIEWS_NAMED_TUNNEL_PROOF_ACK:-}"
EXPECTED_ACK="I_UNDERSTAND_STAGING_CONNECTORS_WILL_BE_RESTARTED"

compose() {
  docker compose -f "$BASE_FILE" "$@"
}

restore_connectors() {
  compose up -d cloudflared-a cloudflared-b >/dev/null 2>&1 || true
}
trap restore_connectors EXIT

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "missing required environment: $name"
  fi
}

wait_container_running() {
  local service="$1"
  for attempt in $(seq 1 45); do
    local id
    id="$(compose ps -q "$service")"
    if [ -n "$id" ]; then
      local state
      state="$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null || true)"
      if [ "$state" = "running" ]; then
        return 0
      fi
    fi
    if [ "$attempt" -eq 45 ]; then
      fail "$service did not become running"
    fi
    sleep 2
  done
}

wait_public_path() {
  local label="$1"
  local path="$2"
  local expected="$3"
  local consecutive=0

  for attempt in $(seq 1 60); do
    local status
    status="$(
      curl --silent --output "/tmp/${label}.body"         --write-out '%{http_code}'         --max-time 10         "${STAGING_URL%/}$path" || true
    )"

    if [ "$status" = "$expected" ]; then
      consecutive=$((consecutive+1))
      if [ "$consecutive" -ge 3 ]; then
        printf '%s' "$status"
        return 0
      fi
    else
      consecutive=0
    fi

    if [ "$attempt" -eq 60 ]; then
      echo "$label expected HTTP $expected but last status was $status" >&2
      cat "/tmp/${label}.body" >&2 2>/dev/null || true
      return 1
    fi
    sleep 2
  done
}

prove_public_stack() {
  local label="$1"

  local health
  local readiness
  local guest

  health="$(wait_public_path "${label}-health" "/health" "200")"
  readiness="$(wait_public_path "${label}-readiness" "/readiness" "200")"

  guest="$(
    curl --silent --output "/tmp/${label}-guest.body"       --write-out '%{http_code}'       --max-time 10       --request POST       --header 'content-type: application/json'       --data '{"token":"fixture"}'       "${STAGING_URL%/}/v1/guest-auth/exchange" || true
  )"
  if [ "$guest" != "401" ]; then
    echo "$label expected guest-auth HTTP 401, got $guest" >&2
    cat "/tmp/${label}-guest.body" >&2 2>/dev/null || true
    return 1
  fi

  printf '%s,%s,%s' "$health" "$readiness" "$guest"
}

require_env CLOUDFLARE_TUNNEL_TOKEN
require_env DATABASE_URL
require_env POSTGRES_PASSWORD
require_env GUEST_AUTH_RATE_LIMIT_SECRET
require_env VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
require_env VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
require_env VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY
require_env VIEWS_STAGING_CORE_URL

if [ "$ACK" != "$EXPECTED_ACK" ]; then
  fail "set VIEWS_NAMED_TUNNEL_PROOF_ACK=$EXPECTED_ACK to arm staging failover proof"
fi

case "$STAGING_URL" in
  https://*) ;;
  *) fail "VIEWS_STAGING_CORE_URL must use https://";;
esac

if [ "$CLOUDFLARE_TUNNEL_TOKEN" = "proof-unused" ]; then
  fail "Quick-Tunnel placeholder token is not allowed for named-tunnel proof"
fi

echo "[1/9] Validate the rendered production HA topology"
umask 077
TOPOLOGY_FILE="$(mktemp)"
trap 'rm -f "$TOPOLOGY_FILE"; restore_connectors' EXIT
docker compose -f "$BASE_FILE" config --format json >"$TOPOLOGY_FILE"
node scripts/core-origin-isolation-gate.mjs --file="$TOPOLOGY_FILE"

echo "[2/9] Ensure Core and both named-tunnel replicas are running"
compose up -d core cloudflared-a cloudflared-b
wait_container_running core
wait_container_running cloudflared-a
wait_container_running cloudflared-b

echo "[3/9] Establish stable-hostname baseline with both replicas"
IFS=',' read -r BASE_HEALTH BASE_READY BASE_GUEST   <<<"$(prove_public_stack baseline)"
echo "PASS: stable staging hostname is healthy with both replicas"

echo "[4/9] Stop replica B and prove the same hostname through replica A"
compose stop cloudflared-b
IFS=',' read -r A_HEALTH A_READY A_GUEST   <<<"$(prove_public_stack replica-a-only)"
echo "PASS: stable hostname survived with replica A only"

echo "[5/9] Restore replica B"
compose up -d cloudflared-b
wait_container_running cloudflared-b
wait_public_path "replica-b-restored" "/health" "200" >/dev/null

echo "[6/9] Stop replica A and prove the same hostname through replica B"
compose stop cloudflared-a
IFS=',' read -r B_HEALTH B_READY B_GUEST   <<<"$(prove_public_stack replica-b-only)"
echo "PASS: stable hostname survived with replica B only"

echo "[7/9] Restore replica A and prove both replicas healthy again"
compose up -d cloudflared-a
wait_container_running cloudflared-a
IFS=',' read -r FINAL_HEALTH FINAL_READY FINAL_GUEST   <<<"$(prove_public_stack restored)"
echo "PASS: both named-tunnel replicas restored"

echo "[8/9] Re-prove no direct Core host listener and no proxy spoof bypass"
CORE_CONTAINER_ID="$(compose ps -q core)"
[ -n "$CORE_CONTAINER_ID" ] || fail "Core container id is unavailable"
PORT_BINDINGS="$(
  docker inspect --format '{{json .HostConfig.PortBindings}}' "$CORE_CONTAINER_ID"
)"
if [ "$PORT_BINDINGS" != "{}" ] && [ "$PORT_BINDINGS" != "null" ]; then
  fail "Core unexpectedly has host port bindings"
fi
if curl --silent --show-error --fail --max-time 2     http://127.0.0.1:3001/health >/tmp/direct-origin.body 2>/dev/null; then
  fail "direct host access unexpectedly reached Core"
fi

INGRESS_NETWORK="$(docker inspect   --format '{{range $name,$cfg := .NetworkSettings.Networks}}{{if eq $cfg.IPAddress "172.30.0.3"}}{{$name}}{{end}}{{end}}'   "$CORE_CONTAINER_ID")"
[ -n "$INGRESS_NETWORK" ] || fail "unable to resolve Core ingress network"

UNTRUSTED_STATUS="$(
  docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"     --silent --output /dev/null --write-out '%{http_code}'     --request POST     --header 'content-type: application/json'     --header 'cf-connecting-ip: 203.0.113.55'     --data '{"token":"fixture"}'     http://core:3001/v1/guest-auth/exchange
)"
[ "$UNTRUSTED_STATUS" = "403" ]   || fail "forged forwarded identity expected 403, got $UNTRUSTED_STATUS"
echo "PASS: direct origin remains closed and untrusted proxy spoof remains denied"

echo "[9/9] Write named-tunnel failover evidence"
cat >/tmp/stage7.15-named-tunnel-proof.json <<JSON
{
  "schemaVersion": 1,
  "stage": "7.15",
  "result": "pass",
  "transport": "cloudflare_named_tunnel",
  "stableHostname": "$STAGING_URL",
  "connectorCount": 2,
  "sameNamedTunnelFailoverProven": true,
  "directOriginReachable": false,
  "untrustedPeerSpoofStatus": $UNTRUSTED_STATUS,
  "baseline": {
    "healthStatus": $BASE_HEALTH,
    "readinessStatus": $BASE_READY,
    "trustedGuestAuthStatus": $BASE_GUEST
  },
  "replicaAOnly": {
    "healthStatus": $A_HEALTH,
    "readinessStatus": $A_READY,
    "trustedGuestAuthStatus": $A_GUEST
  },
  "replicaBOnly": {
    "healthStatus": $B_HEALTH,
    "readinessStatus": $B_READY,
    "trustedGuestAuthStatus": $B_GUEST
  },
  "restored": {
    "healthStatus": $FINAL_HEALTH,
    "readinessStatus": $FINAL_READY,
    "trustedGuestAuthStatus": $FINAL_GUEST
  }
}
JSON
cat /tmp/stage7.15-named-tunnel-proof.json
