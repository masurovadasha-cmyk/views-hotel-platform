BEGIN;

ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE unit_types FORCE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY unit_types_tenant_policy ON unit_types
  USING (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=unit_types.property_id
        AND p.organization_id=app.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=unit_types.property_id
        AND p.organization_id=app.current_organization_id()
    )
  );

CREATE POLICY units_tenant_policy ON units
  USING (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=units.property_id
        AND p.organization_id=app.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=units.property_id
        AND p.organization_id=app.current_organization_id()
    )
  );

CREATE POLICY rate_plans_tenant_policy ON rate_plans
  USING (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=rate_plans.property_id
        AND p.organization_id=app.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM properties p
      WHERE p.id=rate_plans.property_id
        AND p.organization_id=app.current_organization_id()
    )
  );

COMMIT;
