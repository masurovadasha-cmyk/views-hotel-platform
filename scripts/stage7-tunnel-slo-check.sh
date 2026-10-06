#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${VIEWS_TUNNEL_COMPOSE_PROJECT:-views-core-tunnel}"
METRICS_NETWORK="${PROJECT_NAME}_tunnel_metrics"
NODE_IMAGE="${VIEWS_TUNNEL_OBSERVER_IMAGE:-node:22-alpine}"
OUTPUT="${VIEWS_TUNNEL_SLO_OUTPUT:-/tmp/stage7.15-tunnel-slo.json}"
MIN_CONNECTIONS="${VIEWS_TUNNEL_MIN_HA_CONNECTIONS:-4}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

container_id() {
  local service="$1"
  docker ps     --filter "label=com.docker.compose.project=$PROJECT_NAME"     --filter "label=com.docker.compose.service=$service"     --format '{{.ID}}'     | head -n 1
}

for service in cloudflared-a cloudflared-b; do
  id="$(container_id "$service")"
  [ -n "$id" ] || fail "$service is not running"

  state="$(docker inspect --format '{{.State.Status}}' "$id")"
  [ "$state" = "running" ] || fail "$service state is $state"
done

docker network inspect "$METRICS_NETWORK" >/tmp/views-tunnel-network.json   || fail "metrics network $METRICS_NETWORK does not exist"

NETWORK_INTERNAL="$(
  docker network inspect     --format '{{.Internal}}'     "$METRICS_NETWORK"
)"
[ "$NETWORK_INTERNAL" = "true" ]   || fail "metrics network must remain internal"

ENDPOINTS='{"cloudflared-a":"http://cloudflared-a:2000/metrics","cloudflared-b":"http://cloudflared-b:2000/metrics"}'

umask 077
docker run --rm   --network "$METRICS_NETWORK"   --read-only   --cap-drop ALL   --security-opt no-new-privileges:true   -e "VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON=$ENDPOINTS"   -v "$PWD/scripts/tunnel-replica-observer.mjs:/ops/tunnel-replica-observer.mjs:ro"   "$NODE_IMAGE"   node /ops/tunnel-replica-observer.mjs     --min-connections="$MIN_CONNECTIONS"   >"$OUTPUT"

node -e '
  const fs=require("node:fs");
  const file=process.argv[1];
  const parsed=JSON.parse(fs.readFileSync(file,"utf8"));
  if(parsed.ok!==true)process.exit(1);
  if(parsed.replicaCount!==2)process.exit(1);
' "$OUTPUT"

cat "$OUTPUT"
