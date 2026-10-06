#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="docker-compose.core-tunnel.yml"
PROOF="docker-compose.core-tunnel-proof.yml"
PROJECT="views-egress-audit-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
OUTPUT="/tmp/stage7.19-provider-egress-audit-proof.json"
STARTED=false

compose(){ docker compose -p "$PROJECT" -f "$BASE" -f "$PROOF" "$@"; }
cleanup(){
  local status=$?
  if [ "$STARTED" = true ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  return "$status"
}
trap cleanup EXIT

for name in POSTGRES_PASSWORD DATABASE_URL GUEST_AUTH_RATE_LIMIT_SECRET; do
  [ -n "${!name:-}" ] || { echo "missing $name" >&2; exit 2; }
done
export CLOUDFLARE_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-proof-unused}"

echo "[1/7] Apply all migrations including Stage 7.19"
STARTED=true
compose up -d postgres
compose run --rm migrate
PG="$(compose ps -q postgres)"
[ -n "$PG" ] || { echo "postgres container missing" >&2; exit 1; }

echo "[2/7] Seed two independent organizations"
docker exec "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations(
  id,type,legal_name,display_name,country_code,default_currency,timezone
) VALUES
('71000000-0000-4000-8000-000000000001','host','Audit Org A','{"en":"Audit A"}','UZ','UZS','Asia/Tashkent'),
('72000000-0000-4000-8000-000000000001','host','Audit Org B','{"en":"Audit B"}','UZ','UZS','Asia/Tashkent');
SQL

runtime_sql(){
  docker exec -e PGPASSWORD=views_app_proof_2026 "$PG"     psql -h 127.0.0.1 -U views_app -d views -v ON_ERROR_STOP=1 "$@"
} 

WHO="$(runtime_sql -Atc "SELECT current_user")"
test "$WHO" = "views_app"
CAN_INSERT="$(runtime_sql -Atc "SELECT has_table_privilege(current_user,'provider_egress_attempts','INSERT')")"
test "$CAN_INSERT" = "f"

echo "[3/7] Persist unknown delivery and reject request replay"
runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE
  v_id uuid;
  v_completed boolean;
  v_replay_blocked boolean:=false;
BEGIN
  v_id:=app.begin_provider_egress_attempt(
    'fixture','create',
    '71111111-1111-4111-8111-111111111111'::uuid,
    1000
  );
  IF v_id IS NULL THEN RAISE EXCEPTION 'AUDIT_BEGIN_FAILED'; END IF;

  v_completed:=app.complete_provider_egress_attempt(
    'fixture','create',
    '71111111-1111-4111-8111-111111111111'::uuid,
    'failed','unknown',NULL,'EGRESS_TRANSPORT_FAILED',37
  );
  IF v_completed IS NOT TRUE THEN RAISE EXCEPTION 'AUDIT_COMPLETE_FAILED'; END IF;

  BEGIN
    PERFORM app.begin_provider_egress_attempt(
      'fixture','create',
      '71111111-1111-4111-8111-111111111111'::uuid,
      1000
    );
  EXCEPTION WHEN others THEN
    v_replay_blocked:=position('PROVIDER_EGRESS_REQUEST_REPLAY' in SQLERRM)>0;
  END;
  IF v_replay_blocked IS NOT TRUE THEN
    RAISE EXCEPTION 'REQUEST_REPLAY_WAS_NOT_BLOCKED';
  END IF;

  IF (SELECT count(*) FROM provider_egress_attempts)<>1 THEN
    RAISE EXCEPTION 'UNEXPECTED_AUDIT_COUNT';
  END IF;
  IF (SELECT count(*) FROM provider_egress_reconciliation_queue
      WHERE reason='unknown_delivery' AND status='pending')<>1 THEN
    RAISE EXCEPTION 'UNKNOWN_DELIVERY_NOT_QUEUED';
  END IF;
END
$$;
ROLLBACK;
SQL

# Rollback above proves replay behavior without consuming fixture IDs.
# Recreate the persistent unknown-delivery fixture for the following tests.
runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
SELECT app.begin_provider_egress_attempt(
  'fixture','create',
  '71111111-1111-4111-8111-111111111111'::uuid,
  1000
);
SELECT app.complete_provider_egress_attempt(
  'fixture','create',
  '71111111-1111-4111-8111-111111111111'::uuid,
  'failed','unknown',NULL,'EGRESS_TRANSPORT_FAILED',37
);
COMMIT;
SQL

echo "[4/7] Prove runtime cannot mutate audit tables directly and tenants are isolated"
runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
DO $
DECLARE
  v_blocked boolean:=false;
  v_owner name;
  v_super boolean;
BEGIN
  BEGIN
    INSERT INTO provider_egress_attempts(
      organization_id,provider_id,operation_id,request_id,deadline_ms
    ) VALUES(
      '71000000-0000-4000-8000-000000000001','fixture','forged',
      '71111111-1111-4111-8111-222222222222',1000
    );
  EXCEPTION WHEN others THEN
    v_blocked:=true;
  END;

  IF v_blocked IS NOT TRUE THEN
    SELECT pg_get_userbyid(c.relowner)
      INTO v_owner
      FROM pg_class c
     WHERE c.oid='provider_egress_attempts'::regclass;
    SELECT rolsuper INTO v_super FROM pg_roles WHERE rolname=current_user;
    RAISE EXCEPTION
      'DIRECT_WRITE_NOT_BLOCKED user=% owner=% super=%',
      current_user,v_owner,v_super;
  END IF;
END
$;
ROLLBACK;
SQL

FOREIGN="$(runtime_sql -At <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','72000000-0000-4000-8000-000000000001',true);
SELECT count(*) FROM provider_egress_attempts;
SELECT count(*) FROM provider_egress_reconciliation_queue;
ROLLBACK;
SQL
)"
test "$(printf '%s\n' "$FOREIGN" | grep -c '^0$')" -ge 2

echo "[5/7] Convert stale started audit into reconciliation work"
runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
SELECT app.begin_provider_egress_attempt(
  'fixture','status',
  '71111111-1111-4111-8111-333333333333'::uuid,
  100
);
COMMIT;
SQL

docker exec "$PG" psql -U views -d views -v ON_ERROR_STOP=1 <<'SQL'
UPDATE provider_egress_attempts
SET started_at=now()-interval '2 minutes'
WHERE request_id='71111111-1111-4111-8111-333333333333'::uuid;
SQL

runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE v_count integer;
BEGIN
  v_count:=app.queue_stale_provider_egress_attempts(10);
  IF v_count<>1 THEN RAISE EXCEPTION 'STALE_ATTEMPT_NOT_QUEUED'; END IF;
  IF (SELECT count(*) FROM provider_egress_reconciliation_queue)<>2 THEN
    RAISE EXCEPTION 'RECONCILIATION_QUEUE_COUNT_INVALID';
  END IF;
END
$$;
COMMIT;
SQL

echo "[6/7] Claim, resolve and retry reconciliation leases"
runtime_sql <<'SQL'
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE
  v_queue uuid;
  v_status text;
BEGIN
  SELECT queue_id INTO v_queue
  FROM app.claim_provider_egress_reconciliation(
    '71333333-3333-4333-8333-333333333333'::uuid,1
  );
  IF v_queue IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_NOT_CLAIMED'; END IF;

  v_status:=app.finish_provider_egress_reconciliation(
    v_queue,
    '71333333-3333-4333-8333-333333333333'::uuid,
    true,'PROVIDER_CONFIRMED_NOT_APPLIED',60
  );
  IF v_status<>'resolved' THEN RAISE EXCEPTION 'RECONCILIATION_NOT_RESOLVED'; END IF;

  SELECT queue_id INTO v_queue
  FROM app.claim_provider_egress_reconciliation(
    '71444444-4444-4444-8444-444444444444'::uuid,1
  );
  IF v_queue IS NULL THEN RAISE EXCEPTION 'SECOND_RECONCILIATION_NOT_CLAIMED'; END IF;

  v_status:=app.finish_provider_egress_reconciliation(
    v_queue,
    '71444444-4444-4444-8444-444444444444'::uuid,
    false,'PROVIDER_STATUS_UNAVAILABLE',1
  );
  IF v_status<>'pending' THEN RAISE EXCEPTION 'RECONCILIATION_RETRY_NOT_SCHEDULED'; END IF;
END
$$;
COMMIT;
SQL

echo "[7/7] Verify safe outbox payload and write evidence"
runtime_sql -At <<'SQL' > /tmp/stage7.19-counts.txt
BEGIN;
SELECT set_config('app.organization_id','71000000-0000-4000-8000-000000000001',true);
SELECT count(*) FROM provider_egress_attempts;
SELECT count(*) FROM provider_egress_reconciliation_queue;
SELECT count(*) FROM outbox_events WHERE event_type='provider.egress.reconciliation_required';
SELECT count(*) FROM outbox_events WHERE event_type='provider.egress.reconciliation_resolved';
SELECT count(*) FROM outbox_events
 WHERE event_type LIKE 'provider.egress.%'
   AND (
     payload ? 'body'
     OR payload ? 'query'
     OR payload ? 'authorization'
     OR payload ? 'credential'
     OR payload ? 'token'
   );
ROLLBACK;
SQL

mapfile -t COUNTS < <(grep -E '^[0-9]+$' /tmp/stage7.19-counts.txt)
test "${COUNTS[0]}" = "2"
test "${COUNTS[1]}" = "2"
test "${COUNTS[2]}" = "2"
test "${COUNTS[3]}" = "1"
test "${COUNTS[4]}" = "0"

cat > "$OUTPUT" <<JSON
{
  "schemaVersion": 1,
  "stage": "7.19",
  "result": "pass",
  "attempts": 2,
  "reconciliationRows": 2,
  "reconciliationRequiredEvents": 2,
  "reconciliationResolvedEvents": 1,
  "unsafeOutboxPayloadFields": 0,
  "tenantIsolation": true,
  "directAuditMutationBlocked": true,
  "requestReplayBlocked": true,
  "staleStartedRecovered": true,
  "productionProviderActivated": false
}
JSON
cat "$OUTPUT"
