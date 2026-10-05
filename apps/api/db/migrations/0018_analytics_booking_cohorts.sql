BEGIN;

ALTER TABLE analytics_reservation_facts
  ALTER COLUMN booking_channel DROP DEFAULT,
  ALTER COLUMN booking_channel DROP NOT NULL,
  ALTER COLUMN market_segment DROP DEFAULT,
  ALTER COLUMN market_segment DROP NOT NULL,
  ADD COLUMN booking_local_date date,
  ADD COLUMN cancellation_lead_days numeric(12,4);

UPDATE analytics_reservation_facts
SET
  booking_channel=NULLIF(booking_channel,'unknown'),
  market_segment=NULLIF(market_segment,'unknown');

UPDATE analytics_reservation_facts f
SET
  booking_local_date=(r.created_at AT TIME ZONE p.timezone)::date,
  booking_channel=COALESCE(
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'bookingChannel')='string'
        THEN NULLIF(
          LEFT(regexp_replace(lower(BTRIM(r.quote_snapshot->>'bookingChannel')),'[^a-z0-9_-]+','_','g'),64),
          ''
        )
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'sourceChannel')='string'
        THEN NULLIF(
          LEFT(regexp_replace(lower(BTRIM(r.quote_snapshot->>'sourceChannel')),'[^a-z0-9_-]+','_','g'),64),
          ''
        )
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'pricingSnapshot'->'sourceChannel')='string'
        THEN NULLIF(
          LEFT(
            regexp_replace(
              lower(BTRIM(r.quote_snapshot->'pricingSnapshot'->>'sourceChannel')),
              '[^a-z0-9_-]+','_','g'
            ),
            64
          ),
          ''
        )
      ELSE NULL
    END,
    NULLIF(f.booking_channel,'unknown')
  ),
  market_segment=COALESCE(
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'marketSegment')='string'
        THEN NULLIF(
          LEFT(regexp_replace(lower(BTRIM(r.quote_snapshot->>'marketSegment')),'[^a-z0-9_-]+','_','g'),64),
          ''
        )
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'guestSegment')='string'
        THEN NULLIF(
          LEFT(regexp_replace(lower(BTRIM(r.quote_snapshot->>'guestSegment')),'[^a-z0-9_-]+','_','g'),64),
          ''
        )
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(r.quote_snapshot->'guestContext'->'guestSegment')='string'
        THEN NULLIF(
          LEFT(
            regexp_replace(
              lower(BTRIM(r.quote_snapshot->'guestContext'->>'guestSegment')),
              '[^a-z0-9_-]+','_','g'
            ),
            64
          ),
          ''
        )
      ELSE NULL
    END,
    NULLIF(f.market_segment,'unknown')
  ),
  cancelled_at=COALESCE(
    f.cancelled_at,
    r.cancelled_at,
    lifecycle.cancelled_event_at
  ),
  no_show_at=COALESCE(
    f.no_show_at,
    lifecycle.no_show_at
  )
FROM reservations r
JOIN properties p ON p.id=r.property_id
LEFT JOIN LATERAL (
  SELECT
    MIN(e.created_at) FILTER (WHERE e.to_status='cancelled') AS cancelled_event_at,
    MIN(e.created_at) FILTER (WHERE e.to_status='no_show') AS no_show_at
  FROM booking_state_events e
  WHERE e.reservation_id=r.id
    AND e.organization_id=r.organization_id
) lifecycle ON true
WHERE r.id=f.reservation_id
  AND r.organization_id=f.organization_id;

UPDATE analytics_reservation_facts
SET cancellation_lead_days=CASE
  WHEN cancelled_at IS NULL THEN NULL
  ELSE GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      (check_in_at AT TIME ZONE property_timezone)
      -(cancelled_at AT TIME ZONE property_timezone)
    ))/86400.0
  )
END;

ALTER TABLE analytics_reservation_facts
  ALTER COLUMN booking_local_date SET NOT NULL;

CREATE INDEX analytics_reservation_facts_arrival_cohort_idx
  ON analytics_reservation_facts(
    organization_id,property_id,check_in_local_date,booking_channel,market_segment,status
  );

CREATE OR REPLACE VIEW analytics_booking_cohorts_daily
WITH (security_invoker=true) AS
SELECT
  f.organization_id,
  f.property_id,
  f.check_in_local_date AS arrival_date,
  f.currency,
  f.booking_channel,
  f.market_segment,
  COUNT(*)::integer AS booking_count,
  COUNT(*) FILTER (
    WHERE f.status IN ('confirmed','checked_in','checked_out')
  )::integer AS active_or_stayed_count,
  COUNT(*) FILTER (WHERE f.status='cancelled')::integer AS cancellation_count,
  COUNT(*) FILTER (WHERE f.status='no_show')::integer AS no_show_count,
  CASE
    WHEN COUNT(*)=0 THEN 0::numeric
    ELSE ROUND(
      COUNT(*) FILTER (WHERE f.status='cancelled')::numeric/COUNT(*),
      6
    )
  END AS cancellation_rate,
  CASE
    WHEN COUNT(*)=0 THEN 0::numeric
    ELSE ROUND(
      COUNT(*) FILTER (WHERE f.status='no_show')::numeric/COUNT(*),
      6
    )
  END AS no_show_rate,
  ROUND(AVG(f.lead_time_days),2) AS avg_lead_time_days,
  ROUND(AVG(f.stay_nights),2) AS avg_stay_nights,
  ROUND(
    AVG(f.cancellation_lead_days)
      FILTER (WHERE f.status='cancelled' AND f.cancellation_lead_days IS NOT NULL),
    2
  ) AS avg_cancellation_lead_days
FROM analytics_reservation_facts f
WHERE f.status <> 'hold'
GROUP BY
  f.organization_id,
  f.property_id,
  f.check_in_local_date,
  f.currency,
  f.booking_channel,
  f.market_segment;

COMMIT;
