-- Stage 5.5: canonical guest booking reference for API routes.
-- Records must be imported from trusted PMS sources, never created by guest input.
CREATE TABLE IF NOT EXISTS service_guest_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 guest_principal_id text NOT NULL,
 booking_reference text NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('confirmed','checked_in','checked_out','cancelled')),
 CHECK (ends_at > starts_at),
 UNIQUE (organization_id,booking_reference)
);
ALTER TABLE service_guest_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_guest_bookings_tenant ON service_guest_bookings
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS service_guest_bookings_active ON service_guest_bookings(organization_id,guest_principal_id,status,starts_at,ends_at);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS booking_id uuid;
-- Enforce a foreign key after reconciling any existing non-null booking_id values.
