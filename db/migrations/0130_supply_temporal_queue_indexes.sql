BEGIN;
CREATE INDEX supply_orders_property_created_idx ON supply_orders(organization_id,property_id,created_at DESC,id DESC);
CREATE INDEX supply_movements_property_created_idx ON supply_movements(organization_id,property_id,created_at DESC,id DESC);
COMMIT;
