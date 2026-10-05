BEGIN;

CREATE TABLE app.security_rate_limit_counters (
  action text NOT NULL,
  key_hash char(64) NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(action,key_hash,window_seconds,window_start),
  CHECK (length(key_hash)=64)
);

CREATE INDEX security_rate_limit_expiry_idx
  ON app.security_rate_limit_counters(expires_at);

REVOKE ALL ON TABLE app.security_rate_limit_counters FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.consume_security_rate_limit(
  target_action text,
  target_key_hash text,
  target_limit integer,
  target_window_seconds integer,
  target_now timestamptz DEFAULT now()
)
RETURNS TABLE(
  allowed boolean,
  current_count integer,
  remaining integer,
  reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
BEGIN
  IF target_action IS NULL OR length(target_action)<1 OR length(target_action)>120 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_ACTION';
  END IF;
  IF target_key_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_KEY';
  END IF;
  IF target_limit<1 OR target_limit>10000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_LIMIT';
  END IF;
  IF target_window_seconds<1 OR target_window_seconds>86400 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_WINDOW';
  END IF;

  v_window_start:=to_timestamp(
    floor(extract(epoch FROM target_now)/target_window_seconds)*target_window_seconds
  );
  v_reset_at:=v_window_start+make_interval(secs=>target_window_seconds);

  INSERT INTO app.security_rate_limit_counters(
    action,key_hash,window_seconds,window_start,request_count,expires_at
  ) VALUES(
    target_action,target_key_hash,target_window_seconds,v_window_start,1,
    v_reset_at+interval '1 day'
  )
  ON CONFLICT(action,key_hash,window_seconds,window_start)
  DO UPDATE SET
    request_count=app.security_rate_limit_counters.request_count+1,
    expires_at=GREATEST(app.security_rate_limit_counters.expires_at,EXCLUDED.expires_at)
  RETURNING request_count INTO v_count;

  RETURN QUERY
  SELECT
    v_count<=target_limit,
    v_count,
    GREATEST(0,target_limit-v_count),
    v_reset_at;
END
$$;

REVOKE ALL ON FUNCTION app.consume_security_rate_limit(text,text,integer,integer,timestamptz)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.prune_security_rate_limits(
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
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_PRUNE_LIMIT';
  END IF;

  WITH doomed AS (
    SELECT ctid
      FROM app.security_rate_limit_counters
     WHERE expires_at<target_now
     ORDER BY expires_at
     LIMIT target_limit
  )
  DELETE FROM app.security_rate_limit_counters c
   USING doomed d
   WHERE c.ctid=d.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION app.prune_security_rate_limits(integer,timestamptz) FROM PUBLIC;

COMMIT;
