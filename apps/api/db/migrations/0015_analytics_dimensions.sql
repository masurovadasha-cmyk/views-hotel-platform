BEGIN;

ALTER TABLE analytics_reservation_facts
  ADD COLUMN booking_local_date date,
  ADD COLUMN source_channel text,
  ADD COLUMN guest_segment text,
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN no_show_at timestamptz,
  ADD COLUMN cancellation_lead_days numeric(12,4);

ALTER TABLE analytics_reservation_facts
  ADD CONSTRAINT analytics_source_channel_length
    CHECK (source_channel IS NULL OR length(source_channel) BETWEEN 1 AND 80),
  ADD CONSTRAINT analytics_guest_segment_length
    CHECK (guest_segment IS NULL OR length(guest_segment) BETWEEN 1 AND 80);

UPDATE analytics_reservation_facts f
SET booking_local_date=(f.booked_at AT TIME ZONE f.property_timezone)::date
WHERE booking_local_date IS NULL;

ALTER TABLE analytics_reservation_facts
  ALTER COLUMN booking_local_date SET NOT NULL;

CREATE INDEX analytics_reservation_facts_dimensions_idx
  ON analytics_reservation_facts(
    organization_id,property_id,check_in_local_date,source_channel,guest_segment,status
  );

CREATE OR REPLACE VIEW analytics_booking_cohorts_daily
WITH (security_invoker=true) AS
SELECT
  f.organization_id,
  f.property_id,
  f.check_in_local_date AS arrival_date,
  f.currency,
  f.source_channel,
  f.guest_segment,
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
  f.source_channel,
  f.guest_segment;

COMMIT;
