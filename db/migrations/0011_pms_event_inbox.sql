-- Stage 5.8: PMS inbox with replay and version protection.
CREATE TABLE IF NOT EXISTS service_pms_event_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 source text NOT NULL,
 external_event_id text NOT NULL,
 booking_reference text NOT NULL,
 booking_version bigint NOT NULL CHECK (booking_version >= 0),
 event_type text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,source,external_event_id)
);
ALTER TABLE service_pms_event_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_pms_event_inbox_tenant ON service_pms_event_inbox
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE service_guest_bookings ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE service_guest_bookings ADD COLUMN IF NOT EXISTS source_version bigint NOT NULL DEFAULT 0;
