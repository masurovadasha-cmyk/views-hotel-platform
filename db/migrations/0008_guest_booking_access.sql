-- Stage 5.2: guest booking authorization, scoped to the same organization.
CREATE TABLE IF NOT EXISTS service_guest_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 guest_principal_id text NOT NULL,
 status text NOT NULL CHECK (status IN ('confirmed','checked_in','checked_out','cancelled')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS service_guest_bookings_guest
 ON service_guest_bookings(organization_id,guest_principal_id,starts_at,ends_at);
ALTER TABLE service_guest_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_guest_bookings_tenant ON service_guest_bookings
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES service_guest_bookings(id);
-- This is a temporary service booking projection. In production it must be populated
-- from the canonical PMS booking service via validated events, never from a guest form.
