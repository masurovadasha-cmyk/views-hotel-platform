BEGIN;

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
    a.key_fingerprint::text,
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
