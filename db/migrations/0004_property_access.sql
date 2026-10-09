-- Stage 3.9: explicit property authorization for service ordering.
CREATE TABLE IF NOT EXISTS service_property_access (
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 principal_id text NOT NULL,
 permission text NOT NULL CHECK(permission IN ('order:create','order:read','order:manage')),
 PRIMARY KEY (organization_id,property_id,principal_id,permission)
);
ALTER TABLE service_property_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_property_access_tenant ON service_property_access
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS service_property_access_principal ON service_property_access(organization_id,principal_id,permission);
-- No grants are provisioned automatically. Authorize from verified bookings/staff assignments.
