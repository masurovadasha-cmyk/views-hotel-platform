-- Stage 5.7: reconcile legacy booking schema before applying PMS synchronization.
ALTER TABLE service_guest_bookings ADD COLUMN IF NOT EXISTS booking_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS service_guest_bookings_ref_unique ON service_guest_bookings(organization_id,booking_reference) WHERE booking_reference IS NOT NULL;
-- Existing rows must be backfilled from authoritative PMS data before NOT NULL enforcement.
