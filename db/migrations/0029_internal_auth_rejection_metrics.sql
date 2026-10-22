BEGIN;

CREATE TABLE internal_auth_rejection_counters (
  bucket_start timestamptz NOT NULL,
  reason text NOT NULL CHECK (
    reason IN (
      'partial_actor_context',
      'missing_internal_key',
      'invalid_internal_key',
      'missing_service_identity',
      'invalid_service_identity'
    )
  ),
  network_hash char(64) NOT NULL CHECK (network_hash ~ '^[a-f0-9]{64}$'),
  endpoint text NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 240),
  rejection_count bigint NOT NULL DEFAULT 1 CHECK (rejection_count>0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(bucket_start,reason,network_hash,endpoint)
);

CREATE INDEX internal_auth_rejection_counters_last_seen_idx
  ON internal_auth_rejection_counters(last_seen_at DESC);

ALTER TABLE internal_auth_rejection_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_auth_rejection_counters FORCE ROW LEVEL SECURITY;

CREATE POLICY internal_auth_rejection_counters_platform_read
ON internal_auth_rejection_counters
FOR SELECT
USING (app.current_membership_role()='platform_admin');

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
    'invalid_service_identity'
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

REVOKE ALL ON FUNCTION app.record_internal_auth_rejection(
  text,text,text,timestamptz
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.prune_internal_auth_rejections(
  target_before timestamptz,
  target_limit integer DEFAULT 10000
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
    RAISE EXCEPTION 'INVALID_INTERNAL_AUTH_PRUNE_LIMIT';
  END IF;

  WITH doomed AS (
    SELECT ctid
    FROM internal_auth_rejection_counters
    WHERE last_seen_at<target_before
    ORDER BY last_seen_at
    LIMIT target_limit
  )
  DELETE FROM internal_auth_rejection_counters c
  USING doomed d
  WHERE c.ctid=d.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION app.prune_internal_auth_rejections(
  timestamptz,integer
) FROM PUBLIC;

COMMIT;
