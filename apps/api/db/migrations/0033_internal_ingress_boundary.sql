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
      'service_token_replay',
      'signed_token_required',
      'service_ingress_denied'
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
    'service_token_replay',
    'signed_token_required',
    'service_ingress_denied'
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

COMMIT;
