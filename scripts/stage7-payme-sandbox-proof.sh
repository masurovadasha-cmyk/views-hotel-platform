#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PROJECT="views-payme-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
OUTPUT="${VIEWS_PAYME_PROOF_OUTPUT:-/tmp/stage7.20-payme-sandbox-proof.json}"
STARTED=false
compose(){ docker compose -p "$PROJECT" -f docker-compose.core-tunnel.yml -f docker-compose.core-tunnel-proof.yml -f docker-compose.payme-sandbox-proof.yml "$@"; }
cleanup(){
  local code=$?
  if [ "$STARTED" = true ]; then
    if [ "$code" -ne 0 ]; then cat "$OUTPUT" >&2 2>/dev/null || true; compose logs --tail=35 core >&2 || true; fi
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  return "$code"
}
trap cleanup EXIT
for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET; do
  [ -n "${!name:-}" ] || { echo "missing $name" >&2; exit 2; }
done
# Refuse an external DB; all credentials here refer to this disposable project.
[ "$DATABASE_URL" = 'postgresql://views_app:views_app_proof_2026@postgres:5432/views' ] || { echo 'DISPOSABLE_DATABASE_REQUIRED' >&2; exit 2; }
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"
umask 077
printf '{"stage":"7.20","result":"fail","error":"PROOF_INCOMPLETE"}\n' > "$OUTPUT"
echo '[1/4] Create disposable PostgreSQL and apply all ordered migrations'
STARTED=true
compose up -d postgres
compose run --rm migrate
echo '[2/4] Build and start sandbox-only Core with restricted runtime DB role'
compose up -d --build core
CORE="$(compose ps -q core)"
[ -n "$CORE" ] || exit 1
READY=false
for attempt in $(seq 1 45); do
  if docker exec "$CORE" node -e 'fetch("http://127.0.0.1:3001/readiness").then(async r=>{const j=await r.json();if(r.status!==200||j.database!=="ok")process.exit(1)}).catch(()=>process.exit(1))'; then READY=true; break; fi
  sleep 2
done
[ "$READY" = true ] || exit 1
echo '[3/4] Run actual HTTP, concurrency, fault injection, financial and audit assertions'
# Forward source explicitly, then execute it in CommonJS module scope rather
# than stdin/global scope. Only this subprocess receives the fixture owner URL.
if [ "${VIEWS_PAYME_EXPIRY_PROOF:-false}" = true ]; then
  docker cp scripts/payme-expiry.integration.cjs "$CORE:/tmp/payme-expiry.integration.cjs"
fi
docker exec -i \
  -e "VIEWS_PAYME_EXPIRY_PROOF=${VIEWS_PAYME_EXPIRY_PROOF:-false}" \
  -e VIEWS_PAYME_PROOF_ACK=DISPOSABLE_DATABASE_ONLY \
  -e "PAYME_PROOF_ADMIN_DATABASE_URL=postgresql://views:${POSTGRES_PASSWORD}@postgres:5432/views" \
  -e "VIEWS_PROOF_SOURCE_SHA=$(git rev-parse HEAD)" \
  "$CORE" sh -c 'cat > /tmp/views-payme-proof.cjs && NODE_PATH=/app/node_modules node /tmp/views-payme-proof.cjs' < scripts/payme-lifecycle.integration.cjs > "$OUTPUT"
echo '[4/4] Validate measured evidence (empty output is failure)'
node - "$OUTPUT" <<'NODE'
const fs=require('node:fs');const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(report.result!=='pass'||report.checkCount<16||report.httpCalls<50||report.auditCounts?.attempts!==2||!report.atomicFailureRollbackVerified)throw Error('INCOMPLETE_PAYME_EVIDENCE');
console.log(JSON.stringify(report,null,2));
NODE
