-- Stage 3.0: tenant-scoped reservations and durable idempotency
CREATE TABLE IF NOT EXISTS inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 lot_id uuid NOT NULL REFERENCES inventory_lots(id),
 quantity integer NOT NULL CHECK (quantity > 0),
 state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','consumed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,lot_id)
);
CREATE INDEX IF NOT EXISTS inventory_reservations_order_idx ON inventory_reservations(organization_id,order_id);
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_reservations_tenant ON inventory_reservations
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
-- The application DB role must not have BYPASSRLS and must not own these tables.
