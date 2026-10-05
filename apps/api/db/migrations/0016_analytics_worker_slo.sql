BEGIN;

CREATE TABLE analytics_worker_state (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  consumer text NOT NULL,
  lease_token text,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error_code text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,consumer)
);

CREATE INDEX analytics_worker_state_lease_idx
  ON analytics_worker_state(consumer,lease_until,consecutive_failures);

ALTER TABLE analytics_worker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_worker_state FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_worker_state_tenant
ON analytics_worker_state
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE OR REPLACE FUNCTION app.claim_analytics_projection_tenants(
  target_consumer text,
  target_worker_token text,
  target_limit integer,
  target_lease_seconds integer
)
RETURNS TABLE(organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF target_consumer IS NULL OR length(target_consumer)<1 OR length(target_consumer)>120 THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_CONSUMER';
  END IF;
  IF target_worker_token IS NULL OR length(target_worker_token)<8 OR length(target_worker_token)>200 THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_WORKER_TOKEN';
  END IF;
  IF target_limit<1 OR target_limit>100 THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_TENANT_LIMIT';
  END IF;
  IF target_lease_seconds<30 OR target_lease_seconds>1800 THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_LEASE_SECONDS';
  END IF;

  INSERT INTO analytics_worker_state(organization_id,consumer)
  SELECT DISTINCT o.organization_id,target_consumer
    FROM outbox_events o
    LEFT JOIN analytics_projection_consumptions c
      ON c.outbox_event_id=o.id
     AND c.consumer=target_consumer
   WHERE c.outbox_event_id IS NULL
     AND (
       o.aggregate_type='reservation'
       OR o.event_type='finance.payment_intent.v1'
     )
  ON CONFLICT(organization_id,consumer) DO NOTHING;

  RETURN QUERY
  WITH candidates AS (
    SELECT s.organization_id
      FROM analytics_worker_state s
      JOIN LATERAL (
        SELECT MIN(o.occurred_at) AS oldest_pending_at
          FROM outbox_events o
          LEFT JOIN analytics_projection_consumptions c
            ON c.outbox_event_id=o.id
           AND c.consumer=target_consumer
         WHERE o.organization_id=s.organization_id
           AND c.outbox_event_id IS NULL
           AND (
             o.aggregate_type='reservation'
             OR o.event_type='finance.payment_intent.v1'
           )
      ) pending ON pending.oldest_pending_at IS NOT NULL
     WHERE s.consumer=target_consumer
       AND (s.lease_until IS NULL OR s.lease_until<=now())
     ORDER BY pending.oldest_pending_at,s.organization_id
     FOR UPDATE OF s SKIP LOCKED
     LIMIT target_limit
  ),
  claimed AS (
    UPDATE analytics_worker_state s
       SET lease_token=target_worker_token,
           lease_until=now()+make_interval(secs=>target_lease_seconds),
           last_started_at=now(),
           updated_at=now()
      FROM candidates c
     WHERE s.organization_id=c.organization_id
       AND s.consumer=target_consumer
    RETURNING s.organization_id
  )
  SELECT claimed.organization_id FROM claimed;
END
$$;

REVOKE ALL ON FUNCTION app.claim_analytics_projection_tenants(text,text,integer,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_analytics_projection_tenant(
  target_organization_id uuid,
  target_consumer text,
  target_worker_token text,
  target_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE analytics_worker_state
     SET lease_token=NULL,
         lease_until=NULL,
         last_completed_at=CASE WHEN target_error_code IS NULL THEN now() ELSE last_completed_at END,
         last_error_code=CASE
           WHEN target_error_code IS NULL THEN NULL
           ELSE left(target_error_code,120)
         END,
         consecutive_failures=CASE
           WHEN target_error_code IS NULL THEN 0
           ELSE consecutive_failures+1
         END,
         updated_at=now()
   WHERE organization_id=target_organization_id
     AND consumer=target_consumer
     AND lease_token=target_worker_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END
$$;

REVOKE ALL ON FUNCTION app.complete_analytics_projection_tenant(uuid,text,text,text) FROM PUBLIC;

CREATE OR REPLACE VIEW analytics_projection_slo
WITH (security_invoker=true) AS
SELECT
  h.organization_id,
  h.pending_events,
  h.oldest_pending_at,
  h.last_processed_at,
  h.oldest_pending_age_seconds,
  COALESCE(s.consecutive_failures,0) AS consecutive_failures,
  s.last_error_code,
  s.last_started_at,
  s.last_completed_at,
  CASE
    WHEN COALESCE(s.consecutive_failures,0)>=3
      OR h.oldest_pending_age_seconds>=1800 THEN 'critical'
    WHEN COALESCE(s.consecutive_failures,0)>0
      OR h.oldest_pending_age_seconds>=300 THEN 'degraded'
    ELSE 'healthy'
  END AS status
FROM analytics_projection_health h
LEFT JOIN analytics_worker_state s
  ON s.organization_id=h.organization_id
 AND s.consumer='analytics-core-v1';

COMMIT;
