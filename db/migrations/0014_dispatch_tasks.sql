-- Stage 5.18: service dispatch tasks, independent from payment and order status.
CREATE TABLE IF NOT EXISTS service_task_assignees (
 organization_id uuid NOT NULL,
 property_id uuid NOT NULL,
 principal_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(organization_id,property_id,principal_id)
);
CREATE TABLE IF NOT EXISTS service_dispatch_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL REFERENCES service_orders(id),
 property_id uuid NOT NULL,
 task_kind text NOT NULL CHECK(task_kind IN ('market_pick','market_deliver','cleaning','laundry_pickup','laundry_process','laundry_return','concierge')),
 assigned_principal_id text,
 status text NOT NULL DEFAULT 'unassigned'
   CHECK(status IN ('unassigned','assigned','in_progress','completed','cancelled')),
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,order_id,task_kind)
);
CREATE INDEX IF NOT EXISTS service_dispatch_tasks_queue
 ON service_dispatch_tasks(organization_id,property_id,status,due_at);
ALTER TABLE service_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_dispatch_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_assignees_tenant ON service_task_assignees
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
CREATE POLICY dispatch_tasks_tenant ON service_dispatch_tasks
 USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
