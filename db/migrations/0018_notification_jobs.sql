-- Stage 5.32: durable, tenant-scoped notification projection queue.
-- Each source event is claimed transactionally; row locks release on crash.
CREATE TABLE IF NOT EXISTS service_notification_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 source_event_id uuid NOT NULL REFERENCES service_outbox(id),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(organization_id,source_event_id)
);
CREATE INDEX IF NOT EXISTS service_notification_jobs_ready
 ON service_notification_jobs(organization_id,next_attempt_at,id)
 WHERE status='pending';
ALTER TABLE service_notification_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_notification_jobs_tenant ON service_notification_jobs
 USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid);
