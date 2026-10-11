#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE_FILE="${BASE_FILE:-docker-compose.core-tunnel.yml}"
PROOF_FILE="${PROOF_FILE:-docker-compose.core-tunnel-proof.yml}"
PROJECT_NAME="views-egress-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
CONTROL_NAME="${PROJECT_NAME}-control"
CONTROL_NETWORK="${PROJECT_NAME}-external"
OUTPUT="${VIEWS_EGRESS_PROOF_OUTPUT:-/tmp/stage7.16-core-egress-proof.json}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.12.1}"
STARTED=false
WORK=""

compose() { docker compose -p "$PROJECT_NAME" -f "$BASE_FILE" -f "$PROOF_FILE" "$@"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
cleanup() {
  local status=$?
  if [ "$STARTED" = true ]; then
    docker rm -f "$CONTROL_NAME" >/dev/null 2>&1 || true
    docker network rm "$CONTROL_NETWORK" >/dev/null 2>&1 || true
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -z "$WORK" ] || rm -rf "$WORK"
  return "$status"
}
trap cleanup EXIT

# Never run the destructive disposable-DB fixture against an existing deployment.
[ "${VIEWS_EGRESS_PROOF_ACK:-}" = "DISPOSABLE_DATABASE_ONLY" ] || fail "disposable proof acknowledgement required"
for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY; do
  [ -n "${!name:-}" ] || fail "missing proof configuration: $name"
done
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"
umask 077
WORK="$(mktemp -d)"
printf '{"schemaVersion":2,"stage":"7.16","result":"fail","reason":"PROOF_INCOMPLETE"}\n' > "$OUTPUT"

pull_with_retry() {
  local image="$1"
  for attempt in 1 2 3; do
    if docker pull "$image"; then return 0; fi
    sleep "$attempt"
  done
  return 1
}

# Require both a successful process and a matching JSON measurement. Empty stdin
# can make `node -` exit 0 without executing anything; it must never count as proof.
probe() {
  local label="$1" container="$2" kind="$3" target="$4" port="$5" expected="$6"
  docker exec -i "$container" node --input-type=module - "$kind" "$target" "$port" 2500 \
    < scripts/core-egress-probe.mjs > "$WORK/$label.json" || return 1
  node - "$WORK/$label.json" "$kind" "$target" "$port" "$expected" <<'NODE'
const fs=require("node:fs");
const [file,kind,target,port,expected]=process.argv.slice(2);
const value=JSON.parse(fs.readFileSync(file,"utf8"));
if(value.schemaVersion!==1||value.attempted!==true||value.kind!==kind||value.target!==target||
   value.port!==(kind==="tcp"?Number(port):null)||value.outcome!==expected||
   !Number.isFinite(value.elapsedMs)){
  console.error(JSON.stringify({error:"UNEXPECTED_PROBE_EVIDENCE",kind,expected,measurement:value}));
  process.exit(1);
}
NODE
}

printf '[1/7] Validate source policy and rendered network topology\n'
docker compose -p "$PROJECT_NAME" --profile ops -f "$BASE_FILE" config --format json > "$WORK/topology.json"
node scripts/core-origin-isolation-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-boundary-gate.mjs --file="$WORK/topology.json"
node scripts/core-network-primitive-gate.mjs

printf '[2/7] Start the disposable database and restricted Core runtime\n'
STARTED=true
compose up -d postgres
compose run --rm migrate
compose up -d --build core
CORE="$(compose ps -q core)"
[ -n "$CORE" ] || fail "Core container missing"
pull_with_retry "$CURL_IMAGE"
READY=false
for attempt in $(seq 1 45); do
  if docker run --rm --network "${PROJECT_NAME}_core_ingress" "$CURL_IMAGE" \
    --fail --silent --show-error --max-time 3 http://core:3001/readiness > "$WORK/readiness.json" 2>/dev/null; then
    READY=true; break
  fi
  sleep 2
done
[ "$READY" = true ] || fail "private readiness failed"
node -e 'const r=JSON.parse(require("node:fs").readFileSync(process.argv[1]));if(r.status!=="ready"||r.database!=="ok")process.exit(1)' "$WORK/readiness.json"
probe private-db "$CORE" tcp postgres 5432 connected || fail "positive private DB probe failed"

printf '[3/7] Establish independently reachable TCP and HTTP controls\n'
pull_with_retry node:22-alpine
docker network create "$CONTROL_NETWORK" >/dev/null
docker run -d --rm --name "$CONTROL_NAME" --network "$CONTROL_NETWORK" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true node:22-alpine \
  node -e 'require("node:http").createServer((_q,r)=>{r.writeHead(204);r.end()}).listen(8080,"0.0.0.0")' >/dev/null
CONTROL_IP="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTROL_NAME")"
[ -n "$CONTROL_IP" ] || fail "control address unavailable"
CONTROL_READY=false
for attempt in 1 2 3; do
  if probe control-http "$CONTROL_NAME" http "http://$CONTROL_IP:8080/" 0 connected; then CONTROL_READY=true; break; fi
  sleep 1
done
[ "$CONTROL_READY" = true ] || fail "positive HTTP control failed"
PUBLIC_READY=false
for attempt in 1 2 3; do
  if probe public-control "$CONTROL_NAME" tcp 1.1.1.1 443 connected; then PUBLIC_READY=true; break; fi
  sleep 1
done
[ "$PUBLIC_READY" = true ] || fail "public positive control unavailable; isolation unproven"

printf '[4/7] Verify Core cannot reach the known reachable control network\n'
probe denied-control "$CORE" http "http://$CONTROL_IP:8080/" 0 unreachable || fail "Core reached external control network"
printf '[5/7] Verify public TCP and HTTPS reachability is denied\n'
probe public-tcp "$CORE" tcp 1.1.1.1 443 unreachable || fail "public TCP not denied"
probe public-https "$CORE" http https://1.1.1.1/ 0 unreachable || fail "public HTTPS not denied or probe inconclusive"
printf '[6/7] Verify link-local transport is unreachable without reading metadata\n'
probe metadata-tcp "$CORE" tcp 169.254.169.254 80 unreachable || fail "link-local transport not denied"

printf '[7/7] Write measured, validated evidence\n'
node - "$WORK" "$OUTPUT" <<'NODE'
const fs=require("node:fs");
const path=require("node:path");
const [dir,output]=process.argv.slice(2);
const names=["private-db","control-http","public-control","denied-control","public-tcp","public-https","metadata-tcp"];
const measurements=Object.fromEntries(names.map(name=>[name,JSON.parse(fs.readFileSync(path.join(dir,name+".json"),"utf8"))]));
const expected=["connected","connected","connected","unreachable","unreachable","unreachable","unreachable"];
if(names.some((name,index)=>measurements[name].attempted!==true||measurements[name].outcome!==expected[index]))
  throw new Error("EGRESS_EVIDENCE_INCOMPLETE");
const report={schemaVersion:2,stage:"7.16",result:"pass",mode:"default_deny",checkedAt:new Date().toISOString(),
  commit:process.env.GITHUB_SHA||null,privateDatabaseReady:true,positiveControlsProven:true,
  publicInternetTcpReachable:false,publicHttpsReachable:false,linkLocalMetadataReachable:false,
  controlledExternalServiceReachable:false,directNetworkPrimitiveGatePass:true,measurements,
  limitations:["IPv4 sampled transport proof; not an exhaustive network policy audit","DNS forwarding and host-root access are outside this proof"]};
fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
NODE
cat "$OUTPUT"
