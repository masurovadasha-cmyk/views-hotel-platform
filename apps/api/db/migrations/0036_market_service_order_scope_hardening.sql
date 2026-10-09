BEGIN;

-- Harden the V-Market schema before any API endpoint is exposed.
-- Staff access is restricted to explicitly scoped properties, except owner/manager
-- whose organization-wide access is defined by app.can_access_property.
DROP POLICY market_orders_read ON market_service_orders;
CREATE POLICY market_orders_read ON market_service_orders FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND app.can_access_property(property_id)
);

DROP POLICY market_lines_read ON market_service_order_lines;
CREATE POLICY market_lines_read ON market_service_order_lines FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND EXISTS (
    SELECT 1 FROM market_service_orders o
    WHERE o.id=market_service_order_lines.order_id
      AND o.organization_id=market_service_order_lines.organization_id
  )
);

DROP POLICY market_assignments_read ON market_service_assignments;
CREATE POLICY market_assignments_read ON market_service_assignments FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND EXISTS (
    SELECT 1 FROM market_service_orders o
    WHERE o.id=market_service_assignments.order_id
      AND o.organization_id=market_service_assignments.organization_id
  )
);

DROP POLICY market_events_read ON market_service_events;
CREATE POLICY market_events_read ON market_service_events FOR SELECT USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','front_desk','concierge','platform_admin')
  AND EXISTS (
    SELECT 1 FROM market_service_orders o
    WHERE o.id=market_service_events.order_id
      AND o.organization_id=market_service_events.organization_id
  )
);

-- Reject an order whose property belongs to a different organization, even
-- when the supplied property UUID exists and the actor has another scope.
CREATE OR REPLACE FUNCTION app.market_order_tenant_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id=NEW.property_id AND p.organization_id=NEW.organization_id
  ) THEN RAISE EXCEPTION 'MARKET_PROPERTY_ORGANIZATION_MISMATCH'; END IF;
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM units u
    WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id
  ) THEN RAISE EXCEPTION 'MARKET_UNIT_PROPERTY_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER market_order_tenant_guard
  BEFORE INSERT OR UPDATE OF organization_id,property_id,unit_id ON market_service_orders
  FOR EACH ROW EXECUTE FUNCTION app.market_order_tenant_check();

COMMIT;
