-- Stage 5.20: cleaning checklists and laundry chain of custody (schema only).
CREATE TABLE IF NOT EXISTS service_cleaning_checklist_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 task_id uuid NOT NULL REFERENCES service_dispatch_tasks(id),
 item_code text NOT NULL,
 label text NOT NULL,
 completed_at timestamptz,
 completed_by text,
 UNIQUE(organization_id,task_id,item_code)
);
CREATE TABLE IF NOT EXISTS service_laundry_bags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 bag_code text NOT NULL,
 status text NOT NULL DEFAULT 'registered'
   CHECK(status IN ('registered','collected','processing','ready','returned','cancelled')),
 item_count integer NOT NULL CHECK(item_count>0),
 condition_notes text,
 received_by text,
 returned_by text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,bag_code)
);
CREATE TABLE IF NOT EXISTS service_laundry_bag_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 bag_id uuid NOT NULL REFERENCES service_laundry_bags(id),
 actor_id text NOT NULL,
 from_status text,
 to_status text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cleaning_task_items ON service_cleaning_checklist_items(organization_id,task_id);
CREATE INDEX IF NOT EXISTS laundry_order_bags ON service_laundry_bags(organization_id,order_id);
ALTER TABLE service_cleaning_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_laundry_bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_laundry_bag_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleaning_items_tenant ON service_cleaning_checklist_items
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY laundry_bags_tenant ON service_laundry_bags
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY laundry_events_tenant ON service_laundry_bag_events
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
