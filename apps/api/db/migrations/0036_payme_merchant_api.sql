BEGIN;

CREATE TABLE payme_merchant_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
  payme_transaction_id char(24) NOT NULL,
  payme_time_ms bigint NOT NULL CHECK (payme_time_ms>0),
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  account jsonb NOT NULL,
  create_time_ms bigint NOT NULL CHECK (create_time_ms>0),
  perform_time_ms bigint NOT NULL DEFAULT 0 CHECK (perform_time_ms>=0),
  cancel_time_ms bigint NOT NULL DEFAULT 0 CHECK (cancel_time_ms>=0),
  state smallint NOT NULL CHECK (state IN (-2,-1,1,2)),
  reason smallint CHECK (reason IS NULL OR reason IN (1,2,3,4,5,10)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payme_transaction_id),
  CHECK (
    jsonb_typeof(account)='object'
    AND account ? 'payment_intent_id'
    AND jsonb_object_length(account)=1
  )
);

CREATE INDEX payme_merchant_transactions_org_time_idx
  ON payme_merchant_transactions(
    organization_id,payme_time_ms,id
  );

CREATE UNIQUE INDEX payme_merchant_active_intent_idx
  ON payme_merchant_transactions(payment_intent_id)
  WHERE state IN (1,2);

ALTER TABLE payme_merchant_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payme_merchant_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY payme_merchant_transactions_tenant
ON payme_merchant_transactions
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

COMMIT;
