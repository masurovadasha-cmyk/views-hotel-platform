#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
PROJECT="views-maintenance-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
WORK="$(mktemp -d)"; STARTED=false
OUTPUT="/tmp/stage7.22-staging-maintenance-proof.json"
base(){ docker compose -p "$PROJECT" -f docker-compose.core-tunnel.yml -f docker-compose.core-tunnel-proof.yml "$@"; }
ops(){ docker compose -p "$PROJECT" --profile maintenance -f docker-compose.core-tunnel.yml -f docker-compose.staging-maintenance.yml "$@"; }
cleanup(){
 local code=$?
 if [ "$STARTED" = true ]; then
   ops down -v --remove-orphans >/dev/null 2>&1 || true
   base down -v --remove-orphans >/dev/null 2>&1 || true
 fi
 rm -rf "$WORK"; return "$code"
}
trap cleanup EXIT
[ "${DATABASE_URL:-}" = 'postgresql://views_app:views_app_proof_2026@postgres:5432/views' ] || exit 2
[ "${VIEWS_EGRESS_PROOF_ACK:-}" = DISPOSABLE_DATABASE_ONLY ] || exit 2
umask 077
printf '{"stage":"7.22","result":"fail","reason":"PROOF_INCOMPLETE"}\n' > "$OUTPUT"
export CLOUDFLARE_TUNNEL_TOKEN=proof-unused
export VIEWS_STAGING_RELEASE_SHA="$(git rev-parse HEAD)"
export VIEWS_STAGING_COST_ACK=NO_NEW_SPEND
export VIEWS_PAYME_MODE=sandbox
export VIEWS_PAYME_ORGANIZATION_ID=73000000-0000-4000-8000-000000000001
export VIEWS_PAYME_MERCHANT_ID=0123456789abcdef01234567
export VIEWS_PAYME_MERCHANT_LOGIN=views-payme-test
export VIEWS_PAYME_TEST_KEY=fixture-test-key-0123456789abcdef
export VIEWS_PAYME_SANDBOX_ENABLED=true
export VIEWS_STAGING_MAINTENANCE_ENABLED=false
# Set before cleanup needs Compose interpolation; replaced by the actual local image.
export VIEWS_STAGING_CORE_IMAGE="sha256:$(printf '0%.0s' {1..64})"
STARTED=true
base up -d postgres
base run --rm migrate
PG="$(base ps -q postgres)"
docker exec -i "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
VALUES('73000000-0000-4000-8000-000000000001','host','MAINTENANCE FIXTURE','{"en":"TEST ONLY"}','UZ','UZS','Asia/Tashkent');
SQL
base build core
export VIEWS_STAGING_CORE_IMAGE="$(docker image inspect "$PROJECT-core" --format '{{.Id}}')"
ops --profile ops config --format json > "$WORK/topology.json"
node scripts/staging-maintenance-topology.mjs "$WORK/topology.json"
node scripts/core-origin-isolation-gate.mjs --file="$WORK/topology.json"
node scripts/core-egress-boundary-gate.mjs --file="$WORK/topology.json"
run_once(){ ops run --rm --no-deps -T payme-maintenance node /app/ops/staging-maintenance.mjs --once --ack=STAGING_MAINTENANCE_ONLY; }
run_once > "$WORK/disabled.json"
export VIEWS_STAGING_MAINTENANCE_ENABLED=true
run_once > "$WORK/first.json"
run_once > "$WORK/second.json"
ops run --rm --no-deps -T payme-maintenance node /app/ops/staging-maintenance.mjs --healthcheck > "$WORK/health.json"
ops run --rm --no-deps -T payme-maintenance node -e 'const fs=require("node:fs");console.log(fs.readFileSync("/var/lib/views-maintenance/latest.json","utf8"))' > "$WORK/persisted.json"
set +e
ops run --rm --no-deps -T -e VIEWS_ENV=production payme-maintenance node /app/ops/staging-maintenance.mjs --once --ack=STAGING_MAINTENANCE_ONLY > "$WORK/rejected.out" 2> "$WORK/rejected.err"
REJECT_STATUS=$?
set -e
[ "$REJECT_STATUS" = 2 ] || { echo 'production guard did not reject' >&2; exit 1; }
ops run --rm --no-deps -T payme-maintenance node -e 'const fs=require("node:fs");console.log(fs.readFileSync("/var/lib/views-maintenance/latest.json","utf8"))' > "$WORK/after-reject.json"
# Age the fixture receipt; the health command must fail instead of reusing a stale pass.
ops run --rm --no-deps -T payme-maintenance node -e 'const fs=require("node:fs"),p="/var/lib/views-maintenance/latest.json",r=JSON.parse(fs.readFileSync(p));r.finishedAt=new Date(Date.now()-3600000).toISOString();fs.writeFileSync(p,JSON.stringify(r));'
set +e
ops run --rm --no-deps -T payme-maintenance node /app/ops/staging-maintenance.mjs --healthcheck > "$WORK/stale.json"
STALE_STATUS=$?
set -e
[ "$STALE_STATUS" = 1 ] || exit 1
node --input-type=module - "$WORK" "$OUTPUT" <<'NODE'
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const [dir,out]=process.argv.slice(2),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));
const first=read('first'),second=read('second');
assert.equal(read('disabled').status,'disabled');
for(const r of [first,second]){assert.equal(r.status,'healthy');assert.equal(r.summary.candidates,0);assert.equal(r.release,process.env.GITHUB_SHA);}
assert.notEqual(first.runId,second.runId);assert.deepEqual(read('persisted'),second);assert.deepEqual(read('after-reject'),second);
assert.equal(read('health').healthy,true);assert.equal(read('stale').code,'HEARTBEAT_STALE');
const report={schemaVersion:1,stage:'7.22',result:'pass',sourceCommit:process.env.GITHUB_SHA,
 sharedImmutableImage:process.env.VIEWS_STAGING_CORE_IMAGE,realWorkerCliExecuted:true,isolatedRuns:2,receiptSurvivesContainerRecreation:true,
 productionGuardRejected:true,staleHeartbeatRejected:true,report:first,secondRunId:second.runId,
 persistentHostActivated:false,externalAlertDeliveryActivated:false,productionPayments:false,
 limitations:['Two real one-shot runs on disposable DB with no overdue records','Expiry state transitions are covered by the separate Stage 7.21 regression proof','Persistent scheduling on a user host is NOT activated']};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
NODE
