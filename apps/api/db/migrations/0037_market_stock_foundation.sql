BEGIN;

-- Stage 7 inventory foundation: no write policies or public checkout routes.
-- Each SKU is scoped to an organization AND a property; no global shared stock.
CREATE TABLE market_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 80),
  on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand>=0),
  reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
  reorder_point integer NOT NULL DEFAULT 0 CHECK(reorder_point>=0),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,property_id,sku),
  UNIQUE(organization_id,id)
);
CREATE INDEX market_stock_low_idx
  ON market_stock_balances(organization_id,property_id,sku)
  WHERE on_hand<=reorder_point;

CREATE TABLE market_stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  stock_balance_id uuid NOT NULL,
  order_id uuid,
  movement_type text NOT NULL CHECK(movement_type IN ('receive','reserve','release','sale','adjustment','write_off')),
  quantity_delta integer NOT NULL,
  reservation_delta integer NOT NULL DEFAULT 0,
  actor_membership_id uuid REFERENCES organization_memberships(id),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,stock_balance_id) REFERENCES market_stock_balances(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,order_id) REFERENCES market_service_orders(organization_id,id) ON DELETE RESTRICT,
  CHECK((movement_type='reserve' AND quantity_delta=0 AND reservation_delta>0)
    OR (movement_type='release' AND quantity_delta=0 AND reservation_delta<0)
    OR (movement_type='sale' AND quantity_delta<0 AND reservation_delta<0)
    OR (movement_type NOT IN ('reserve','release','sale') AND reservation_delta=0 AND quantity_delta<>0))
);
CREATE INDEX market_stock_movements_stock_time_idx
  ON market_stock_movements(organization_id,stock_balance_id,id);
CREATE INDEX market_stock_movements_order_idx
  ON market_stock_movements(organization_id,order_id) WHERE order_id IS NOT NULL;

ALTER TABLE market_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_stock_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE market_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_stock_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY market_stock_balances_read ON market_stock_balances FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND app.can_access_property(property_id)
);
CREATE POLICY market_stock_movements_read ON market_stock_movements FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND EXISTS (
    SELECT 1 FROM market_stock_balances b
    WHERE b.id=market_stock_movements.stock_balance_id
      AND b.organization_id=market_stock_movements.organization_id
  )
);

-- Fail closed if a stock balance is assigned to a property outside its tenant.
CREATE OR REPLACE FUNCTION app.market_stock_tenant_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.organization_id=NEW.organization_id
  ) THEN RAISE EXCEPTION 'MARKET_STOCK_PROPERTY_ORGANIZATION_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER market_stock_tenant_guard
  BEFORE INSERT OR UPDATE OF organization_id,property_id ON market_stock_balances
  FOR EACH ROW EXECUTE FUNCTION app.market_stock_tenant_check();

-- The movement ledger is append-only for ordinary roles; the future transaction
-- boundary must update balances and insert movements in a single DB transaction.
-- No INSERT/UPDATE/DELETE policies are granted in this migration.

COMMIT;
