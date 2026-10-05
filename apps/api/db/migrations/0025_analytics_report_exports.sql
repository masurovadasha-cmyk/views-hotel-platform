BEGIN;

CREATE TABLE analytics_report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  property_id uuid REFERENCES properties(id),
  report_kind text NOT NULL DEFAULT 'dashboard_summary'
    CHECK (report_kind IN ('dashboard_summary')),
  format text NOT NULL
    CHECK (format IN ('json','csv')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  report_schema_version integer NOT NULL DEFAULT 1
    CHECK (report_schema_version > 0),
  idempotency_key text NOT NULL,
  input_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  source_fingerprint char(64),
  snapshot jsonb,
  content_text text,
  content_type text,
  file_name text,
  content_sha256 char(64),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  CHECK (to_date >= from_date),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (length(input_hash)=64),
  CHECK (source_fingerprint IS NULL OR length(source_fingerprint)=64),
  CHECK (content_sha256 IS NULL OR length(content_sha256)=64),
  CHECK (
    (lease_token IS NULL AND lease_until IS NULL)
    OR (lease_token IS NOT NULL AND lease_until IS NOT NULL)
  ),
  CHECK (
    status <> 'completed'
    OR (
      source_fingerprint IS NOT NULL
      AND snapshot IS NOT NULL
      AND content_text IS NOT NULL
      AND content_type IS NOT NULL
      AND file_name IS NOT NULL
      AND content_sha256 IS NOT NULL
      AND completed_at IS NOT NULL
      AND expires_at IS NOT NULL
    )
  ),
  UNIQUE(organization_id,membership_id,idempotency_key)
);

CREATE INDEX analytics_report_jobs_due_idx
  ON analytics_report_jobs(status,next_attempt_at,lease_until,created_at)
  WHERE status IN ('queued','processing');

CREATE INDEX analytics_report_jobs_membership_idx
  ON analytics_report_jobs(
    organization_id,membership_id,created_at DESC
  );

CREATE INDEX analytics_report_jobs_expiry_idx
  ON analytics_report_jobs(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE analytics_report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_report_jobs_member_scope
ON analytics_report_jobs
USING (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
)
WITH CHECK (
  organization_id=app.current_organization_id()
  AND membership_id=app.current_membership_id()
  AND requested_by_user_id=app.current_user_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE OR REPLACE FUNCTION app.claim_analytics_report_jobs(
  target_worker_token text,
  target_limit integer,
  target_lease_seconds integer
)
RETURNS TABLE(
  job_id uuid,
  organization_id uuid,
  requested_by_user_id uuid,
  membership_id uuid,
  property_id uuid,
  report_kind text,
  format text,
  from_date date,
  to_date date,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF target_worker_token IS NULL
     OR length(target_worker_token)<8
     OR length(target_worker_token)>200 THEN
    RAISE EXCEPTION 'INVALID_REPORT_WORKER_TOKEN';
  END IF;
  IF target_limit<1 OR target_limit>100 THEN
    RAISE EXCEPTION 'INVALID_REPORT_JOB_LIMIT';
  END IF;
  IF target_lease_seconds<30 OR target_lease_seconds>1800 THEN
    RAISE EXCEPTION 'INVALID_REPORT_LEASE_SECONDS';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM analytics_report_jobs j
    JOIN organization_memberships m
      ON m.id=j.membership_id
     AND m.organization_id=j.organization_id
     AND m.user_id=j.requested_by_user_id
     AND m.status='active'
    WHERE j.status IN ('queued','processing')
      AND j.next_attempt_at<=now()
      AND (j.lease_until IS NULL OR j.lease_until<=now())
    ORDER BY j.created_at,j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT target_limit
  ),
  claimed AS (
    UPDATE analytics_report_jobs j
       SET status='processing',
           attempt_count=j.attempt_count+1,
           lease_token=target_worker_token,
           lease_until=now()+make_interval(secs=>target_lease_seconds),
           started_at=COALESCE(j.started_at,now()),
           last_error_code=NULL
      FROM candidates c
     WHERE j.id=c.id
    RETURNING
      j.id,
      j.organization_id,
      j.requested_by_user_id,
      j.membership_id,
      j.property_id,
      j.report_kind,
      j.format,
      j.from_date,
      j.to_date,
      j.attempt_count
  )
  SELECT
    c.id,c.organization_id,c.requested_by_user_id,c.membership_id,
    c.property_id,c.report_kind,c.format,c.from_date,c.to_date,c.attempt_count
  FROM claimed c;
END
$$;

REVOKE ALL ON FUNCTION app.claim_analytics_report_jobs(text,integer,integer)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.prevent_completed_report_job_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status='completed' THEN
    RAISE EXCEPTION 'completed analytics report job is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER analytics_report_jobs_immutable_after_complete
BEFORE UPDATE ON analytics_report_jobs
FOR EACH ROW
EXECUTE FUNCTION app.prevent_completed_report_job_update();

CREATE OR REPLACE FUNCTION app.prune_analytics_report_jobs(
  target_limit integer DEFAULT 10000,
  target_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF target_limit<1 OR target_limit>100000 THEN
    RAISE EXCEPTION 'INVALID_REPORT_PRUNE_LIMIT';
  END IF;

  WITH doomed AS (
    SELECT id
    FROM analytics_report_jobs
    WHERE
      (status='completed' AND expires_at<target_now)
      OR
      (status='failed' AND created_at<target_now-interval '30 days')
    ORDER BY COALESCE(expires_at,created_at),id
    LIMIT target_limit
  )
  DELETE FROM analytics_report_jobs j
  USING doomed d
  WHERE j.id=d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION app.prune_analytics_report_jobs(integer,timestamptz)
  FROM PUBLIC;

COMMIT;
