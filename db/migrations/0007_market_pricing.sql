-- Stage 5.1: tenant-scoped price catalog and immutable order price snapshots.
CREATE TABLE IF NOT EXISTS market_catalog (
 organization_id uuid NOT NULL,
 sku text NOT NULL,
 name text NOT NULL,
 price_uzs bigint NOT NULL CHECK(price_uzs >= 0),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,sku)
);
ALTER TABLE market_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_catalog_tenant ON market_catalog
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS delivery_fee_uzs bigint NOT NULL DEFAULT 0 CHECK(delivery_fee_uzs >= 0);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS total_uzs bigint CHECK(total_uzs >= 0);
-- Legacy rows may have unknown prices. Never silently fabricate a historical amount.
