BEGIN;

CREATE TABLE internal_service_request_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_membership_id uuid REFERENCES organization_memberships(id) ON DELETE SET NULL,
  service_id text NOT NULL,
  key_fingerprint char(32) NOT NULL,
  request_id text NOT NULL,
  http_method text NOT NULL,
  route_path text NOT NULL,
  status_code integer,
  outcome text NOT NULL DEFAULT 'started'
    CHECK (outcome IN ('started','succeeded','failed')),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  CHECK (service_id ~ '^[a-z0-9][a-z0-9._:-]{1,63}$'),
  CHECK (key_fingerprint ~ '^[a-f0-9]{32}$'),
  CHECK (length(request_id) BETWEEN 1 AND 160),
  CHECK (http_method ~ '^[A-Z]{3,12}$'),
  CHECK (length(route_path) BETWEEN 1 AND 240),
  CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
  CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 120),
  CHECK (duration_ms IS NULL OR duration_ms>=0),
  CHECK (
    (organization_id IS NULL AND actor_user_id IS NULL AND actor_membership_id IS NULL)
    OR
    (organization_id IS NOT NULL AND actor_user_id IS NOT NULL AND actor_membership_id IS NOT NULL)
  )
);

CREATE INDEX internal_service_request_audit_org_time_idx
  ON internal_service_request_audit(organization_id,started_at DESC);

CREATE INDEX internal_service_request_audit_service_time_idx
  ON internal_service_request_audit(service_id,started_at DESC);

CREATE INDEX internal_service_request_audit_request_idx
  ON internal_service_request_audit(request_id,started_at DESC);

ALTER TABLE internal_service_request_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_service_request_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY internal_service_request_audit_read
ON internal_service_request_audit
FOR SELECT
USING (
  organization_id=app.current_organization_id()
  AND app.current_membership_role() IN ('owner','manager','platform_admin')
);

CREATE OR REPLACE FUNCTION app.begin_internal_service_request_audit(
  target_organization_id uuid,
  target_actor_user_id uuid,
  target_actor_membership_id uuid,
  target_service_id text,
  target_key_fingerprint text,
  target_request_id text,
  target_http_method text,
  target_route_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF target_service_id !~ '^[a-z0-9][a-z0-9._:-]{1,63}$' THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_SERVICE_ID';
  END IF;
  IF target_key_fingerprint !~ '^[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_KEY_FINGERPRINT';
  END IF;
  IF target_request_id IS NULL OR length(target_request_id)<1 OR length(target_request_id)>160 THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_REQUEST_ID';
  END IF;
  IF target_http_method !~ '^[A-Z]{3,12}$' THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_HTTP_METHOD';
  END IF;
  IF target_route_path IS NULL OR length(target_route_path)<1 OR length(target_route_path)>240 THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_ROUTE_PATH';
  END IF;
  IF (
    (target_organization_id IS NULL AND target_actor_user_id IS NULL AND target_actor_membership_id IS NULL)
    OR
    (target_organization_id IS NOT NULL AND target_actor_user_id IS NOT NULL AND target_actor_membership_id IS NOT NULL)
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_ACTOR_AUDIT_CONTEXT';
  END IF;

  INSERT INTO internal_service_request_audit(
    id,organization_id,actor_user_id,actor_membership_id,
    service_id,key_fingerprint,request_id,http_method,route_path
  ) VALUES(
    gen_random_uuid(),target_organization_id,target_actor_user_id,target_actor_membership_id,
    target_service_id,target_key_fingerprint,target_request_id,target_http_method,target_route_path
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION app.begin_internal_service_request_audit(
  uuid,uuid,uuid,text,text,text,text,text
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_internal_service_request_audit(
  target_audit_id uuid,
  target_status_code integer,
  target_error_code text DEFAULT NULL,
  target_completed_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF target_status_code<100 OR target_status_code>599 THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_AUDIT_STATUS';
  END IF;

  UPDATE internal_service_request_audit
  SET status_code=target_status_code,
      outcome=CASE WHEN target_status_code<400 THEN 'succeeded' ELSE 'failed' END,
      error_code=CASE
        WHEN target_error_code IS NULL OR length(target_error_code)=0 THEN NULL
        ELSE LEFT(target_error_code,120)
      END,
      completed_at=target_completed_at,
      duration_ms=GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (target_completed_at-started_at))*1000)::integer
      )
  WHERE id=target_audit_id
    AND outcome='started';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END
$$;

REVOKE ALL ON FUNCTION app.complete_internal_service_request_audit(
  uuid,integer,text,timestamptz
) FROM PUBLIC;

COMMIT;
