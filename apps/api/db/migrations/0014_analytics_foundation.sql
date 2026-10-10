BEGIN;

CREATE TABLE analytics_projection_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  consumer text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(outbox_event_id,consumer)
);
CREATE INDEX analytics_projection_consumptions_org_time_idx
  ON analytics_projection_consumptions(organization_id,processed_at DESC);

CREATE TABLE analytics_reservation_facts (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid REFERENCES units(id),
  status reservation_status NOT NULL,
  currency char(3) NOT NULL,
  property_timezone text NOT NULL,
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz NOT NULL,
  check_in_local_date date NOT NULL,
  check_out_local_date date NOT NULL,
  stay_nights integer NOT NULL CHECK (stay_nights > 0),
  booked_at timestamptz NOT NULL,
  lead_time_days numeric(12,4) NOT NULL,
  accommodation_minor bigint NOT NULL CHECK (accommodation_minor >= 0),
  gross_revenue_minor bigint NOT NULL CHECK (gross_revenue_minor >= 0),
  source_version integer NOT NULL CHECK (source_version > 0),
  source_updated_at timestamptz NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out_at > check_in_at),
  CHECK (check_out_local_date > check_in_local_date)
);
CREATE INDEX analytics_reservation_facts_property_dates_idx
  ON analytics_reservation_facts(property_id,check_in_local_date,check_out_local_date);
CREATE INDEX analytics_reservation_facts_org_status_idx
  ON analytics_reservation_facts(organization_id,status);

CREATE TABLE analytics_payment_facts (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  currency char(3) NOT NULL,
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
  refunded_minor bigint NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
  net_collected_minor bigint NOT NULL DEFAULT 0,
  source_updated_at timestamptz NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_minor <= captured_minor),
  CHECK (net_collected_minor = captured_minor-refunded_minor)
);
CREATE INDEX analytics_payment_facts_property_idx
  ON analytics_payment_facts(property_id,currency);

ALTER TABLE analytics_projection_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_reservation_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_payment_facts ENABLE ROW LEVEL SECURITY;

ALTER TABLE analytics_projection_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_reservation_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_payment_facts FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_projection_consumptions_tenant
ON analytics_projection_consumptions
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY analytics_reservation_facts_tenant
ON analytics_reservation_facts
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY analytics_payment_facts_tenant
ON analytics_payment_facts
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE OR REPLACE VIEW analytics_property_daily WITH (security_invoker=true) AS
WITH property_dates AS (
  SELECT
    p.organization_id,
    p.id AS property_id,
    gs::date AS local_date,
    COUNT(u.id) FILTER (WHERE u.status='active')::integer AS available_unit_nights
  FROM properties p
  JOIN units u ON u.property_id=p.id
  CROSS JOIN LATERAL generate_series(
    current_date-interval '730 days',
    current_date+interval '730 days',
    interval '1 day'
  ) gs
  GROUP BY p.organization_id,p.id,gs::date
),
reservation_night_facts AS (
  SELECT
    f.organization_id,
    f.property_id,
    f.reservation_id,
    f.currency,
    gs.local_date::date AS local_date,
    f.lead_time_days,
    f.stay_nights,
    (
      f.accommodation_minor/f.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(f.accommodation_minor,f.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS accommodation_revenue_minor,
    (
      f.gross_revenue_minor/f.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(f.gross_revenue_minor,f.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS gross_revenue_minor,
    (
      COALESCE(p.net_collected_minor,0)/f.stay_nights
      + CASE
          WHEN gs.ordinality<=mod(COALESCE(p.net_collected_minor,0),f.stay_nights) THEN 1
          ELSE 0
        END
    )::bigint AS net_revenue_minor
  FROM analytics_reservation_facts f
  LEFT JOIN analytics_payment_facts p
    ON p.reservation_id=f.reservation_id
   AND p.organization_id=f.organization_id
  CROSS JOIN LATERAL generate_series(
    f.check_in_local_date::timestamp,
    (f.check_out_local_date-1)::timestamp,
    interval '1 day'
  ) WITH ORDINALITY AS gs(local_date,ordinality)
  WHERE f.status IN ('confirmed','checked_in','checked_out')
),
daily AS (
  SELECT
    organization_id,
    property_id,
    local_date,
    currency,
    COUNT(*)::integer AS occupied_unit_nights,
    COUNT(DISTINCT reservation_id)::integer AS booking_count,
    SUM(accommodation_revenue_minor)::bigint AS accommodation_revenue_minor,
    SUM(gross_revenue_minor)::bigint AS gross_revenue_minor,
    SUM(net_revenue_minor)::bigint AS net_revenue_minor,
    SUM(lead_time_days) AS lead_time_days_sum,
    SUM(stay_nights)::bigint AS stay_nights_sum
  FROM reservation_night_facts
  GROUP BY organization_id,property_id,local_date,currency
)
SELECT
  d.organization_id,
  d.property_id,
  d.local_date,
  a.currency,
  d.available_unit_nights,
  COALESCE(a.occupied_unit_nights,0) AS occupied_unit_nights,
  COALESCE(a.booking_count,0) AS booking_count,
  COALESCE(a.accommodation_revenue_minor,0) AS accommodation_revenue_minor,
  COALESCE(a.gross_revenue_minor,0) AS gross_revenue_minor,
  COALESCE(a.net_revenue_minor,0) AS net_revenue_minor,
  CASE
    WHEN d.available_unit_nights=0 THEN 0::numeric
    ELSE ROUND(COALESCE(a.occupied_unit_nights,0)::numeric/d.available_unit_nights,6)
  END AS occupancy,
  CASE
    WHEN COALESCE(a.occupied_unit_nights,0)=0 THEN 0::numeric
    ELSE ROUND(COALESCE(a.accommodation_revenue_minor,0)::numeric/a.occupied_unit_nights,2)
  END AS adr_minor,
  CASE
    WHEN d.available_unit_nights=0 THEN 0::numeric
    ELSE ROUND(COALESCE(a.accommodation_revenue_minor,0)::numeric/d.available_unit_nights,2)
  END AS revpar_minor,
  CASE
    WHEN COALESCE(a.booking_count,0)=0 THEN 0::numeric
    ELSE ROUND(COALESCE(a.lead_time_days_sum,0)::numeric/a.booking_count,2)
  END AS avg_lead_time_days,
  CASE
    WHEN COALESCE(a.booking_count,0)=0 THEN 0::numeric
    ELSE ROUND(COALESCE(a.stay_nights_sum,0)::numeric/a.booking_count,2)
  END AS avg_stay_nights
FROM property_dates d
LEFT JOIN daily a
  ON a.organization_id=d.organization_id
 AND a.property_id=d.property_id
 AND a.local_date=d.local_date;

COMMIT;
