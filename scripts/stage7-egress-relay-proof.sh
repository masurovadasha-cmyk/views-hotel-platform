#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="docker-compose.core-tunnel.yml"
CORE_PROOF="docker-compose.core-tunnel-proof.yml"
RELAY_PROOF="docker-compose.egress-relay-proof.yml"
PROJECT="views-relay-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
OUTPUT="/tmp/stage7.17-egress-relay-proof.json"
WORK=""
STARTED=false

compose(){
  docker compose -p "$PROJECT" -f "$BASE" -f "$CORE_PROOF" -f "$RELAY_PROOF" "$@"
}
fail(){ echo "ERROR: $*" >&2; exit 1; }
cleanup(){
  local status=$?
  if [ "$STARTED" = true ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -z "$WORK" ] || rm -rf "$WORK"
  return "$status"
}
trap cleanup EXIT

[ "${VIEWS_EGRESS_PROOF_ACK:-}" = "DISPOSABLE_DATABASE_ONLY" ]   || fail "disposable proof acknowledgement required"

for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET   VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON   VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON   VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY; do
  [ -n "${!name:-}" ] || fail "missing proof configuration: $name"
done
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

umask 077
WORK="$(mktemp -d)"
printf '{"schemaVersion":1,"stage":"7.17","result":"fail","reason":"PROOF_INCOMPLETE"}\n' > "$OUTPUT"

echo "[1/8] Validate topology, source policy and domain policies"
docker compose -p "$PROJECT" --profile ops -f "$BASE" config --format json >"$WORK/topology.json"
node scripts/core-origin-isolation-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-boundary-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-relay-gate.mjs --file="$WORK/topology.json"
node scripts/core-network-primitive-gate.mjs
node scripts/egress-domain-policy-gate.mjs
node scripts/egress-domain-policy-gate.mjs --file=infra/egress/proof-allowed-domains.txt

echo "[2/8] Start disposable database, Core and egress relay"
STARTED=true
compose up -d postgres
compose run --rm migrate
compose up -d --build core egress-relay

CORE="$(compose ps -q core)"
RELAY="$(compose ps -q egress-relay)"
[ -n "$CORE" ] || fail "Core missing"
[ -n "$RELAY" ] || fail "egress relay missing"

echo "[3/8] Verify Core private readiness"
READY=false
for attempt in $(seq 1 45); do
  if docker exec "$CORE" node -e     'fetch("http://127.0.0.1:3001/readiness").then(async r=>{const j=await r.json();if(r.status!==200||j.status!=="ready"||j.database!=="ok")process.exit(1)}).catch(()=>process.exit(1))'; then
    READY=true
    break
  fi
  sleep 2
done
[ "$READY" = true ] || fail "Core readiness failed"

echo "[4/8] Prove Core still has no direct Internet path"
docker exec -i "$CORE" node --input-type=module - tcp 1.1.1.1 443 2500   < scripts/core-egress-probe.mjs >"$WORK/direct.json" || true
node - "$WORK/direct.json" <<'NODE'
const fs=require("node:fs");
const v=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(v.outcome!=="unreachable")process.exit(1);
NODE

echo "[5/8] Prove Core can reach only the private relay"
RELAY_READY=false
for attempt in $(seq 1 45); do
  RELAY_STATE="$(docker inspect --format '{{.State.Status}}' "$RELAY" 2>/dev/null || true)"
  if [ "$RELAY_STATE" != "running" ]; then
    echo "egress relay exited before becoming ready: $RELAY_STATE" >&2
    compose logs egress-relay >&2 || true
    exit 1
  fi
  if docker exec -i "$CORE" node --input-type=module - tcp egress-relay 3128 1500 \
      < scripts/core-egress-probe.mjs >"$WORK/relay.json" 2>"$WORK/relay.err"; then
    if node - "$WORK/relay.json" <<'NODE'
const fs=require("node:fs");
const v=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
process.exit(v.outcome==="connected"?0:1);
NODE
    then
      RELAY_READY=true
      break
    fi
  fi
  sleep 2
done
if [ "$RELAY_READY" != true ]; then
  echo "egress relay did not become reachable from Core" >&2
  cat "$WORK/relay.json" >&2 2>/dev/null || true
  cat "$WORK/relay.err" >&2 2>/dev/null || true
  compose logs egress-relay >&2 || true
  exit 1
fi

echo "[6/8] Prove allowlisted HTTPS CONNECT succeeds"
docker exec -i "$CORE" node --input-type=module -   connect egress-relay 3128 example.com 443   < scripts/egress-relay-probe.mjs >"$WORK/allowed.json"
node - "$WORK/allowed.json" <<'NODE'
const fs=require("node:fs");
const v=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(v.status!==200)process.exit(1);
NODE

echo "[7/8] Prove denied domain, plain HTTP and metadata targets are blocked"
for spec in   "connect www.iana.org 443 denied-domain"   "http example.com 80 plain-http"   "connect 169.254.169.254 443 metadata"; do
  set -- $spec
  mode="$1"; host="$2"; port="$3"; label="$4"
  docker exec -i "$CORE" node --input-type=module -     "$mode" egress-relay 3128 "$host" "$port"     < scripts/egress-relay-probe.mjs >"$WORK/$label.json"
  node - "$WORK/$label.json" <<'NODE'
const fs=require("node:fs");
const v=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(v.status!==403)process.exit(1);
NODE
done

PORT_BINDINGS="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$RELAY")"
[ "$PORT_BINDINGS" = "{}" ] || [ "$PORT_BINDINGS" = "null" ]   || fail "relay unexpectedly publishes a host port"

echo "[8/8] Write validated evidence"
node - "$WORK" "$OUTPUT" <<'NODE'
const fs=require("node:fs");
const path=require("node:path");
const [dir,out]=process.argv.slice(2);
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+".json"),"utf8"));
const report={
  schemaVersion:1,
  stage:"7.17",
  result:"pass",
  mode:"controlled_https_forward_proxy",
  directInternetReachable:false,
  privateRelayReachable:true,
  allowlistedConnectStatus:read("allowed").status,
  deniedConnectStatus:read("denied-domain").status,
  plainHttpStatus:read("plain-http").status,
  metadataConnectStatus:read("metadata").status,
  relayHostPortPublished:false,
  productionAllowlist:[".invalid"],
  proofAllowlist:[".example.com"]
};
if(
  report.allowlistedConnectStatus!==200||
  report.deniedConnectStatus!==403||
  report.plainHttpStatus!==403||
  report.metadataConnectStatus!==403
)throw new Error("RELAY_PROOF_INCOMPLETE");
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{mode:0o600});
NODE
cat "$OUTPUT"
