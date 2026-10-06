#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PROJECT="views-relay-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
OUTPUT="${VIEWS_RELAY_PROOF_OUTPUT:-/tmp/stage7.17-egress-relay-proof.json}"
WORK=""
STARTED=false
compose(){ docker compose -p "$PROJECT" -f docker-compose.core-tunnel.yml -f docker-compose.core-tunnel-proof.yml -f docker-compose.egress-relay-proof.yml "$@"; }
fail(){ echo "ERROR: $*" >&2; exit 1; }
cleanup(){
  local status=$?
  if [ "$STARTED" = true ]; then
    if [ "$status" -ne 0 ]; then compose logs --tail=50 egress-relay >&2 || true; fi
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  [ -z "$WORK" ] || rm -rf "$WORK"
  return "$status"
}
trap cleanup EXIT
[ "${VIEWS_EGRESS_PROOF_ACK:-}" = DISPOSABLE_DATABASE_ONLY ] || fail "disposable proof acknowledgement required"
for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON VIEWS_INTERNAL_PAGES_BFF_PUBLIC_KEY; do
  [ -n "${!name:-}" ] || fail "missing proof configuration: $name"
done
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"
umask 077
WORK="$(mktemp -d)"
printf '{"schemaVersion":2,"stage":"7.17","result":"fail","reason":"PROOF_INCOMPLETE"}\n' > "$OUTPUT"

echo '[1/8] Validate origin, direct-egress, relay and resolved-destination policies'
docker compose -p "$PROJECT" --profile ops -f docker-compose.core-tunnel.yml config --format json > "$WORK/topology.json"
node scripts/core-origin-isolation-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-boundary-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-relay-gate.mjs --file="$WORK/topology.json"
node scripts/relay-destination-policy-gate.mjs
node scripts/core-network-primitive-gate.mjs
node scripts/egress-domain-policy-gate.mjs
node scripts/egress-domain-policy-gate.mjs --file=infra/egress/proof-allowed-domains.txt

echo '[2/8] Start disposable database, restricted Core and relay'
STARTED=true
compose up -d postgres
compose run --rm migrate
compose up -d --build core egress-relay
CORE="$(compose ps -q core)"; RELAY="$(compose ps -q egress-relay)"
[ -n "$CORE" ] && [ -n "$RELAY" ] || fail 'Core or relay missing'

echo '[3/8] Verify private database/readiness path'
READY=false
for attempt in $(seq 1 45); do
  if docker exec "$CORE" node -e 'fetch("http://127.0.0.1:3001/readiness").then(async r=>{const j=await r.json();if(r.status!==200||j.status!=="ready"||j.database!=="ok")process.exit(1)}).catch(()=>process.exit(1))'; then READY=true; break; fi
  sleep 2
done
[ "$READY" = true ] || fail 'private readiness failed'

echo '[4/8] Measure direct Internet denial'
docker exec -i "$CORE" node --input-type=module - tcp 1.1.1.1 443 2500 < scripts/core-egress-probe.mjs > "$WORK/direct.json" || fail 'direct probe process failed'
node - "$WORK/direct.json" <<'NODE'
const v=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
if(v.attempted!==true||v.kind!=='tcp'||v.target!=='1.1.1.1'||v.port!==443||v.outcome!=='unreachable')process.exit(1);
NODE

echo '[5/8] Verify relay reachability and fixture DNS mappings'
READY=false
for attempt in $(seq 1 45); do
  if docker exec -i "$CORE" node --input-type=module - tcp egress-relay 3128 1500 < scripts/core-egress-probe.mjs > "$WORK/relay.json"; then
    if node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1]));if(v.attempted!==true||v.outcome!=="connected")process.exit(1)' "$WORK/relay.json"; then READY=true; break; fi
  fi
  sleep 2
done
[ "$READY" = true ] || fail 'relay did not become reachable'
docker exec "$RELAY" cat /etc/hosts > "$WORK/hosts.txt"
node - "$WORK/hosts.txt" <<'NODE'
const lines=require('node:fs').readFileSync(process.argv[2],'utf8').split(/\r?\n/).map(s=>s.trim().split(/\s+/));
for(const [host,ip] of [['private-v4.example.com','127.0.0.1'],['private-v6.example.com','::1']])
  if(!lines.some(words=>words[0]===ip&&words.slice(1).includes(host)))throw Error('DNS_FIXTURE_MISSING');
NODE
proxy_probe(){
  local mode="$1" host="$2" port="$3" label="$4" expected="$5"
  docker exec -i "$CORE" node --input-type=module - "$mode" egress-relay 3128 "$host" "$port" < scripts/egress-relay-probe.mjs > "$WORK/$label.json"
  node - "$WORK/$label.json" "$mode" "$host" "$port" "$expected" <<'NODE'
const fs=require('node:fs');const [file,mode,host,port,expected]=process.argv.slice(2);
const v=JSON.parse(fs.readFileSync(file,'utf8'));
if(v.attempted!==true||v.mode!==mode||v.targetHost!==host||v.targetPort!==Number(port)||v.outcome!=='response'||v.status!==Number(expected)){
  console.error(JSON.stringify({error:'PROXY_MEASUREMENT_MISMATCH',measurement:v,expected:Number(expected)}));process.exit(1);
}
NODE
}
echo '[6/8] Prove allowlisted external CONNECT succeeds'
proxy_probe connect example.com 443 allowed 200

echo '[7/8] Deny unapproved domain, plain HTTP, metadata and approved names resolving privately'
proxy_probe connect www.iana.org 443 denied-domain 403
proxy_probe http example.com 80 plain-http 403
proxy_probe connect 169.254.169.254 443 metadata 403
proxy_probe connect private-v4.example.com 443 private-v4 403
proxy_probe connect private-v6.example.com 443 private-v6 403
PORTS="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$RELAY")"
[ "$PORTS" = '{}' ] || [ "$PORTS" = null ] || fail 'relay host port published'

echo '[8/8] Write measured evidence using the actual checked policy files'
node --input-type=module - "$WORK" "$OUTPUT" <<'NODE'
import fs from 'node:fs';import path from 'node:path';
import {parseEgressDomainPolicy} from './scripts/egress-domain-policy-gate.mjs';
const [dir,out]=process.argv.slice(2);
const names=['allowed','denied-domain','plain-http','metadata','private-v4','private-v6'];
const measurements=Object.fromEntries(names.map(name=>[name,JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'))]));
for(const name of names)if(measurements[name].attempted!==true||measurements[name].status!==(name==='allowed'?200:403))throw Error('RELAY_PROOF_INCOMPLETE');
const productionAllowlist=parseEgressDomainPolicy(fs.readFileSync('infra/egress/allowed-domains.txt','utf8'));
if(JSON.stringify(productionAllowlist)!==JSON.stringify(['.views.invalid']))throw Error('PRODUCTION_PROVIDER_ACTIVATION_NOT_AUTHORIZED');
const report={schemaVersion:2,stage:'7.17',result:'pass',sourceCommit:process.env.GITHUB_SHA||null,checkedAt:new Date().toISOString(),
  mode:'controlled_https_forward_proxy',privateDatabaseReady:true,directInternetReachable:false,privateRelayReachable:true,
  allowlistedConnectStatus:measurements.allowed.status,deniedConnectStatus:measurements['denied-domain'].status,
  plainHttpStatus:measurements['plain-http'].status,metadataConnectStatus:measurements.metadata.status,
  approvedNamePrivateIpv4Status:measurements['private-v4'].status,approvedNamePrivateIpv6Status:measurements['private-v6'].status,
  relayHostPortPublished:false,productionAllowlist,proofAllowlist:parseEgressDomainPolicy(fs.readFileSync('infra/egress/proof-allowed-domains.txt','utf8')),
  measurements,limitations:['Controlled DNS-to-loopback cases, not exhaustive DNS-rebinding analysis','No real provider credentials or transactions']};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
NODE
cat "$OUTPUT"
