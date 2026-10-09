BEGIN;
CREATE TABLE market_catalog_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 80),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 240),
  price_minor bigint NOT NULL CHECK(price_minor>=0),
  currency char(3) NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,property_id,sku)
);
ALTER TABLE market_catalog_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_catalog_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY market_catalog_prices_read ON market_catalog_prices FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND app.can_access_property(property_id)
);
-- Write policies intentionally omitted until authorized catalog administration exists.
COMMIT;
