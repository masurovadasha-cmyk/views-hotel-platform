BEGIN;

ALTER TABLE internal_service_request_audit
  ADD COLUMN credential_id text;

ALTER TABLE internal_service_request_audit
  ADD CONSTRAINT internal_service_request_audit_credential_id_check
  CHECK (
    credential_id IS NULL
    OR credential_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  );

CREATE INDEX internal_service_request_audit_credential_posture_idx
  ON internal_service_request_audit(
    service_id,auth_scheme,credential_id,started_at DESC
  );

CREATE OR REPLACE FUNCTION app.begin_internal_service_request_audit_v3(
  target_organization_id uuid,
  target_actor_user_id uuid,
  target_actor_membership_id uuid,
  target_service_id text,
  target_key_fingerprint text,
  target_request_id text,
  target_http_method text,
  target_route_path text,
  target_auth_scheme text,
  target_credential_id text,
  target_token_jti uuid
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
  IF target_auth_scheme NOT IN ('internal_key','signed_token') THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_AUTH_SCHEME';
  END IF;

  IF target_auth_scheme='internal_key' THEN
    IF target_token_jti IS NOT NULL OR target_credential_id IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_INTERNAL_TOKEN_AUDIT_CONTEXT';
    END IF;
  ELSE
    IF target_token_jti IS NULL
       OR target_credential_id IS NULL
       OR target_credential_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' THEN
      RAISE EXCEPTION 'INVALID_INTERNAL_TOKEN_AUDIT_CONTEXT';
    END IF;
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
    service_id,key_fingerprint,request_id,http_method,route_path,
    auth_scheme,credential_id,token_jti
  ) VALUES(
    gen_random_uuid(),target_organization_id,target_actor_user_id,target_actor_membership_id,
    target_service_id,target_key_fingerprint,target_request_id,target_http_method,target_route_path,
    target_auth_scheme,target_credential_id,target_token_jti
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION app.begin_internal_service_request_audit_v3(
  uuid,uuid,uuid,text,text,text,text,text,text,text,uuid
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.internal_service_auth_posture(
  target_since timestamptz
)
RETURNS TABLE(
  service_id text,
  auth_scheme text,
  credential_id text,
  key_fingerprint text,
  request_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF app.current_membership_role() IS DISTINCT FROM 'platform_admin' THEN
    RAISE EXCEPTION 'INTERNAL_SERVICE_POSTURE_ROLE_FORBIDDEN';
  END IF;

  IF target_since IS NULL
     OR target_since>now()
     OR target_since<now()-interval '90 days' THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_SERVICE_POSTURE_WINDOW';
  END IF;

  RETURN QUERY
  SELECT
    a.service_id,
    a.auth_scheme,
    a.credential_id,
    a.key_fingerprint,
    count(*)::bigint AS request_count,
    min(a.started_at) AS first_seen_at,
    max(a.started_at) AS last_seen_at
  FROM internal_service_request_audit a
  WHERE a.started_at>=target_since
  GROUP BY
    a.service_id,
    a.auth_scheme,
    a.credential_id,
    a.key_fingerprint
  ORDER BY
    a.service_id,
    a.auth_scheme,
    a.credential_id NULLS FIRST,
    a.key_fingerprint;
END
$$;

REVOKE ALL ON FUNCTION app.internal_service_auth_posture(timestamptz)
FROM PUBLIC;

COMMIT;
