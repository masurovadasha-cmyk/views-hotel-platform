BEGIN;

ALTER TABLE analytics_report_jobs
  ADD COLUMN artifact_expires_at timestamptz;

UPDATE analytics_report_jobs
SET artifact_expires_at=
  COALESCE(completed_at,updated_at,created_at)+interval '30 days'
WHERE status='completed'
  AND artifact_expires_at IS NULL;

ALTER TABLE analytics_report_jobs
  ADD CONSTRAINT analytics_report_jobs_completed_retention
  CHECK (
    status <> 'completed'
    OR (
      completed_at IS NOT NULL
      AND artifact_expires_at IS NOT NULL
      AND source_fingerprint IS NOT NULL
    )
  );

CREATE INDEX analytics_report_jobs_artifact_expiry_idx
  ON analytics_report_jobs(artifact_expires_at)
  WHERE artifact_expires_at IS NOT NULL;

DROP POLICY IF EXISTS analytics_report_jobs_read
  ON analytics_report_jobs;

CREATE POLICY analytics_report_jobs_read
ON analytics_report_jobs
FOR SELECT
USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('host','owner','manager','accountant')
  AND (
    created_by_membership_id=app.current_membership_id()
    OR app.current_membership_role() IN ('owner','manager','accountant')
  )
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

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

REVOKE ALL ON FUNCTION app.fail_analytics_report_job(uuid,text,text)
  FROM PUBLIC;

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
