#!/usr/bin/env bash
set -euo pipefail

BASE="\${STAGING_ORIGIN:?STAGING_ORIGIN is required}"
ORIGIN="$BASE"

remote_sql(){
  npx --yes wrangler@4 d1 execute views-staging --remote --yes --command "$1" >/dev/null
}

login(){
  local email="$1"
  local user_id="$2"
  local expected_role="$3"
  local cookie="$4"

  local token token_hash now expires token_id verify session
  token="$(node -e 'const c=require("node:crypto");process.stdout.write(c.randomUUID()+c.randomUUID())')"
  token_hash="$(node -e 'const c=require("node:crypto");process.stdout.write(c.createHash("sha256").update(process.argv[1]).digest("hex"))' "$token")"
  now="$(date +%s)"
  expires="$((now+900))"
  token_id="remote-\${GITHUB_RUN_ID:-manual}-\${GITHUB_RUN_ATTEMPT:-1}-\${user_id}"

  remote_sql "DELETE FROM email_login_tokens WHERE email='$email'; DELETE FROM app_sessions WHERE user_id='$user_id'; INSERT INTO email_login_tokens(id,email,token_hash,expires_unix) VALUES('$token_id','$email','$token_hash',$expires);"

  verify="$(curl -fsS -c "$cookie" \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    --data "$(printf '{"token":"%s"}' "$token")" \
    "$BASE/api/auth-verify")"

  VERIFY="$verify" node -e '
    const x=JSON.parse(process.env.VERIFY);
    if(!x.authenticated) throw new Error("verification failed");
  '

  session="$(curl -fsS -b "$cookie" "$BASE/api/session")"
  SESSION="$session" EXPECTED_ROLE="$expected_role" node -e '
    const x=JSON.parse(process.env.SESSION);
    if(!x.authenticated||x.session?.mode!=="staff") throw new Error("staff session missing");
    if(x.session.role!==process.env.EXPECTED_ROLE) throw new Error("unexpected role: "+x.session.role);
    if(!x.session.propertyIds?.includes("utower")) throw new Error("utower scope missing");
  '
}

READY="$(curl -fsS "$BASE/api/readiness")"
READY="$READY" node -e '
  const x=JSON.parse(process.env.READY);
  if(x.status!=="ready"||x.database!=="ok"||x.schema!=="ok") throw new Error("remote readiness failed");
'

remote_sql "
DELETE FROM operations_events WHERE aggregate_id LIKE 'hk:checkout:res-stage4-frontdesk:%';
DELETE FROM reservation_events WHERE reservation_id='res-stage4-frontdesk';
DELETE FROM outbox_events WHERE aggregate_type='reservation' AND aggregate_id='res-stage4-frontdesk';
DELETE FROM housekeeping_jobs WHERE reservation_id='res-stage4-frontdesk';
DELETE FROM stays WHERE reservation_id='res-stage4-frontdesk';
UPDATE reservations SET status='confirmed',version=1,updated_at=CURRENT_TIMESTAMP WHERE id='res-stage4-frontdesk';
UPDATE units SET status='available' WHERE id='unit-250';
"

login "frontdesk.staging@views.invalid" "u-front" "front_desk" /tmp/views-frontdesk.cookies

QUEUE="$(curl -fsS -b /tmp/views-frontdesk.cookies "$BASE/api/frontdesk-reservations?propertyId=utower")"
RES_ID="$(QUEUE="$QUEUE" node -e '
  const x=JSON.parse(process.env.QUEUE);
  const item=(x.items||[]).find(i=>i.confirmation_code==="VW-STAGE4-FD");
  if(!item||item.status!=="confirmed"||item.version!==1) process.exit(2);
  if(!["available","ready"].includes(item.unit_status)) process.exit(3);
  process.stdout.write(item.id);
')"

CHECKIN="$(curl -fsS -b /tmp/views-frontdesk.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"check_in","version":1}' "$RES_ID")" \
  "$BASE/api/frontdesk-action")"
CHECKIN="$CHECKIN" node -e '
  const x=JSON.parse(process.env.CHECKIN);
  if(x.status!=="checked_in"||x.version!==2||x.unitStatus!=="occupied") throw new Error("remote check-in failed");
'

CHECKOUT="$(curl -fsS -b /tmp/views-frontdesk.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"check_out","version":2}' "$RES_ID")" \
  "$BASE/api/frontdesk-action")"
CHECKOUT="$CHECKOUT" node -e '
  const x=JSON.parse(process.env.CHECKOUT);
  if(x.status!=="completed"||x.version!==3||x.unitStatus!=="dirty"||!x.housekeepingCreated) throw new Error("remote check-out failed");
'

login "cleaner.staging@views.invalid" "u-cleaner" "cleaner" /tmp/views-cleaner.cookies

JOBS="$(curl -fsS -b /tmp/views-cleaner.cookies "$BASE/api/housekeeping-jobs?propertyId=utower")"
HK_ID="$(JOBS="$JOBS" node -e '
  const x=JSON.parse(process.env.JOBS);
  const item=(x.items||[]).find(i=>i.reservation_id==="res-stage4-frontdesk");
  if(!item||item.status!=="dirty"||item.assigned_user_id!=="u-cleaner") process.exit(2);
  process.stdout.write(item.id);
')"

for action in start complete; do
  RESULT="$(curl -fsS -b /tmp/views-cleaner.cookies \
    -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
    --data "$(printf '{"id":"%s","action":"%s"}' "$HK_ID" "$action")" \
    "$BASE/api/housekeeping-action")"
  EXPECTED="$([ "$action" = "start" ] && echo cleaning || echo inspection)"
  RESULT="$RESULT" EXPECTED="$EXPECTED" node -e '
    const x=JSON.parse(process.env.RESULT);
    if(x.status!==process.env.EXPECTED) throw new Error("housekeeping "+process.env.EXPECTED+" transition failed");
  '
done

login "manager.staging@views.invalid" "u-manager" "general_manager" /tmp/views-manager.cookies

VERIFY_HK="$(curl -fsS -b /tmp/views-manager.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data "$(printf '{"id":"%s","action":"verify"}' "$HK_ID")" \
  "$BASE/api/housekeeping-action")"
VERIFY_HK="$VERIFY_HK" node -e '
  const x=JSON.parse(process.env.VERIFY_HK);
  if(x.status!=="ready") throw new Error("remote housekeeping verify failed");
'

QUEUE_AFTER="$(curl -fsS -b /tmp/views-frontdesk.cookies "$BASE/api/frontdesk-reservations?propertyId=utower")"
QUEUE_AFTER="$QUEUE_AFTER" node -e '
  const x=JSON.parse(process.env.QUEUE_AFTER);
  const item=(x.items||[]).find(i=>i.confirmation_code==="VW-STAGE4-FD");
  if(!item||item.status!=="completed"||item.version!==3||item.unit_status!=="ready") throw new Error("remote turnover not ready");
  if(item.stay_status!=="checked_out") throw new Error("remote stay not closed");
'

OBS="$(curl -fsS -b /tmp/views-manager.cookies "$BASE/api/operations-observability?propertyId=utower")"
OBS="$OBS" node -e '
  const x=JSON.parse(process.env.OBS);
  if(typeof x.outboxPending!=="number"||typeof x.outboxRetrying!=="number"||typeof x.outboxDeadLetter!=="number"||typeof x.outboxLeased!=="number") throw new Error("remote outbox metrics missing");
  const events=new Set((x.recentEvents||[]).map(e=>e.event_type));
  for(const required of ["reservation.check_in","reservation.check_out","housekeeping.start","housekeeping.complete","housekeeping.verify"]){
    if(!events.has(required)) throw new Error("remote observability missing "+required);
  }
'

IDEMPOTENCY_KEY="stage4-remote-\${GITHUB_RUN_ID:-manual}-\${GITHUB_RUN_ATTEMPT:-1}"
ORDER="$(curl -fsS -b /tmp/views-frontdesk.cookies \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data '{"propertyId":"utower","category":"concierge","title":"Stage 4 remote smoke","priority":"normal"}' \
  "$BASE/api/service-orders")"
ORDER_ID="$(ORDER="$ORDER" node -e '
  const x=JSON.parse(process.env.ORDER);
  if(!x.id||x.status!=="new") process.exit(2);
  process.stdout.write(x.id);
')"

for spec in "accept:1:accepted:2" "complete:2:done:3"; do
  IFS=: read -r action version expected next_version <<<"$spec"
  RESULT="$(curl -fsS -b /tmp/views-frontdesk.cookies \
    -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
    --data "$(printf '{"id":"%s","action":"%s","version":%s}' "$ORDER_ID" "$action" "$version")" \
    "$BASE/api/service-order-action")"
  RESULT="$RESULT" EXPECTED="$expected" NEXT_VERSION="$next_version" node -e '
    const x=JSON.parse(process.env.RESULT);
    if(x.status!==process.env.EXPECTED||x.version!==Number(process.env.NEXT_VERSION)) throw new Error("remote service order transition failed");
  '
done


OUTBOX_PROCESS="$(curl -fsS -b /tmp/views-manager.cookies \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  --data '{"limit":50}' \
  "$BASE/api/outbox-process")"
OUTBOX_PROCESS="$OUTBOX_PROCESS" node -e '
  const x=JSON.parse(process.env.OUTBOX_PROCESS);
  if(x.claimed<1||x.processed<1) throw new Error("remote outbox processor did not claim and deliver events");
  if(x.claimed<x.processed) throw new Error("remote outbox processed more events than claimed");
  if(x.deadLettered!==0) throw new Error("remote outbox dead-lettered an event");
  if(x.remaining!==0) throw new Error("remote outbox still has ready events");
'

OUTBOX_AFTER="$(curl -fsS -b /tmp/views-manager.cookies "$BASE/api/operations-observability?propertyId=utower")"
OUTBOX_AFTER="$OUTBOX_AFTER" node -e '
  const x=JSON.parse(process.env.OUTBOX_AFTER);
  if(x.outboxPending!==0||x.outboxRetrying!==0||x.outboxDeadLetter!==0||x.outboxLeased!==0){
    throw new Error("remote outbox recovery/lease metrics are not clean");
  }
'

echo "PASS: Stage 4 remote Cloudflare Golden Flow"
