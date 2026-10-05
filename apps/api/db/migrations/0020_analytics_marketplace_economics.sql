BEGIN;

CREATE TABLE analytics_marketplace_economic_facts (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  currency char(3) NOT NULL,
  net_collected_minor bigint NOT NULL CHECK (net_collected_minor >= 0),
  platform_commission_minor bigint NOT NULL CHECK (platform_commission_minor >= 0),
  owner_payable_minor bigint NOT NULL CHECK (owner_payable_minor >= 0),
  taxes_withheld_minor bigint NOT NULL DEFAULT 0 CHECK (taxes_withheld_minor >= 0),
  other_deductions_minor bigint NOT NULL DEFAULT 0 CHECK (other_deductions_minor >= 0),
  source_snapshot_id uuid NOT NULL UNIQUE REFERENCES reservation_economic_snapshots(id) ON DELETE RESTRICT,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_finalized_at timestamptz NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    net_collected_minor =
      platform_commission_minor
      + owner_payable_minor
      + taxes_withheld_minor
      + other_deductions_minor
  )
);

CREATE INDEX analytics_marketplace_economic_property_idx
  ON analytics_marketplace_economic_facts(
    organization_id,property_id,currency,source_finalized_at
  );

ALTER TABLE analytics_marketplace_economic_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_marketplace_economic_facts FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_marketplace_economic_tenant
ON analytics_marketplace_economic_facts
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE OR REPLACE VIEW analytics_marketplace_arrival_daily
WITH (security_invoker=true) AS
SELECT
  e.organization_id,
  e.property_id,
  r.check_in_local_date AS arrival_date,
  e.currency,
  r.booking_channel,
  r.market_segment,
  COUNT(*)::integer AS reservation_count,
  SUM(e.net_collected_minor)::bigint AS net_collected_minor,
  SUM(e.platform_commission_minor)::bigint AS platform_commission_minor,
  SUM(e.owner_payable_minor)::bigint AS owner_payable_minor,
  SUM(e.taxes_withheld_minor)::bigint AS taxes_withheld_minor,
  SUM(e.other_deductions_minor)::bigint AS other_deductions_minor,
  CASE
    WHEN SUM(e.net_collected_minor)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(e.platform_commission_minor)::numeric/SUM(e.net_collected_minor),
      6
    )
  END AS platform_commission_rate,
  CASE
    WHEN SUM(e.net_collected_minor)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(e.owner_payable_minor)::numeric/SUM(e.net_collected_minor),
      6
    )
  END AS owner_payable_rate
FROM analytics_marketplace_economic_facts e
JOIN analytics_reservation_facts r
  ON r.reservation_id=e.reservation_id
 AND r.organization_id=e.organization_id
GROUP BY
  e.organization_id,
  e.property_id,
  r.check_in_local_date,
  e.currency,
  r.booking_channel,
  r.market_segment;

CREATE OR REPLACE VIEW analytics_marketplace_stay_daily
WITH (security_invoker=true) AS
WITH nightly AS (
  SELECT
    e.organization_id,
    e.property_id,
    e.reservation_id,
    e.currency,
    r.booking_channel,
    r.market_segment,
    gs.local_date::date AS local_date,
    (
      e.net_collected_minor/r.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(e.net_collected_minor,r.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS net_collected_minor,
    (
      e.platform_commission_minor/r.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(e.platform_commission_minor,r.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS platform_commission_minor,
    (
      e.owner_payable_minor/r.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(e.owner_payable_minor,r.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS owner_payable_minor,
    (
      e.taxes_withheld_minor/r.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(e.taxes_withheld_minor,r.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS taxes_withheld_minor,
    (
      e.other_deductions_minor/r.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(e.other_deductions_minor,r.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS other_deductions_minor
  FROM analytics_marketplace_economic_facts e
  JOIN analytics_reservation_facts r
    ON r.reservation_id=e.reservation_id
   AND r.organization_id=e.organization_id
  CROSS JOIN LATERAL generate_series(
    r.check_in_local_date::timestamp,
    (r.check_out_local_date-1)::timestamp,
    interval '1 day'
  ) WITH ORDINALITY AS gs(local_date,ordinality)
)
SELECT
  organization_id,
  property_id,
  local_date,
  currency,
  booking_channel,
  market_segment,
  COUNT(DISTINCT reservation_id)::integer AS reservation_count,
  SUM(net_collected_minor)::bigint AS net_collected_minor,
  SUM(platform_commission_minor)::bigint AS platform_commission_minor,
  SUM(owner_payable_minor)::bigint AS owner_payable_minor,
  SUM(taxes_withheld_minor)::bigint AS taxes_withheld_minor,
  SUM(other_deductions_minor)::bigint AS other_deductions_minor
FROM nightly
GROUP BY
  organization_id,
  property_id,
  local_date,
  currency,
  booking_channel,
  market_segment;

CREATE OR REPLACE VIEW analytics_projection_health
WITH (security_invoker=true) AS
WITH relevant AS (
  SELECT
    o.organization_id,
    COUNT(*) FILTER (WHERE c.outbox_event_id IS NULL)::integer AS pending_events,
    MIN(o.occurred_at) FILTER (WHERE c.outbox_event_id IS NULL) AS oldest_pending_at,
    MAX(c.processed_at) AS last_processed_at
  FROM outbox_events o
  LEFT JOIN analytics_projection_consumptions c
    ON c.outbox_event_id=o.id
   AND c.consumer='analytics-core-v1'
  WHERE
    o.aggregate_type='reservation'
    OR o.event_type='finance.payment_intent.v1'
    OR o.event_type='marketplace.reservation_economics.v1'
  GROUP BY o.organization_id
)
SELECT
  organization_id,
  pending_events,
  oldest_pending_at,
  last_processed_at,
  CASE
    WHEN oldest_pending_at IS NULL THEN 0
    ELSE GREATEST(
      0,
      EXTRACT(EPOCH FROM (now()-oldest_pending_at))::bigint
    )
  END AS oldest_pending_age_seconds
FROM relevant;

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
       OR o.event_type='marketplace.reservation_economics.v1'
     )
  ON CONFLICT ON CONSTRAINT analytics_worker_state_pkey DO NOTHING;

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
             OR o.event_type='marketplace.reservation_economics.v1'
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

COMMIT;