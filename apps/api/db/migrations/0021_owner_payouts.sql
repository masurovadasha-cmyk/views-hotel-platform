BEGIN;

CREATE TYPE owner_payout_status AS ENUM (
  'pending','processing','submitted','confirmed','failed','manual_review','cancelled'
);

CREATE TABLE owner_payout_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  economics_snapshot_id uuid NOT NULL REFERENCES reservation_economic_snapshots(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  destination_ref text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  status owner_payout_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  external_payout_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by text,
  last_error_code text,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  ledger_journal_id uuid REFERENCES ledger_journals(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key),
  CHECK (length(provider) BETWEEN 1 AND 80),
  CHECK (provider ~ '^[a-z0-9_-]+$'),
  CHECK (length(destination_ref) BETWEEN 1 AND 200),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (length(request_hash)=64),
  CHECK (last_error_code IS NULL OR length(last_error_code)<=120),
  CHECK (
    (status='confirmed' AND confirmed_at IS NOT NULL AND ledger_journal_id IS NOT NULL)
    OR status<>'confirmed'
  ),
  CHECK (
    status NOT IN ('submitted','confirmed')
    OR external_payout_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX owner_payout_one_active_per_economics_idx
  ON owner_payout_instructions(economics_snapshot_id)
  WHERE status<>'cancelled';

CREATE INDEX owner_payout_due_idx
  ON owner_payout_instructions(
    organization_id,status,next_attempt_at,lease_until,created_at
  )
  WHERE status IN ('pending','processing','failed');

CREATE INDEX owner_payout_property_status_idx
  ON owner_payout_instructions(
    organization_id,property_id,status,created_at DESC
  );

CREATE TABLE owner_payout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_instruction_id uuid NOT NULL REFERENCES owner_payout_instructions(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  provider text NOT NULL,
  idempotency_key text NOT NULL,
  request_digest char(64) NOT NULL,
  attempt_status text NOT NULL,
  external_payout_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payout_instruction_id,attempt_number),
  CHECK (length(request_digest)=64),
  CHECK (length(error_code) <= 120 OR error_code IS NULL)
);

CREATE INDEX owner_payout_attempts_instruction_idx
  ON owner_payout_attempts(payout_instruction_id,created_at DESC);

CREATE OR REPLACE FUNCTION app.assert_owner_payout_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid;
  v_property uuid;
  v_reservation uuid;
  v_currency char(3);
  v_owner_payable bigint;
  v_status reservation_economics_status;
BEGIN
  SELECT
    organization_id,property_id,reservation_id,currency,owner_payable_minor,status
    INTO v_org,v_property,v_reservation,v_currency,v_owner_payable,v_status
    FROM reservation_economic_snapshots
   WHERE id=NEW.economics_snapshot_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PAYOUT_ECONOMICS_NOT_FOUND';
  END IF;
  IF v_status<>'finalized' THEN
    RAISE EXCEPTION 'PAYOUT_ECONOMICS_NOT_FINALIZED';
  END IF;
  IF v_org<>NEW.organization_id
     OR v_property<>NEW.property_id
     OR v_reservation<>NEW.reservation_id THEN
    RAISE EXCEPTION 'PAYOUT_ECONOMICS_SCOPE_MISMATCH';
  END IF;
  IF v_currency<>NEW.currency THEN
    RAISE EXCEPTION 'PAYOUT_CURRENCY_MISMATCH';
  END IF;
  IF v_owner_payable<>NEW.amount_minor THEN
    RAISE EXCEPTION 'PAYOUT_AMOUNT_MISMATCH';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER owner_payout_scope_check
BEFORE INSERT OR UPDATE OF
  organization_id,property_id,reservation_id,economics_snapshot_id,amount_minor,currency
ON owner_payout_instructions
FOR EACH ROW EXECUTE FUNCTION app.assert_owner_payout_scope();

ALTER TABLE owner_payout_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_payout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_payout_instructions FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_payout_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_payout_instructions_tenant
ON owner_payout_instructions
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY owner_payout_attempts_tenant
ON owner_payout_attempts
USING (
  EXISTS(
    SELECT 1
      FROM owner_payout_instructions p
     WHERE p.id=owner_payout_attempts.payout_instruction_id
       AND p.organization_id=app.current_organization_id()
  )
)
WITH CHECK (
  EXISTS(
    SELECT 1
      FROM owner_payout_instructions p
     WHERE p.id=owner_payout_attempts.payout_instruction_id
       AND p.organization_id=app.current_organization_id()
  )
);

CREATE OR REPLACE VIEW owner_payout_reconciliation
WITH (security_invoker=true) AS
WITH payout_ledger AS (
  SELECT
    p.id AS payout_instruction_id,
    COALESCE(SUM(
      CASE
        WHEN a.code='owner_payable' AND e.side='debit' THEN e.amount_minor
        ELSE 0
      END
    ),0)::bigint AS owner_payable_debit_minor
  FROM owner_payout_instructions p
  LEFT JOIN ledger_journals j
    ON j.id=p.ledger_journal_id
   AND j.status='posted'
  LEFT JOIN ledger_entries e
    ON e.journal_id=j.id
  LEFT JOIN ledger_accounts a
    ON a.id=e.account_id
  GROUP BY p.id
)
SELECT
  p.organization_id,
  p.property_id,
  p.reservation_id,
  p.id AS payout_instruction_id,
  p.economics_snapshot_id,
  p.provider,
  p.currency,
  p.amount_minor,
  p.status,
  p.external_payout_id,
  p.submitted_at,
  p.confirmed_at,
  p.ledger_journal_id,
  l.owner_payable_debit_minor,
  CASE
    WHEN p.status<>'confirmed' THEN 'pending'
    WHEN p.ledger_journal_id IS NULL THEN 'drifted'
    WHEN l.owner_payable_debit_minor=p.amount_minor THEN 'reconciled'
    ELSE 'drifted'
  END AS reconciliation_status
FROM owner_payout_instructions p
LEFT JOIN payout_ledger l
  ON l.payout_instruction_id=p.id;

COMMIT;
