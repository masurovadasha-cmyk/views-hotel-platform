-- Stage 5.17: append-only payment ledger and refund requests.
CREATE TABLE IF NOT EXISTS service_payment_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 intent_id uuid NOT NULL REFERENCES service_payment_intents(id),
 order_id uuid NOT NULL REFERENCES service_orders(id),
 entry_type text NOT NULL CHECK(entry_type IN ('capture','refund','adjustment')),
 amount_uzs bigint NOT NULL CHECK(amount_uzs > 0),
 external_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_refund_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 intent_id uuid NOT NULL REFERENCES service_payment_intents(id),
 amount_uzs bigint NOT NULL CHECK(amount_uzs > 0),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','submitted','succeeded','failed','cancelled')),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE service_payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_payment_ledger_tenant ON service_payment_ledger
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY service_refund_requests_tenant ON service_refund_requests
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS service_payment_ledger_order ON service_payment_ledger(organization_id,order_id,created_at);
