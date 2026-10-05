BEGIN;

CREATE TABLE analytics_rollup_dirty_ranges (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  dirty_from date NOT NULL,
  dirty_to date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,property_id),
  CHECK (dirty_to>=dirty_from)
);

CREATE TABLE analytics_property_daily_rollups (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id),
  local_date date NOT NULL,
  currency char(3) NOT NULL,
  available_unit_nights integer NOT NULL CHECK (available_unit_nights>=0),
  occupied_unit_nights integer NOT NULL CHECK (occupied_unit_nights>=0),
  booking_count integer NOT NULL CHECK (booking_count>=0),
  accommodation_revenue_minor bigint NOT NULL,
  gross_revenue_minor bigint NOT NULL,
  net_revenue_minor bigint NOT NULL,
  occupancy numeric(12,6) NOT NULL,
  adr_minor numeric(18,2) NOT NULL,
  revpar_minor numeric(18,2) NOT NULL,
  avg_lead_time_days numeric(18,2) NOT NULL,
  avg_stay_nights numeric(18,2) NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,property_id,local_date,currency)
);

CREATE INDEX analytics_property_daily_rollups_date_idx
  ON analytics_property_daily_rollups(organization_id,local_date,property_id,currency);

ALTER TABLE analytics_rollup_dirty_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_property_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_rollup_dirty_ranges FORCE ROW LEVEL SECURITY;
ALTER TABLE analytics_property_daily_rollups FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_rollup_dirty_ranges_tenant
ON analytics_rollup_dirty_ranges
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY analytics_property_daily_rollups_tenant
ON analytics_property_daily_rollups
USING (organization_id=app.current_organization_id())
WITH CHECK (organization_id=app.current_organization_id());

CREATE OR REPLACE VIEW analytics_organization_daily_rollups
WITH (security_invoker=true) AS
SELECT
  organization_id,
  local_date,
  currency,
  SUM(available_unit_nights)::bigint AS available_unit_nights,
  SUM(occupied_unit_nights)::bigint AS occupied_unit_nights,
  SUM(booking_count)::bigint AS booking_count,
  SUM(accommodation_revenue_minor)::bigint AS accommodation_revenue_minor,
  SUM(gross_revenue_minor)::bigint AS gross_revenue_minor,
  SUM(net_revenue_minor)::bigint AS net_revenue_minor,
  CASE
    WHEN SUM(available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(occupied_unit_nights)::numeric/SUM(available_unit_nights),6
    )
  END AS occupancy,
  CASE
    WHEN SUM(occupied_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(accommodation_revenue_minor)::numeric/SUM(occupied_unit_nights),2
    )
  END AS adr_minor,
  CASE
    WHEN SUM(available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(accommodation_revenue_minor)::numeric/SUM(available_unit_nights),2
    )
  END AS revpar_minor,
  MAX(refreshed_at) AS refreshed_at
FROM analytics_property_daily_rollups
GROUP BY organization_id,local_date,currency;

COMMIT;
