BEGIN;

CREATE TYPE payment_intent_status AS ENUM (
  'requires_payment','pending_provider','authorized','captured','partially_refunded','refunded','failed','cancelled'
);
CREATE TYPE payment_attempt_status AS ENUM (
  'created','redirected','authorized','captured','failed','cancelled'
);
CREATE TYPE provider_transaction_kind AS ENUM ('authorization','capture','refund','void');
CREATE TYPE ledger_account_type AS ENUM ('asset','liability','equity','revenue','expense');
CREATE TYPE ledger_entry_side AS ENUM ('debit','credit');
CREATE TYPE ledger_journal_status AS ENUM ('draft','posted','void');

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  quote_id uuid NOT NULL REFERENCES booking_quotes(id),
  provider text NOT NULL,
  status payment_intent_status NOT NULL DEFAULT 'requires_payment',
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  idempotency_key text NOT NULL,
  provider_customer_ref text,
  checkout_url text,
  expires_at timestamptz,
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
  refunded_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key),
  CHECK (captured_minor <= amount_minor),
  CHECK (refunded_minor <= captured_minor)
);
CREATE INDEX payment_intents_reservation_idx ON payment_intents(reservation_id,created_at DESC);
CREATE INDEX payment_intents_provider_status_idx ON payment_intents(provider,status,created_at);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status payment_attempt_status NOT NULL DEFAULT 'created',
  provider_attempt_ref text,
  checkout_url text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_attempts_intent_idx ON payment_attempts(payment_intent_id,created_at DESC);

CREATE TABLE payment_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  UNIQUE(provider,external_event_id)
);

CREATE TABLE provider_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  provider text NOT NULL,
  external_transaction_id text NOT NULL,
  kind provider_transaction_kind NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  occurred_at timestamptz NOT NULL,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,external_transaction_id,kind)
);
CREATE INDEX provider_transactions_intent_idx ON provider_transactions(payment_intent_id,occurred_at);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  account_type ledger_account_type NOT NULL,
  currency char(3) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code,currency)
);

CREATE TABLE ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  description text NOT NULL,
  status ledger_journal_status NOT NULL DEFAULT 'draft',
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX ledger_journals_reference_idx ON ledger_journals(reference_type,reference_id);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES ledger_journals(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id),
  side ledger_entry_side NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_journal_idx ON ledger_entries(journal_id);

CREATE OR REPLACE FUNCTION app.assert_journal_balanced(target_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  journal_status ledger_journal_status;
  debit_total bigint;
  credit_total bigint;
  currency_count integer;
BEGIN
  SELECT status INTO journal_status FROM ledger_journals WHERE id=target_journal_id;
  IF journal_status='posted' THEN
    SELECT
      COALESCE(SUM(CASE WHEN side='debit' THEN amount_minor ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN side='credit' THEN amount_minor ELSE 0 END),0),
      COUNT(DISTINCT currency)
    INTO debit_total,credit_total,currency_count
    FROM ledger_entries WHERE journal_id=target_journal_id;

    IF currency_count<>1 THEN
      RAISE EXCEPTION 'posted journal must contain exactly one currency';
    END IF;
    IF debit_total<>credit_total THEN
      RAISE EXCEPTION 'unbalanced journal: debit %, credit %',debit_total,credit_total;
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.check_ledger_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_journal_balanced(COALESCE(NEW.id,OLD.id));
  RETURN COALESCE(NEW,OLD);
END
$$;

CREATE CONSTRAINT TRIGGER ledger_journal_balance_check
AFTER INSERT OR UPDATE OF status ON ledger_journals
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_ledger_journal_balance();

CREATE OR REPLACE FUNCTION app.prevent_posted_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_journal uuid;
  target_status ledger_journal_status;
BEGIN
  target_journal:=COALESCE(NEW.journal_id,OLD.journal_id);
  SELECT status INTO target_status FROM ledger_journals WHERE id=target_journal;
  IF target_status='posted' THEN
    RAISE EXCEPTION 'posted ledger entries are immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$$;

CREATE TRIGGER ledger_entries_immutable_after_post
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.prevent_posted_ledger_mutation();

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger_journals FORCE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_intents_tenant ON payment_intents
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY payment_attempts_tenant ON payment_attempts
USING (EXISTS(
  SELECT 1 FROM payment_intents pi
  WHERE pi.id=payment_attempts.payment_intent_id
    AND pi.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM payment_intents pi
  WHERE pi.id=payment_attempts.payment_intent_id
    AND pi.organization_id=app.current_organization_id()
));

CREATE POLICY provider_transactions_tenant ON provider_transactions
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY ledger_accounts_tenant ON ledger_accounts
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY ledger_journals_tenant ON ledger_journals
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY ledger_entries_tenant ON ledger_entries
USING (EXISTS(
  SELECT 1 FROM ledger_journals j
  WHERE j.id=ledger_entries.journal_id
    AND j.organization_id=app.current_organization_id()
))
WITH CHECK (EXISTS(
  SELECT 1 FROM ledger_journals j
  WHERE j.id=ledger_entries.journal_id
    AND j.organization_id=app.current_organization_id()
));

COMMIT;
