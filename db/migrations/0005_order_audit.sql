CREATE TABLE IF NOT EXISTS service_order_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 actor_id text NOT NULL,
 previous_status text NOT NULL,
 next_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE service_order_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_order_audit_tenant ON service_order_audit
 USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS service_order_audit_order ON service_order_audit(organization_id,order_id,created_at);
