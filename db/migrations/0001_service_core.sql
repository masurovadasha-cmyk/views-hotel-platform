-- VIEWS service core foundation. PostgreSQL 15+
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS service_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 service_type text NOT NULL,
 fulfillment_status text NOT NULL DEFAULT 'draft',
 payment_status text NOT NULL DEFAULT 'unpaid',
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, idempotency_key),
 CHECK (fulfillment_status IN ('draft','awaiting_payment','confirmed','assigned','in_progress','completed','cancelled')),
 CHECK (payment_status IN ('unpaid','pending','paid','partially_refunded','refunded','failed'))
);
CREATE TABLE IF NOT EXISTS inventory_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 sku text NOT NULL,
 expires_at date,
 on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
 reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
 blocked boolean NOT NULL DEFAULT false,
 CHECK (reserved <= on_hand)
);
CREATE INDEX IF NOT EXISTS inventory_lots_fefo ON inventory_lots (organization_id,sku,expires_at);
CREATE TABLE IF NOT EXISTS stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 lot_id uuid NOT NULL REFERENCES inventory_lots(id),
 order_id uuid REFERENCES service_orders(id),
 movement_type text NOT NULL,
 quantity integer NOT NULL CHECK (quantity > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (movement_type IN ('receipt','reserve','release','consume','writeoff','adjustment'))
);
CREATE TABLE IF NOT EXISTS service_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 aggregate_id uuid NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS service_outbox_pending ON service_outbox(created_at) WHERE processed_at IS NULL;
-- Tenant isolation requires authenticated DB session context; never accept tenant ID from an untrusted client.
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_orders_tenant ON service_orders USING (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid) WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid);
CREATE POLICY inventory_lots_tenant ON inventory_lots USING (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid) WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid);
CREATE POLICY stock_movements_tenant ON stock_movements USING (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid) WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid);
CREATE POLICY service_outbox_tenant ON service_outbox USING (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid) WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true),'')::uuid);
