BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_tenant_policy ON organizations
  USING (id = app.current_organization_id())
  WITH CHECK (id = app.current_organization_id());

CREATE POLICY properties_tenant_policy ON properties
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE POLICY reservations_tenant_policy ON reservations
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE POLICY inventory_periods_tenant_policy ON inventory_periods
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE POLICY outbox_events_tenant_policy ON outbox_events
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

COMMIT;
