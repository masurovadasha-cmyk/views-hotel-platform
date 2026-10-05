BEGIN;

CREATE TABLE analytics_report_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('dashboard_summary')),
  format text NOT NULL CHECK (format IN ('json','csv')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  source_fingerprint char(64),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  last_error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  artifact_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date>=from_date),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (length(request_hash)=64),
  CHECK (source_fingerprint IS NULL OR length(source_fingerprint)=64),
  CHECK (
    status <> 'completed'
    OR (
      completed_at IS NOT NULL
      AND artifact_expires_at IS NOT NULL
      AND source_fingerprint IS NOT NULL
    )
  ),
  UNIQUE(organization_id,created_by_membership_id,idempotency_key)
);

CREATE INDEX analytics_report_jobs_due_idx
  ON analytics_report_jobs(status,next_attempt_at,lease_until,created_at)
  WHERE status IN ('queued','processing');

CREATE INDEX analytics_report_jobs_actor_idx
  ON analytics_report_jobs(
    organization_id,created_by_membership_id,created_at DESC
  );

CREATE INDEX analytics_report_jobs_artifact_expiry_idx
  ON analytics_report_jobs(artifact_expires_at)
  WHERE artifact_expires_at IS NOT NULL;

CREATE TABLE analytics_report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_job_id uuid NOT NULL UNIQUE REFERENCES analytics_report_jobs(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('json','csv')),
  content_type text NOT NULL CHECK (
    content_type IN ('application/json','text/csv; charset=utf-8')
  ),
  filename text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size>=0 AND byte_size<=2097152),
  checksum_sha256 char(64) NOT NULL CHECK (length(checksum_sha256)=64),
  content_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(filename) BETWEEN 1 AND 180),
  CHECK (octet_length(content_bytes)=byte_size),
  CHECK (octet_length(content_bytes)<=2097152)
);

ALTER TABLE analytics_report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_artifacts FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_report_jobs_read
ON analytics_report_jobs
FOR SELECT
USING (
  organization_id=app.current_organization_id()
  AND (
    created_by_membership_id=app.current_membership_id()
    OR app.current_membership_role() IN ('owner','manager','accountant')
  )
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE POLICY analytics_report_jobs_insert
ON analytics_report_jobs
FOR INSERT
WITH CHECK (
  organization_id=app.current_organization_id()
  AND created_by_user_id=app.current_user_id()
  AND created_by_membership_id=app.current_membership_id()
  AND app.current_membership_role() IN ('host','owner','manager','accountant')
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE POLICY analytics_report_artifacts_read
ON analytics_report_artifacts
FOR SELECT
USING (
  organization_id=app.current_organization_id()
  AND EXISTS(
    SELECT 1
    FROM analytics_report_jobs j
    WHERE j.id=analytics_report_artifacts.report_job_id
      AND j.organization_id=analytics_report_artifacts.organization_id
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
  property_id uuid,
  report_type text,
  format text,
  from_date date,
  to_date date,
  created_by_user_id uuid,
  created_by_membership_id uuid,
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
    WHERE (
        (j.status='queued' AND j.next_attempt_at<=now())
        OR
        (j.status='processing' AND j.lease_until<=now())
      )
      AND (j.lease_until IS NULL OR j.lease_until<=now())
    ORDER BY j.next_attempt_at,j.created_at,j.id
    FOR UPDATE SKIP LOCKED
    LIMIT target_limit
  ),
  claimed AS (
    UPDATE analytics_report_jobs j
    SET status='processing',
        attempt_count=j.attempt_count+1,
        lease_token=target_worker_token,
        lease_until=now()+make_interval(secs=>target_lease_seconds),
        started_at=COALESCE(j.started_at,now()),
        updated_at=now()
    FROM candidates c
    WHERE j.id=c.id
    RETURNING
      j.id,j.organization_id,j.property_id,j.report_type,j.format,
      j.from_date,j.to_date,j.created_by_user_id,j.created_by_membership_id,
      j.attempt_count
  )
  SELECT
    claimed.id,claimed.organization_id,claimed.property_id,
    claimed.report_type,claimed.format,claimed.from_date,claimed.to_date,
    claimed.created_by_user_id,claimed.created_by_membership_id,
    claimed.attempt_count
  FROM claimed;
END
$$;

REVOKE ALL ON FUNCTION app.claim_analytics_report_jobs(text,integer,integer)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_analytics_report_job(
  target_job_id uuid,
  target_worker_token text,
  target_source_fingerprint text,
  target_content_type text,
  target_filename text,
  target_checksum_sha256 text,
  target_content_bytes bytea
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_organization_id uuid;
  v_format text;
  v_updated integer;
BEGIN
  IF target_source_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_REPORT_SOURCE_FINGERPRINT';
  END IF;
  IF target_checksum_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_REPORT_CHECKSUM';
  END IF;
  IF octet_length(target_content_bytes)>2097152 THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_TOO_LARGE';
  END IF;

  UPDATE analytics_report_jobs
  SET status='completed',
      source_fingerprint=target_source_fingerprint,
      completed_at=now(),
      artifact_expires_at=now()+interval '30 days',
      lease_token=NULL,
      lease_until=NULL,
      last_error_code=NULL,
      updated_at=now()
  WHERE id=target_job_id
    AND status='processing'
    AND lease_token=target_worker_token
    AND lease_until>now()
  RETURNING organization_id,format
  INTO v_organization_id,v_format;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated<>1 THEN
    RETURN false;
  END IF;

  INSERT INTO analytics_report_artifacts(
    id,organization_id,report_job_id,format,content_type,
    filename,byte_size,checksum_sha256,content_bytes
  ) VALUES(
    gen_random_uuid(),v_organization_id,target_job_id,v_format,target_content_type,
    target_filename,octet_length(target_content_bytes),
    target_checksum_sha256,target_content_bytes
  )
  ON CONFLICT(report_job_id) DO UPDATE SET
    format=EXCLUDED.format,
    content_type=EXCLUDED.content_type,
    filename=EXCLUDED.filename,
    byte_size=EXCLUDED.byte_size,
    checksum_sha256=EXCLUDED.checksum_sha256,
    content_bytes=EXCLUDED.content_bytes,
    created_at=now();

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION app.complete_analytics_report_job(
  uuid,text,text,text,text,text,bytea
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.fail_analytics_report_job(
  target_job_id uuid,
  target_worker_token text,
  target_error_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE analytics_report_jobs
  SET status=CASE
        WHEN attempt_count>=max_attempts THEN 'failed'
        ELSE 'queued'
      END,
      next_attempt_at=CASE
        WHEN attempt_count>=max_attempts THEN next_attempt_at
        ELSE now()+make_interval(
          secs=>LEAST(3600,15*power(2,GREATEST(0,attempt_count-1))::integer)
        )
      END,
      lease_token=NULL,
      lease_until=NULL,
      last_error_code=LEFT(COALESCE(target_error_code,'REPORT_JOB_ERROR'),120),
      updated_at=now()
  WHERE id=target_job_id
    AND status='processing'
    AND lease_token=target_worker_token
    AND lease_until>now()
  RETURNING status INTO v_status;

  RETURN v_status;
END
$$;

REVOKE ALL ON FUNCTION app.fail_analytics_report_job(uuid,text,text) FROM PUBLIC;


CREATE OR REPLACE FUNCTION app.prune_analytics_report_artifacts(
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
    SELECT a.id
    FROM analytics_report_artifacts a
    JOIN analytics_report_jobs j
      ON j.id=a.report_job_id
     AND j.organization_id=a.organization_id
    WHERE j.artifact_expires_at<target_now
    ORDER BY j.artifact_expires_at,a.id
    LIMIT target_limit
  )
  DELETE FROM analytics_report_artifacts a
  USING doomed d
  WHERE a.id=d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION app.prune_analytics_report_artifacts(integer,timestamptz)
  FROM PUBLIC;

COMMIT;
