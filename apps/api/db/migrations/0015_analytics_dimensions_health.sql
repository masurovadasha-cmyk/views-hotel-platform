BEGIN;

ALTER TABLE analytics_reservation_facts
  ADD COLUMN booking_channel text NOT NULL DEFAULT 'unknown',
  ADD COLUMN market_segment text NOT NULL DEFAULT 'unknown',
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN no_show_at timestamptz;

CREATE INDEX analytics_reservation_facts_dimensions_idx
  ON analytics_reservation_facts(
    organization_id,property_id,booking_channel,market_segment,status
  );

CREATE OR REPLACE VIEW analytics_property_daily_dimensions
WITH (security_invoker=true) AS
WITH reservation_days AS (
  SELECT
    f.organization_id,
    f.property_id,
    gs.local_date::date AS local_date,
    f.currency,
    f.booking_channel,
    f.market_segment,
    f.reservation_id,
    f.status,
    f.stay_nights,
    f.lead_time_days,
    CASE WHEN f.status='cancelled' THEN 1 ELSE 0 END AS cancelled_booking,
    CASE WHEN f.status='no_show' THEN 1 ELSE 0 END AS no_show_booking
  FROM analytics_reservation_facts f
  CROSS JOIN LATERAL generate_series(
    f.check_in_local_date::timestamp,
    (f.check_out_local_date-1)::timestamp,
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
  COUNT(DISTINCT reservation_id)::integer AS booking_count,
  COUNT(DISTINCT reservation_id) FILTER (
    WHERE status IN ('confirmed','checked_in','checked_out')
  )::integer AS active_booking_count,
  COUNT(DISTINCT reservation_id) FILTER (
    WHERE status='cancelled'
  )::integer AS cancelled_booking_count,
  COUNT(DISTINCT reservation_id) FILTER (
    WHERE status='no_show'
  )::integer AS no_show_booking_count,
  CASE
    WHEN COUNT(DISTINCT reservation_id)=0 THEN 0::numeric
    ELSE ROUND(
      COUNT(DISTINCT reservation_id) FILTER (WHERE status='cancelled')::numeric
      /COUNT(DISTINCT reservation_id),6
    )
  END AS cancellation_rate,
  CASE
    WHEN COUNT(DISTINCT reservation_id)=0 THEN 0::numeric
    ELSE ROUND(
      COUNT(DISTINCT reservation_id) FILTER (WHERE status='no_show')::numeric
      /COUNT(DISTINCT reservation_id),6
    )
  END AS no_show_rate,
  CASE
    WHEN COUNT(DISTINCT reservation_id)=0 THEN 0::numeric
    ELSE ROUND(SUM(lead_time_days)::numeric/COUNT(DISTINCT reservation_id),2)
  END AS avg_lead_time_days,
  CASE
    WHEN COUNT(DISTINCT reservation_id)=0 THEN 0::numeric
    ELSE ROUND(SUM(stay_nights)::numeric/COUNT(DISTINCT reservation_id),2)
  END AS avg_stay_nights
FROM reservation_days
GROUP BY
  organization_id,property_id,local_date,currency,booking_channel,market_segment;

CREATE OR REPLACE VIEW analytics_projection_health
WITH (security_invoker=true) AS
WITH relevant AS (
  SELECT
    o.organization_id,
    COUNT(*) FILTER (
      WHERE c.outbox_event_id IS NULL
    )::integer AS pending_events,
    MIN(o.occurred_at) FILTER (
      WHERE c.outbox_event_id IS NULL
    ) AS oldest_pending_at,
    MAX(c.processed_at) AS last_processed_at
  FROM outbox_events o
  LEFT JOIN analytics_projection_consumptions c
    ON c.outbox_event_id=o.id
   AND c.consumer='analytics-core-v1'
  WHERE
    o.aggregate_type='reservation'
    OR o.event_type='finance.payment_intent.v1'
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

COMMIT;
