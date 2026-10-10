-- Stage 5.0: identify the authenticated principal who created an order.
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS created_by text;
CREATE INDEX IF NOT EXISTS service_orders_owner_idx ON service_orders(organization_id,created_by,id);
-- Before public guest access, legacy orders must be assigned and verified or kept
-- inaccessible to guests. Never infer owner from a property alone.
