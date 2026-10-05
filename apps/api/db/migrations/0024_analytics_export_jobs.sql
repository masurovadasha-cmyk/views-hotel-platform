BEGIN;

CREATE TABLE analytics_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (
    report_type IN (
      'property_daily',
      'booking_cohorts',
      'marketplace_economics',
      'city_daily',
      'country_daily'
    )
  ),
  format text NOT NULL DEFAULT 'csv' CHECK (format='csv'),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','processing','completed','failed','cancelled')
  ),
  from_date date NOT NULL,
  to_date date NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  storage_provider text,
  object_key text,
  content_sha256 char(64),
  content_bytes bigint,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date>=from_date),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (length(request_hash)=64),
  CHECK (content_sha256 IS NULL OR length(content_sha256)=64),
  CHECK (content_bytes IS NULL OR content_bytes>=0),
  CHECK (
    (status='completed' AND object_key IS NOT NULL AND content_sha256 IS NOT NULL AND content_bytes IS NOT NULL)
    OR status<>'completed'
  ),
  UNIQUE(organization_id,membership_id,idempotency_key)
);

CREATE INDEX analytics_export_jobs_due_idx
  ON analytics_export_jobs(status,next_attempt_at,lease_until,created_at)
  WHERE status IN ('pending','processing');

CREATE INDEX analytics_export_jobs_owner_idx
  ON analytics_export_jobs(
    organization_id,membership_id,created_at DESC
  );

ALTER TABLE analytics_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_export_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_export_jobs_membership_scope
ON analytics_export_jobs
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
  AND created_by_user_id=app.current_user_id()
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE OR REPLACE FUNCTION app.claim_analytics_export_jobs(
  target_worker_token text,
  target_limit integer,
  target_lease_seconds integer
)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  membership_id uuid,
  created_by_user_id uuid,
  property_id uuid,
  report_type text,
  from_date date,
  to_date date,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF target_worker_token IS NULL OR length(target_worker_token)<8 OR length(target_worker_token)>200 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_WORKER_TOKEN';
  END IF;
  IF target_limit<1 OR target_limit>100 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_JOB_LIMIT';
  END IF;
  IF target_lease_seconds<30 OR target_lease_seconds>1800 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_LEASE_SECONDS';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
      FROM analytics_export_jobs j
     WHERE j.status='pending'
       AND j.next_attempt_at<=now()
       AND (j.lease_until IS NULL OR j.lease_until<=now())
       AND j.attempt_count<5
     ORDER BY j.next_attempt_at,j.created_at,j.id
     FOR UPDATE SKIP LOCKED
     LIMIT target_limit
  ),
  claimed AS (
    UPDATE analytics_export_jobs j
       SET status='processing',
           lease_token=target_worker_token,
           lease_until=now()+make_interval(secs=>target_lease_seconds),
           attempt_count=j.attempt_count+1,
           last_error_code=NULL,
           updated_at=now()
      FROM candidates c
     WHERE j.id=c.id
    RETURNING
      j.id,j.organization_id,j.membership_id,j.created_by_user_id,j.property_id,
      j.report_type,j.from_date,j.to_date,j.attempt_count
  )
  SELECT
    c.id,c.organization_id,c.membership_id,c.created_by_user_id,c.property_id,
    c.report_type,c.from_date,c.to_date,c.attempt_count
  FROM claimed c;
END
$$;

REVOKE ALL ON FUNCTION app.claim_analytics_export_jobs(text,integer,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_analytics_export_job(
  target_job_id uuid,
  target_worker_token text,
  target_storage_provider text,
  target_object_key text,
  target_content_sha256 text,
  target_content_bytes bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF target_storage_provider IS NULL OR length(target_storage_provider)<1 OR length(target_storage_provider)>120 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_STORAGE_PROVIDER';
  END IF;
  IF target_object_key IS NULL OR length(target_object_key)<1 OR length(target_object_key)>500 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_OBJECT_KEY';
  END IF;
  IF target_content_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_EXPORT_CONTENT_HASH';
  END IF;
  IF target_content_bytes<0 THEN
    RAISE EXCEPTION 'INVALID_EXPORT_CONTENT_BYTES';
  END IF;

  UPDATE analytics_export_jobs
     SET status='completed',
         storage_provider=target_storage_provider,
         object_key=target_object_key,
         content_sha256=target_content_sha256,
         content_bytes=target_content_bytes,
         lease_token=NULL,
         lease_until=NULL,
         last_error_code=NULL,
         completed_at=now(),
         updated_at=now()
   WHERE id=target_job_id
     AND status='processing'
     AND lease_token=target_worker_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END
$$;

REVOKE ALL ON FUNCTION app.complete_analytics_export_job(
  uuid,text,text,text,text,bigint
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.fail_analytics_export_job(
  target_job_id uuid,
  target_worker_token text,
  target_error_code text,
  target_permanent boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE analytics_export_jobs
     SET status=CASE
           WHEN target_permanent OR attempt_count>=5 THEN 'failed'
           ELSE 'pending'
         END,
         next_attempt_at=CASE
           WHEN target_permanent OR attempt_count>=5 THEN next_attempt_at
           ELSE now()+make_interval(
             secs=>LEAST(3600,30*(2^LEAST(attempt_count,6)))::integer
           )
         END,
         lease_token=NULL,
         lease_until=NULL,
         last_error_code=LEFT(
           COALESCE(NULLIF(target_error_code,''),'ANALYTICS_EXPORT_ERROR'),
           120
         ),
         updated_at=now()
   WHERE id=target_job_id
     AND status='processing'
     AND lease_token=target_worker_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END
$$;

REVOKE ALL ON FUNCTION app.fail_analytics_export_job(uuid,text,text,boolean) FROM PUBLIC;

COMMIT;
