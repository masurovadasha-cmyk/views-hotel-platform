-- Stage 5.33: tenant-scoped, append-only audit for administrator dead-letter recovery.
CREATE UNIQUE INDEX IF NOT EXISTS service_notification_jobs_org_id_unique
 ON service_notification_jobs(organization_id,id);
CREATE TABLE IF NOT EXISTS service_notification_recovery_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 notification_job_id uuid NOT NULL,
 actor_principal_id text NOT NULL CHECK(length(actor_principal_id) BETWEEN 1 AND 256),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),
 previous_attempts integer NOT NULL CHECK(previous_attempts BETWEEN 1 AND 10),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,notification_job_id)
   REFERENCES service_notification_jobs(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS service_notification_recovery_audit_recent
 ON service_notification_recovery_audit(organization_id,created_at DESC);
ALTER TABLE service_notification_recovery_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_notification_recovery_audit_tenant ON service_notification_recovery_audit
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);

CREATE OR REPLACE FUNCTION reject_notification_recovery_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'notification recovery audit is append-only';
END;
$$;
DROP TRIGGER IF EXISTS service_notification_recovery_audit_immutable
 ON service_notification_recovery_audit;
CREATE TRIGGER service_notification_recovery_audit_immutable
 BEFORE UPDATE OR DELETE ON service_notification_recovery_audit
 FOR EACH ROW EXECUTE FUNCTION reject_notification_recovery_audit_mutation();
