BEGIN;

CREATE TYPE reservation_economics_status AS ENUM ('draft','finalized');
CREATE TYPE reservation_economics_source AS ENUM ('manual','contract','provider');

CREATE TABLE reservation_economic_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  currency char(3) NOT NULL,
  net_collected_minor bigint NOT NULL CHECK (net_collected_minor >= 0),
  platform_commission_minor bigint NOT NULL CHECK (platform_commission_minor >= 0),
  owner_payable_minor bigint NOT NULL CHECK (owner_payable_minor >= 0),
  taxes_withheld_minor bigint NOT NULL DEFAULT 0 CHECK (taxes_withheld_minor >= 0),
  other_deductions_minor bigint NOT NULL DEFAULT 0 CHECK (other_deductions_minor >= 0),
  status reservation_economics_status NOT NULL DEFAULT 'draft',
  source_kind reservation_economics_source NOT NULL,
  source_reference text,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  payment_state_hash char(64) NOT NULL,
  ledger_journal_id uuid REFERENCES ledger_journals(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  finalized_by_user_id uuid REFERENCES users(id),
  finalized_by_membership_id uuid REFERENCES organization_memberships(id),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key),
  UNIQUE(reservation_id,version),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (length(request_hash)=64),
  CHECK (length(payment_state_hash)=64),
  CHECK (source_reference IS NULL OR length(source_reference)<=200),
  CHECK (
    net_collected_minor =
      platform_commission_minor
      + owner_payable_minor
      + taxes_withheld_minor
      + other_deductions_minor
  ),
  CHECK (
    (status='draft' AND finalized_at IS NULL AND finalized_by_user_id IS NULL AND finalized_by_membership_id IS NULL)
    OR
    (status='finalized' AND finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL AND finalized_by_membership_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX reservation_economic_one_finalized_idx
  ON reservation_economic_snapshots(reservation_id)
  WHERE status='finalized';

CREATE INDEX reservation_economic_property_status_idx
  ON reservation_economic_snapshots(organization_id,property_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION app.assert_reservation_economic_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid;
  v_property uuid;
  v_currency char(3);
BEGIN
  SELECT organization_id,property_id,currency
    INTO v_org,v_property,v_currency
    FROM reservations
   WHERE id=NEW.reservation_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ECONOMICS_RESERVATION_NOT_FOUND';
  END IF;
  IF v_org<>NEW.organization_id OR v_property<>NEW.property_id THEN
    RAISE EXCEPTION 'ECONOMICS_RESERVATION_SCOPE_MISMATCH';
  END IF;
  IF v_currency<>NEW.currency THEN
    RAISE EXCEPTION 'ECONOMICS_CURRENCY_MISMATCH';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reservation_economic_scope_check
BEFORE INSERT OR UPDATE ON reservation_economic_snapshots
FOR EACH ROW EXECUTE FUNCTION app.assert_reservation_economic_scope();

CREATE OR REPLACE FUNCTION app.prevent_finalized_economics_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF OLD.status='finalized' THEN
    RAISE EXCEPTION 'finalized reservation economics are immutable';
  END IF;
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$;

CREATE TRIGGER reservation_economic_finalized_immutable
BEFORE UPDATE OR DELETE ON reservation_economic_snapshots
FOR EACH ROW EXECUTE FUNCTION app.prevent_finalized_economics_mutation();

ALTER TABLE reservation_economic_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_economic_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY reservation_economic_tenant
ON reservation_economic_snapshots
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE OR REPLACE VIEW reservation_economic_reconciliation
WITH (security_invoker=true) AS
WITH payment_state AS (
  SELECT
    r.organization_id,
    r.id AS reservation_id,
    r.currency,
    COALESCE(SUM(pi.captured_minor),0)::bigint AS captured_minor,
    COALESCE(SUM(pi.refunded_minor),0)::bigint AS refunded_minor
  FROM reservations r
  LEFT JOIN payment_intents pi
    ON pi.reservation_id=r.id
   AND pi.organization_id=r.organization_id
  GROUP BY r.organization_id,r.id,r.currency
)
SELECT
  s.organization_id,
  s.property_id,
  s.reservation_id,
  s.id AS economics_snapshot_id,
  s.version,
  s.currency,
  s.net_collected_minor AS snapshot_net_collected_minor,
  (p.captured_minor-p.refunded_minor)::bigint AS current_net_collected_minor,
  (
    (p.captured_minor-p.refunded_minor)-s.net_collected_minor
  )::bigint AS net_drift_minor,
  CASE
    WHEN (p.captured_minor-p.refunded_minor)=s.net_collected_minor THEN 'reconciled'
    ELSE 'drifted'
  END AS reconciliation_status,
  s.finalized_at
FROM reservation_economic_snapshots s
JOIN payment_state p
  ON p.organization_id=s.organization_id
 AND p.reservation_id=s.reservation_id
WHERE s.status='finalized';

COMMIT;
