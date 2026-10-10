-- Stage 5.31: private in-app notification inbox; no external messaging.
CREATE TABLE IF NOT EXISTS service_guest_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 guest_principal_id text NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 source_event_id uuid NOT NULL REFERENCES service_outbox(id),
 event_type text NOT NULL,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 300),
 occurred_at timestamptz NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,guest_principal_id,source_event_id)
);
CREATE INDEX IF NOT EXISTS service_guest_notifications_recent
 ON service_guest_notifications(organization_id,guest_principal_id,occurred_at DESC,id DESC);
ALTER TABLE service_guest_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_guest_notifications_tenant ON service_guest_notifications
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
