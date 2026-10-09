-- Stage 5.22: task compensation accrual, not payroll disbursement.
CREATE TABLE IF NOT EXISTS service_task_compensation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 task_id uuid NOT NULL REFERENCES service_dispatch_tasks(id),
 employee_principal_id text NOT NULL,
 accrued_by text NOT NULL,
 amount_uzs bigint NOT NULL CHECK(amount_uzs >= 0),
 currency char(3) NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
 status text NOT NULL DEFAULT 'accrued' CHECK(status IN ('accrued','approved','voided')),
 approved_by text,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,task_id)
);
CREATE INDEX IF NOT EXISTS service_task_compensation_employee ON service_task_compensation(organization_id,employee_principal_id,status);
ALTER TABLE service_task_compensation ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_compensation_tenant ON service_task_compensation
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
-- Approval does not transfer funds or modify statutory payroll.
