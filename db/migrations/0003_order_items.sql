-- Stage 3.1: durable order line items and idempotency fingerprint.
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE TABLE IF NOT EXISTS service_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE RESTRICT,
 sku text NOT NULL,
 quantity integer NOT NULL CHECK (quantity > 0),
 unit_price_uzs bigint CHECK (unit_price_uzs >= 0),
 UNIQUE(order_id,sku)
);
CREATE INDEX IF NOT EXISTS service_order_items_tenant_order ON service_order_items(organization_id,order_id);
ALTER TABLE service_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_order_items_tenant ON service_order_items
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
-- Before production, validate legacy orders and backfill request_fingerprint,
-- then enforce NOT NULL for new/legacy rows. Unit prices require server-side catalog lookup.
