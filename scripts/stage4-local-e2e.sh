#!/usr/bin/env bash
set -euo pipefail

BASE="https://127.0.0.1:8788"
ORIGIN="$BASE"
STATE_DIR=".wrangler/stage4-e2e"
LOG="/tmp/views-stage4-wrangler.log"
PROJECT_WRANGLER_BACKUP="/tmp/views-project-wrangler.toml"
WRANGLER_PID=""

cp wrangler.toml "$PROJECT_WRANGLER_BACKUP"
cp wrangler.local.toml wrangler.toml

rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"

cleanup(){
  status=$?
  if [ -n "$WRANGLER_PID" ]; then
    kill "$WRANGLER_PID" >/dev/null 2>&1 || true
    wait "$WRANGLER_PID" >/dev/null 2>&1 || true
  fi
  cp "$PROJECT_WRANGLER_BACKUP" wrangler.toml || true
  if [ "$status" -ne 0 ]; then
    echo "----- Wrangler log -----" >&2
    tail -200 "$LOG" >&2 || true
  fi
  exit "$status"
}
trap cleanup EXIT

npx --yes wrangler@4 d1 migrations apply views-local \
  --local \
  --persist-to "$STATE_DIR"

npx --yes wrangler@4 pages dev dist \
  --ip 127.0.0.1 \
  --port 8788 \
  --local-protocol=https \
  --persist-to "$STATE_DIR" \
  --log-level=warn \
  >"$LOG" 2>&1 &
WRANGLER_PID=$!

for _ in $(seq 1 60); do
  if curl -kfsS "$BASE/api/health" >/tmp/views-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

HEALTH="$(cat /tmp/views-health.json 2>/dev/null || true)"
test -n "$HEALTH" || { echo "Pages Functions did not start" >&2; exit 1; }
HEALTH="$HEALTH" node -e '
  const x=JSON.parse(process.env.HEALTH);
  if(x.status!=="ok") throw new Error("health failed");
'

READY="$(curl -kfsS "$BASE/api/readiness")"
READY="$READY" node -e '
  const x=JSON.parse(process.env.READY);
  if(x.status!=="ready"||x.database!=="ok"||x.schema!=="ok") throw new Error("readiness failed");
'

login(){
  local email="$1"
  local expected_role="$2"
  local cookie="$3"

  local auth token verify session
  auth="$(curl -kfsS \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    --data "$(printf '{"email":"%s"}' "$email")" \
    "$BASE/api/auth-email")"

  token="$(AUTH="$auth" node -e '
    const x=JSON.parse(process.env.AUTH);
    if(x.status!=="staging_token_created"||!x.token) process.exit(2);
    process.stdout.write(x.token);
  ')"

  verify="$(curl -kfsS -c "$cookie" \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    --data "$(printf '{"token":"%s"}' "$token")" \
    "$BASE/api/auth-verify")"

  VERIFY="$verify" node -e '
    const x=JSON.parse(process.env.VERIFY);
    if(!x.authenticated) throw new Error("verification failed");
  '

  session="$(curl -kfsS -b "$cookie" "$BASE/api/session")"
  SESSION="$session" EXPECTED_ROLE="$expected_role" node -e '
    const x=JSON.parse(process.env.SESSION);
    if(!x.authenticated||x.session?.mode!=="staff") throw new Error("staff session missing");
    if(x.session.role!==process.env.EXPECTED_ROLE) throw new Error("unexpected role: "+x.session.role);
    if(!x.session.propertyIds?.includes("utower")) throw new Error("utower scope missing");
  '
}

login "frontdesk.staging@views.invalid" "front_desk" /tmp/frontdesk.cookies

QUEUE="$(curl -kfsS -b /tmp/frontdesk.cookies "$BASE/api/frontdesk-reservations?propertyId=utower")"
RES_ID="$(QUEUE="$QUEUE" node -e '
  const x=JSON.parse(process.env.QUEUE);
  const item=x.items.find(i=>i.confirmation_code==="VW-STAGE4-FD");
  if(!item||item.status!=="confirmed"||item.version!==1) process.exit(2);
  if(!["available","ready"].includes(item.unit_status)) process.exit(3);
  process.stdout.write(item.id);
')"

CHECKIN="$(curl -kfsS -b /tmp/frontdesk.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"check_in","version":1}' "$RES_ID")" \
  "$BASE/api/frontdesk-action")"
CHECKIN="$CHECKIN" node -e '
  const x=JSON.parse(process.env.CHECKIN);
  if(x.status!=="checked_in"||x.version!==2||x.unitStatus!=="occupied") throw new Error("check-in failed");
'

CHECKOUT="$(curl -kfsS -b /tmp/frontdesk.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"check_out","version":2}' "$RES_ID")" \
  "$BASE/api/frontdesk-action")"
CHECKOUT="$CHECKOUT" node -e '
  const x=JSON.parse(process.env.CHECKOUT);
  if(x.status!=="completed"||x.version!==3||x.unitStatus!=="dirty"||!x.housekeepingCreated) throw new Error("check-out failed");
'

login "cleaner.staging@views.invalid" "cleaner" /tmp/cleaner.cookies

JOBS="$(curl -kfsS -b /tmp/cleaner.cookies "$BASE/api/housekeeping-jobs?propertyId=utower")"
HK_ID="$(JOBS="$JOBS" node -e '
  const x=JSON.parse(process.env.JOBS);
  const item=x.items.find(i=>i.reservation_id==="res-stage4-frontdesk");
  if(!item||item.status!=="dirty"||item.assigned_user_id!=="u-cleaner") process.exit(2);
  process.stdout.write(item.id);
')"

START="$(curl -kfsS -b /tmp/cleaner.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"start"}' "$HK_ID")" \
  "$BASE/api/housekeeping-action")"
START="$START" node -e 'const x=JSON.parse(process.env.START);if(x.status!=="cleaning")throw new Error("housekeeping start failed")'

COMPLETE="$(curl -kfsS -b /tmp/cleaner.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"complete"}' "$HK_ID")" \
  "$BASE/api/housekeeping-action")"
COMPLETE="$COMPLETE" node -e 'const x=JSON.parse(process.env.COMPLETE);if(x.status!=="inspection")throw new Error("housekeeping complete failed")'

login "manager.staging@views.invalid" "general_manager" /tmp/manager.cookies

VERIFY_HK="$(curl -kfsS -b /tmp/manager.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"verify"}' "$HK_ID")" \
  "$BASE/api/housekeeping-action")"
VERIFY_HK="$VERIFY_HK" node -e 'const x=JSON.parse(process.env.VERIFY_HK);if(x.status!=="ready")throw new Error("housekeeping verification failed")'

QUEUE_AFTER="$(curl -kfsS -b /tmp/frontdesk.cookies "$BASE/api/frontdesk-reservations?propertyId=utower")"
QUEUE_AFTER="$QUEUE_AFTER" node -e '
  const x=JSON.parse(process.env.QUEUE_AFTER);
  const item=x.items.find(i=>i.confirmation_code==="VW-STAGE4-FD");
  if(!item||item.status!=="completed"||item.version!==3||item.unit_status!=="ready") {
    throw new Error("turnover did not return unit to ready");
  }
  if(item.stay_status!=="checked_out") throw new Error("stay was not closed");
'

EXCEPTIONS="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/operations-exceptions?propertyId=utower")"
EXCEPTIONS="$EXCEPTIONS" node -e '
  const x=JSON.parse(process.env.EXCEPTIONS);
  if(!x.lostFound?.length) throw new Error("lost & found seed missing");
  if(!x.damage?.length) throw new Error("damage seed missing");
  if(!x.lowStock?.length) throw new Error("low stock seed missing");
'

HANDOVERS="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/shift-handover?propertyId=utower")"
HANDOVERS="$HANDOVERS" node -e '
  const x=JSON.parse(process.env.HANDOVERS);
  const item=x.items.find(i=>i.id==="handover-stage4");
  if(!item||!item.unresolved?.length||!item.risks?.length||!item.followUp?.length) throw new Error("handover seed missing");
'

SUMMARY="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/operations-summary?propertyId=utower")"
SUMMARY="$SUMMARY" node -e '
  const x=JSON.parse(process.env.SUMMARY);
  for(const key of ["lostFoundOpen","damageOpen","inventoryLow","serviceOrdersOpen"]){
    if(typeof x[key]!=="number") throw new Error("invalid operations summary: "+key);
  }
'

OBSERVABILITY="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/operations-observability?propertyId=utower")"
OBSERVABILITY="$OBSERVABILITY" node -e '
  const x=JSON.parse(process.env.OBSERVABILITY);
  if(typeof x.outboxPending!=="number") throw new Error("outbox backlog missing");
  for(const key of ["serviceOrders","housekeeping","maintenance"]){
    if(typeof x.stale?.[key]!=="number") throw new Error("stale metric missing: "+key);
  }
  const events=new Set((x.recentEvents||[]).map(e=>e.event_type));
  for(const required of ["reservation.check_in","reservation.check_out","housekeeping.start","housekeeping.complete","housekeeping.verify"]){
    if(!events.has(required)) throw new Error("observability missing "+required);
  }
'

GUEST360="$(curl -kfsS -b /tmp/frontdesk.cookies "$BASE/api/guest-360?propertyId=utower&guestId=guest-stage4-frontdesk")"
GUEST360="$GUEST360" node -e '
  const x=JSON.parse(process.env.GUEST360);
  if(x.guest?.id!=="guest-stage4-frontdesk") throw new Error("guest 360 profile missing");
  const reservation=x.reservations?.find(r=>r.id==="res-stage4-frontdesk");
  if(!reservation||reservation.status!=="completed"||reservation.stay_status!=="checked_out") {
    throw new Error("guest 360 stay history is stale");
  }
'

STAYCARD="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/stay-card?propertyId=utower&reservationId=res-stage4-frontdesk")"
STAYCARD="$STAYCARD" node -e '
  const x=JSON.parse(process.env.STAYCARD);
  if(x.reservation?.status!=="completed") throw new Error("stay card reservation status mismatch");
  if(x.reservation?.stay_status!=="checked_out") throw new Error("stay card stay not closed");
  if(x.reservation?.unit_status!=="ready") throw new Error("stay card unit not ready");
  if(x.operations?.latestHousekeeping?.status!=="ready") throw new Error("stay card housekeeping not ready");
'

UNITS="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/property-units?propertyId=utower")"
UNITS="$UNITS" node -e '
  const x=JSON.parse(process.env.UNITS);
  const unit=x.items?.find(u=>u.id==="unit-250");
  if(!unit||unit.status!=="ready") throw new Error("property units read model is stale");
'

TIMELINE="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/apartment-timeline?unitId=unit-250")"
TIMELINE="$TIMELINE" node -e '
  const x=JSON.parse(process.env.TIMELINE);
  if(x.unit?.id!=="unit-250"||x.unit?.status!=="ready") throw new Error("timeline unit snapshot mismatch");
  const events=new Set((x.items||[]).map(e=>e.event_type));
  for(const required of ["reservation.check_in","reservation.check_out","housekeeping.start","housekeeping.complete","housekeeping.verify"]){
    if(!events.has(required)) throw new Error("timeline missing "+required);
  }
'

INTEGRATIONS="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/integrations-status")"
INTEGRATIONS="$INTEGRATIONS" node -e '
  const x=JSON.parse(process.env.INTEGRATIONS);
  const byProvider=new Map((x.items||[]).map(i=>[i.provider,i]));
  for(const provider of ["airbnb","booking_com","ai_concierge"]){
    const item=byProvider.get(provider);
    if(!item) throw new Error("integration missing: "+provider);
    if(!Array.isArray(item.scopes)||!item.scopes.length) throw new Error("integration scopes missing: "+provider);
  }
  if(byProvider.get("airbnb").status!=="partner_access_required") throw new Error("airbnb status fabricated or stale");
  if(byProvider.get("booking_com").status!=="credentials_required") throw new Error("booking status fabricated or stale");
'

TEAM_BEFORE="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/team-workload?propertyId=utower")"
TEAM_BEFORE="$TEAM_BEFORE" node -e '
  const x=JSON.parse(process.env.TEAM_BEFORE);
  for(const user of ["u-cleaner","u-tech","u-front","u-manager"]){
    if(!(x.staff||[]).some(p=>p.userId===user)) throw new Error("team member missing: "+user);
  }
  if(typeof x.summary?.unassignedServiceOrders!=="number") throw new Error("team summary invalid");
'

ASSIGN_KEY="stage4-team-$RANDOM-$RANDOM"
TEAM_ORDER="$(curl -kfsS -b /tmp/manager.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $ASSIGN_KEY" \
  --data '{"propertyId":"utower","category":"cleaning","title":"Stage 4 assignment smoke","priority":"normal"}' \
  "$BASE/api/service-orders")"
TEAM_ORDER_ID="$(TEAM_ORDER="$TEAM_ORDER" node -e '
  const x=JSON.parse(process.env.TEAM_ORDER);
  if(!x.id||x.status!=="new") process.exit(2);
  process.stdout.write(x.id);
')"

BAD_ASSIGN_STATUS="$(curl -ksS -o /tmp/views-bad-assign.json -w "%{http_code}" -b /tmp/manager.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","assignedUserId":"u-tech","version":1}' "$TEAM_ORDER_ID")" \
  "$BASE/api/service-order-assign")"
test "$BAD_ASSIGN_STATUS" = "409"
BAD_ASSIGN="$(cat /tmp/views-bad-assign.json)"
BAD_ASSIGN="$BAD_ASSIGN" node -e '
  const x=JSON.parse(process.env.BAD_ASSIGN);
  if(x.error!=="ASSIGNEE_ROLE_MISMATCH") throw new Error("role mismatch assignment was not rejected");
'

ASSIGN="$(curl -kfsS -b /tmp/manager.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","assignedUserId":"u-cleaner","version":1}' "$TEAM_ORDER_ID")" \
  "$BASE/api/service-order-assign")"
ASSIGN="$ASSIGN" node -e '
  const x=JSON.parse(process.env.ASSIGN);
  if(x.status!=="assigned"||x.version!==2||x.assignedUserId!=="u-cleaner"||x.assigneeRole!=="cleaner"){
    throw new Error("valid team assignment failed");
  }
'

TEAM_AFTER="$(curl -kfsS -b /tmp/manager.cookies "$BASE/api/team-workload?propertyId=utower")"
TEAM_AFTER="$TEAM_AFTER" node -e '
  const x=JSON.parse(process.env.TEAM_AFTER);
  const cleaner=(x.staff||[]).find(p=>p.userId==="u-cleaner"&&p.role==="cleaner");
  if(!cleaner||cleaner.openServiceOrders<1) throw new Error("assigned order missing from cleaner workload");
'

echo "PASS: Stage 4 local Pages + D1 golden flow"
