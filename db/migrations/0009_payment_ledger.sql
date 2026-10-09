-- Stage 5.3: payment attempts and refunds, no provider credentials or live charges.
CREATE TABLE IF NOT EXISTS service_payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 provider text NOT NULL CHECK(provider IN ('payme','click','uzum','sandbox')),
 merchant_reference text NOT NULL,
 provider_reference text,
 amount_uzs bigint NOT NULL CHECK(amount_uzs > 0),
 currency char(3) NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
 status text NOT NULL DEFAULT 'created'
  CHECK(status IN ('created','pending','succeeded','failed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,merchant_reference),
 UNIQUE(organization_id,provider,provider_reference)
);
CREATE INDEX IF NOT EXISTS service_payment_attempts_order_idx
 ON service_payment_attempts(organization_id,order_id,created_at);
CREATE TABLE IF NOT EXISTS service_payment_attempt_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 attempt_id uuid NOT NULL REFERENCES service_payment_attempts(id),
 provider text NOT NULL,
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 payload_digest text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS service_payment_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 attempt_id uuid NOT NULL REFERENCES service_payment_attempts(id),
 refund_reference text NOT NULL,
 amount_uzs bigint NOT NULL CHECK(amount_uzs > 0),
 status text NOT NULL DEFAULT 'requested'
  CHECK(status IN ('requested','pending','succeeded','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,refund_reference)
);
ALTER TABLE service_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_payment_attempt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_payment_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_attempts_tenant ON service_payment_attempts
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY payment_attempt_events_tenant ON service_payment_attempt_events
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY payment_refunds_tenant ON service_payment_refunds
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
-- Do not store PAN/CVV or raw payment provider secrets.
