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

assert_tcp_denied() {
  local container="$1"
  local host="$2"
  local port="$3"

  docker exec "$container" node - "$host" "$port" <<'NODE'
const net=require("node:net");
const host=process.argv[2];
const port=Number(process.argv[3]);
let finished=false;

function finish(code){
  if(finished)return;
  finished=true;
  clearTimeout(timer);
  try{socket.destroy()}catch{}
  process.exit(code);
}

const socket=net.connect({host,port});
socket.once("connect",()=>finish(1));
socket.once("error",()=>finish(0));
const timer=setTimeout(()=>finish(0),2000);
NODE
}

assert_https_denied() {
  local container="$1"
  local url="$2"

  docker exec "$container" node - "$url" <<'NODE'
const url=process.argv[2];
fetch(url,{signal:AbortSignal.timeout(2500)}).then(
  ()=>process.exit(1),
  ()=>process.exit(0)
);
NODE
}

require_env POSTGRES_PASSWORD
require_env DATABASE_URL
require_env GUEST_AUTH_RATE_LIMIT_SECRET
require_env VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
require_env VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON
require_env VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY

export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

echo "[1/7] Render and validate Core default-deny egress topology"
docker compose --profile ops -f "$BASE_FILE" config --format json   >/tmp/views-core-egress-topology.json
node scripts/core-origin-isolation-gate.mjs   --file=/tmp/views-core-egress-topology.json
node scripts/core-egress-boundary-gate.mjs   --file=/tmp/views-core-egress-topology.json
node scripts/core-network-primitive-gate.mjs

echo "[2/7] Start PostgreSQL and apply migrations"
compose up -d postgres
compose run --rm migrate

echo "[3/7] Start Core without any external-capable network"
compose up -d --build core

echo "[4/7] Prove private database/readiness path remains healthy"
pull_with_retry "$CURL_IMAGE"
for attempt in $(seq 1 45); do
  if docker run --rm --network "$INGRESS_NETWORK" "$CURL_IMAGE"       --fail --silent --show-error       http://core:3001/readiness       >/tmp/stage7.16-readiness.json 2>/dev/null; then
    break
  fi
  if [ "$attempt" -eq 45 ]; then
    echo "Core did not become ready with default-deny egress" >&2
    compose logs core postgres migrate >&2 || true
    exit 1
  fi
  sleep 2
done
cat /tmp/stage7.16-readiness.json

CORE_CONTAINER_ID="$(compose ps -q core)"
[ -n "$CORE_CONTAINER_ID" ] || {
  echo "Core container id unavailable" >&2
  exit 1
}

echo "[5/7] Prove raw public Internet TCP is denied"
if ! assert_tcp_denied "$CORE_CONTAINER_ID" "1.1.1.1" "443"; then
  echo "Core unexpectedly reached public Internet TCP 1.1.1.1:443" >&2
  exit 1
fi
echo "PASS: public Internet TCP is unreachable from Core"

echo "[6/7] Prove HTTPS and link-local metadata paths are denied"
if ! assert_https_denied "$CORE_CONTAINER_ID" "https://example.com/"; then
  echo "Core unexpectedly completed outbound HTTPS" >&2
  exit 1
fi
if ! assert_tcp_denied "$CORE_CONTAINER_ID" "169.254.169.254" "80"; then
  echo "Core unexpectedly reached link-local metadata address" >&2
  exit 1
fi
echo "PASS: outbound HTTPS and metadata address are unreachable from Core"

echo "[7/7] Write validated egress proof evidence"
cat >/tmp/stage7.16-core-egress-proof.json <<JSON
{
  "schemaVersion": 1,
  "stage": "7.16",
  "result": "pass",
  "mode": "default_deny",
  "privateDatabaseReady": true,
  "publicInternetTcpReachable": false,
  "publicHttpsReachable": false,
  "linkLocalMetadataReachable": false,
  "directNetworkPrimitiveGatePass": true
}
JSON
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"))'   /tmp/stage7.16-core-egress-proof.json
cat /tmp/stage7.16-core-egress-proof.json
