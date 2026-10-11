BEGIN;

ALTER TABLE internal_auth_rejection_counters
  DROP CONSTRAINT IF EXISTS internal_auth_rejection_counters_reason_check;

ALTER TABLE internal_auth_rejection_counters
  ADD CONSTRAINT internal_auth_rejection_counters_reason_check
  CHECK (
    reason IN (
      'partial_actor_context',
      'missing_internal_key',
      'invalid_internal_key',
      'missing_service_identity',
      'invalid_service_identity',
      'invalid_service_token',
      'expired_service_token',
      'service_token_replay'
    )
  );

CREATE OR REPLACE FUNCTION app.record_internal_auth_rejection(
  target_reason text,
  target_network_hash text,
  target_endpoint text,
  target_seen_at timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_bucket timestamptz;
  v_count bigint;
BEGIN
  IF target_reason NOT IN (
    'partial_actor_context',
    'missing_internal_key',
    'invalid_internal_key',
    'missing_service_identity',
    'invalid_service_identity',
    'invalid_service_token',
    'expired_service_token',
    'service_token_replay'
  ) THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_AUTH_REJECTION_REASON';
  END IF;

  IF target_network_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_AUTH_NETWORK_HASH';
  END IF;

  IF target_endpoint IS NULL OR length(target_endpoint)<1 OR length(target_endpoint)>240 THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_AUTH_ENDPOINT';
  END IF;

  v_bucket:=date_trunc('hour',target_seen_at);

  INSERT INTO internal_auth_rejection_counters(
    bucket_start,reason,network_hash,endpoint,
    rejection_count,first_seen_at,last_seen_at
  ) VALUES(
    v_bucket,target_reason,target_network_hash,target_endpoint,
    1,target_seen_at,target_seen_at
  )
  ON CONFLICT(bucket_start,reason,network_hash,endpoint)
  DO UPDATE SET
    rejection_count=internal_auth_rejection_counters.rejection_count+1,
    first_seen_at=LEAST(
      internal_auth_rejection_counters.first_seen_at,
      EXCLUDED.first_seen_at
    ),
    last_seen_at=GREATEST(
      internal_auth_rejection_counters.last_seen_at,
      EXCLUDED.last_seen_at
    )
  RETURNING rejection_count INTO v_count;

  RETURN v_count;
END
$$;

ALTER TABLE internal_service_request_audit
  ADD COLUMN auth_scheme text NOT NULL DEFAULT 'internal_key'
    CHECK (auth_scheme IN ('internal_key','signed_token')),
  ADD COLUMN token_jti uuid;

ALTER TABLE internal_service_request_audit
  ADD CONSTRAINT internal_service_request_audit_token_shape_check
  CHECK (
    (auth_scheme='internal_key' AND token_jti IS NULL)
    OR
    (auth_scheme='signed_token' AND token_jti IS NOT NULL)
  );

CREATE UNIQUE INDEX internal_service_request_audit_token_replay_idx
  ON internal_service_request_audit(service_id,token_jti)
  WHERE token_jti IS NOT NULL;

CREATE OR REPLACE FUNCTION app.begin_internal_service_request_audit_v2(
  target_organization_id uuid,
  target_actor_user_id uuid,
  target_actor_membership_id uuid,
  target_service_id text,
  target_key_fingerprint text,
  target_request_id text,
  target_http_method text,
  target_route_path text,
  target_auth_scheme text,
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
  IF (
    (target_auth_scheme='internal_key' AND target_token_jti IS NULL)
    OR
    (target_auth_scheme='signed_token' AND target_token_jti IS NOT NULL)
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_INTERNAL_TOKEN_AUDIT_CONTEXT';
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
    auth_scheme,token_jti
  ) VALUES(
    gen_random_uuid(),target_organization_id,target_actor_user_id,target_actor_membership_id,
    target_service_id,target_key_fingerprint,target_request_id,target_http_method,target_route_path,
    target_auth_scheme,target_token_jti
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION app.begin_internal_service_request_audit_v2(
  uuid,uuid,uuid,text,text,text,text,text,text,uuid
) FROM PUBLIC;

COMMIT;
