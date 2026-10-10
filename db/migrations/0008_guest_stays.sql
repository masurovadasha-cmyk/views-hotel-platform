-- Stage 5.2: booking-linked guest access, separate from staff ACL.
CREATE TABLE IF NOT EXISTS service_guest_stays (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 principal_id text NOT NULL,
 booking_reference text NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 state text NOT NULL CHECK (state IN ('confirmed','checked_in','checked_out','cancelled')),
 CHECK (ends_at > starts_at),
 UNIQUE (organization_id,booking_reference,principal_id)
);
ALTER TABLE service_guest_stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_guest_stays_tenant ON service_guest_stays
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS service_guest_stays_lookup ON service_guest_stays(organization_id,property_id,principal_id,state,starts_at,ends_at);
-- Populate only from verified PMS bookings, never from self-reported guest input.
