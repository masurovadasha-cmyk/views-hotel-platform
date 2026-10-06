#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="docker-compose.core-tunnel.yml"
MIGRATE="docker-compose.core-tunnel-proof.yml"
PAYME="docker-compose.payme-sandbox-proof.yml"
PROJECT="views-payme-proof-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
OUTPUT="/tmp/stage7.20-payme-sandbox-proof.json"
STARTED=false

compose(){
  docker compose -p "$PROJECT" -f "$BASE" -f "$MIGRATE" -f "$PAYME" "$@"
}
cleanup(){
  local status=$?
  if [ "$STARTED" = true ]; then
    if [ "$status" -ne 0 ]; then
      compose logs --tail=120 core postgres >&2 || true
    fi
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  return "$status"
}
trap cleanup EXIT

for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET; do
  [ -n "${!name:-}" ] || { echo "missing $name" >&2; exit 2; }
done
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

echo "[1/7] Apply all migrations through 0036"
STARTED=true
compose up -d postgres
compose run --rm migrate
PG="$(compose ps -q postgres)"
[ -n "$PG" ] || { echo "postgres missing" >&2; exit 1; }

echo "[2/7] Seed one disposable Payme-backed reservation and payment intent"
docker exec "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations(
  id,type,legal_name,display_name,country_code,default_currency,timezone
) VALUES(
  '73000000-0000-4000-8000-000000000001','host',
  'Payme Sandbox Org','{"en":"Payme Sandbox Org"}','UZ','UZS','Asia/Tashkent'
);

INSERT INTO properties(
  id,organization_id,name,country_code,city,timezone
) VALUES(
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001',
  '{"en":"Sandbox Property"}','UZ','Tashkent','Asia/Tashkent'
);

INSERT INTO unit_types(id,property_id,name,max_guests)
VALUES(
  '73000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000002',
  '{"en":"Studio"}',2
);

INSERT INTO units(id,property_id,unit_type_id,code)
VALUES(
  '73000000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000003',
  'PAYME-1'
);

INSERT INTO rate_plans(
  id,property_id,unit_type_id,name,currency,base_nightly_minor,
  cancellation_policy_snapshot_template
) VALUES(
  '73000000-0000-4000-8000-000000000005',
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000003',
  '{"en":"Sandbox Flexible"}','UZS',500000,'{}'
);

INSERT INTO booking_quotes(
  id,organization_id,property_id,unit_id,rate_plan_id,
  check_in_at,check_out_at,guest_context,currency,
  accommodation_minor,discount_minor,charges_minor,total_minor,
  cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at
) VALUES(
  '73000000-0000-4000-8000-000000000006',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000005',
  now()+interval '1 day',now()+interval '2 days',
  '{}'::jsonb,'UZS',500000,0,0,500000,
  '{}'::jsonb,'{}'::jsonb,repeat('a',64),now()+interval '2 hours'
);

INSERT INTO reservations(
  id,organization_id,property_id,unit_id,rate_plan_id,
  confirmation_code,status,check_in_at,check_out_at,currency,
  accommodation_minor,total_minor,cancellation_policy_snapshot,
  hold_expires_at,idempotency_key,quote_snapshot
) VALUES(
  '73000000-0000-4000-8000-000000000007',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000005',
  'PAYME-PROOF-1','hold',
  now()+interval '1 day',now()+interval '2 days',
  'UZS',500000,500000,'{}'::jsonb,
  now()+interval '2 hours','payme-proof-reservation',
  '{"quoteId":"73000000-0000-4000-8000-000000000006"}'::jsonb
);

INSERT INTO inventory_periods(
  id,organization_id,property_id,unit_id,kind,reservation_id,
  stay_period,expires_at
) VALUES(
  '73000000-0000-4000-8000-000000000008',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000004',
  'payment_hold',
  '73000000-0000-4000-8000-000000000007',
  tstzrange(now()+interval '1 day',now()+interval '2 days','[)'),
  now()+interval '2 hours'
);

INSERT INTO payment_intents(
  id,organization_id,reservation_id,quote_id,provider,status,
  amount_minor,currency,idempotency_key,expires_at
) VALUES(
  '73333333-3333-4333-8333-333333333333',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000007',
  '73000000-0000-4000-8000-000000000006',
  'payme','requires_payment',500000,'UZS','payme-proof-payment',
  now()+interval '2 hours'
);
SQL

echo "[3/8] Prove the restricted runtime can see only the seeded Payme tenant"
docker exec -e PGPASSWORD=views_app_proof_2026 "$PG" \
  psql -h 127.0.0.1 -U views_app -d views -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT set_config(
  'app.organization_id',
  '73000000-0000-4000-8000-000000000001',
  true
);
DO $
BEGIN
  IF (
    SELECT count(*)
    FROM payment_intents
    WHERE id='73333333-3333-4333-8333-333333333333'
      AND organization_id='73000000-0000-4000-8000-000000000001'
      AND provider='payme'
  )<>1 THEN
    RAISE EXCEPTION 'PAYME_RUNTIME_PAYMENT_INTENT_NOT_VISIBLE';
  END IF;
  IF (
    SELECT count(*)
    FROM reservations
    WHERE id='73000000-0000-4000-8000-000000000007'
      AND organization_id='73000000-0000-4000-8000-000000000001'
      AND status='hold'
  )<>1 THEN
    RAISE EXCEPTION 'PAYME_RUNTIME_RESERVATION_NOT_VISIBLE';
  END IF;
END
$;
ROLLBACK;
SQL

echo "[4/8] Start the sandbox-configured Core"
compose up -d --build core
NETWORK="${PROJECT}_core_ingress"
for attempt in $(seq 1 45); do
  if docker run --rm --network "$NETWORK" curlimages/curl:8.12.1       --fail --silent http://core:3001/readiness >/tmp/payme-ready.json 2>/dev/null; then
    break
  fi
  if [ "$attempt" -eq 45 ]; then
    echo "Core did not become ready" >&2
    exit 1
  fi
  sleep 2
done

echo "[5/8] Run official-style repeated Merchant API scenarios over HTTP"
docker run --rm --network "$NETWORK"   -e PAYME_PROOF_URL=http://core:3001/v1/payments/payme/merchant   -e PAYME_LOGIN=views-payme-test   -e PAYME_KEY=fixture-test-key-0123456789abcdef   -e PAYMENT_INTENT_ID=73333333-3333-4333-8333-333333333333   -v "$ROOT/scripts/payme-sandbox-protocol-proof.mjs:/proof.mjs:ro"   node:22-alpine node /proof.mjs > /tmp/payme-protocol.json
cat /tmp/payme-protocol.json

echo "[6/8] Verify financial and booking state after perform + cancel"
docker exec "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_state integer;
  v_captured bigint;
  v_refunded bigint;
  v_payment_status text;
  v_reservation_status text;
  v_transactions integer;
  v_inbox integer;
  v_posted integer;
BEGIN
  SELECT state INTO v_state
  FROM payme_merchant_transactions
  WHERE payme_transaction_id='aaaaaaaaaaaaaaaaaaaaaaaa';

  SELECT captured_minor,refunded_minor,status
    INTO v_captured,v_refunded,v_payment_status
  FROM payment_intents
  WHERE id='73333333-3333-4333-8333-333333333333';

  SELECT status INTO v_reservation_status
  FROM reservations
  WHERE id='73000000-0000-4000-8000-000000000007';

  SELECT count(*) INTO v_transactions
  FROM provider_transactions
  WHERE payment_intent_id='73333333-3333-4333-8333-333333333333'
    AND provider='payme';

  SELECT count(*) INTO v_inbox
  FROM payment_webhook_inbox
  WHERE payment_intent_id='73333333-3333-4333-8333-333333333333'
    AND provider='payme';

  SELECT count(*) INTO v_posted
  FROM ledger_journals
  WHERE reference_type='payment_intent'
    AND reference_id='73333333-3333-4333-8333-333333333333'
    AND status='posted';

  IF v_state<>-2 THEN RAISE EXCEPTION 'PAYME_FINAL_STATE_INVALID'; END IF;
  IF v_captured<>500000 OR v_refunded<>500000 THEN
    RAISE EXCEPTION 'PAYME_FINANCIAL_TOTALS_INVALID';
  END IF;
  IF v_payment_status<>'refunded' THEN
    RAISE EXCEPTION 'PAYME_PAYMENT_STATUS_INVALID';
  END IF;
  IF v_reservation_status<>'cancelled' THEN
    RAISE EXCEPTION 'PAYME_RESERVATION_STATUS_INVALID';
  END IF;
  IF v_transactions<>2 THEN
    RAISE EXCEPTION 'PAYME_PROVIDER_TRANSACTION_COUNT_INVALID';
  END IF;
  IF v_inbox<>2 THEN
    RAISE EXCEPTION 'PAYME_INBOX_COUNT_INVALID';
  END IF;
  IF v_posted<2 THEN
    RAISE EXCEPTION 'PAYME_LEDGER_JOURNALS_MISSING';
  END IF;
END
$$;
SQL

echo "[7/8] Verify repeated RPC calls did not duplicate durable rows"
docker exec "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (
    SELECT count(*) FROM payme_merchant_transactions
    WHERE payment_intent_id='73333333-3333-4333-8333-333333333333'
  )<>1 THEN
    RAISE EXCEPTION 'PAYME_TRANSACTION_REPLAY_DUPLICATED';
  END IF;
  IF (
    SELECT count(*) FROM provider_transactions
    WHERE payment_intent_id='73333333-3333-4333-8333-333333333333'
  )<>2 THEN
    RAISE EXCEPTION 'PAYME_FINANCIAL_REPLAY_DUPLICATED';
  END IF;
END
$$;
SQL

echo "[8/8] Write combined evidence"
node --input-type=module - /tmp/payme-protocol.json "$OUTPUT" <<'NODE'
import fs from "node:fs";
const [protocolFile,out]=process.argv.slice(2);
const protocol=JSON.parse(fs.readFileSync(protocolFile,"utf8"));
if(protocol.result!=="pass")throw new Error("PROTOCOL_PROOF_FAILED");
const report={
  ...protocol,
  databaseStateVerified:true,
  paymentStatus:"refunded",
  reservationStatus:"cancelled",
  capturedMinor:"500000",
  refundedMinor:"500000",
  providerTransactions:2,
  webhookInboxRows:2,
  ledgerPostedJournalsAtLeast:2,
  officialSandboxCredentialsUsed:false,
  officialSandboxEndpointInvoked:false
};
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{mode:0o600});
NODE
cat "$OUTPUT"
