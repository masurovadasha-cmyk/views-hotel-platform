-- Stage 5.11: payment intent and provider event ledger, no card details.
CREATE TABLE IF NOT EXISTS service_payment_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 provider text NOT NULL CHECK(provider IN ('payme','click','uzum')),
 amount_uzs bigint NOT NULL CHECK(amount_uzs > 0),
 status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','succeeded','failed','cancelled','refunded')),
 idempotency_key text NOT NULL,
 provider_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS service_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 intent_id uuid NOT NULL REFERENCES service_payment_intents(id),
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,intent_id,provider_event_id)
);
ALTER TABLE service_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_payment_intents_tenant ON service_payment_intents
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY service_payment_events_tenant ON service_payment_events
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
