BEGIN;

CREATE OR REPLACE VIEW analytics_organization_daily_rollups
WITH (security_invoker=true) AS
SELECT
  r.organization_id,
  r.local_date,
  r.currency,
  SUM(r.available_unit_nights)::bigint AS available_unit_nights,
  SUM(r.occupied_unit_nights)::bigint AS occupied_unit_nights,
  SUM(r.booking_count)::bigint AS booking_count,
  SUM(r.accommodation_revenue_minor)::bigint AS accommodation_revenue_minor,
  SUM(r.gross_revenue_minor)::bigint AS gross_revenue_minor,
  SUM(r.net_revenue_minor)::bigint AS net_revenue_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.occupied_unit_nights)::numeric/SUM(r.available_unit_nights),6
    )
  END AS occupancy,
  CASE
    WHEN SUM(r.occupied_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.occupied_unit_nights),2
    )
  END AS adr_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.available_unit_nights),2
    )
  END AS revpar_minor,
  MAX(r.refreshed_at) AS refreshed_at
FROM analytics_property_daily_rollups r
WHERE app.can_access_property(r.property_id)
GROUP BY r.organization_id,r.local_date,r.currency;

CREATE OR REPLACE VIEW analytics_city_daily_rollups
WITH (security_invoker=true) AS
SELECT
  r.organization_id,
  p.country_code,
  p.region_code,
  p.city,
  r.local_date,
  r.currency,
  COUNT(DISTINCT r.property_id)::integer AS property_count,
  SUM(r.available_unit_nights)::bigint AS available_unit_nights,
  SUM(r.occupied_unit_nights)::bigint AS occupied_unit_nights,
  SUM(r.booking_count)::bigint AS booking_count,
  SUM(r.accommodation_revenue_minor)::bigint AS accommodation_revenue_minor,
  SUM(r.gross_revenue_minor)::bigint AS gross_revenue_minor,
  SUM(r.net_revenue_minor)::bigint AS net_revenue_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.occupied_unit_nights)::numeric/SUM(r.available_unit_nights),6
    )
  END AS occupancy,
  CASE
    WHEN SUM(r.occupied_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.occupied_unit_nights),2
    )
  END AS adr_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.available_unit_nights),2
    )
  END AS revpar_minor,
  CASE
    WHEN SUM(r.booking_count)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.avg_lead_time_days*r.booking_count)::numeric/SUM(r.booking_count),2
    )
  END AS avg_lead_time_days,
  CASE
    WHEN SUM(r.booking_count)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.avg_stay_nights*r.booking_count)::numeric/SUM(r.booking_count),2
    )
  END AS avg_stay_nights,
  MAX(r.refreshed_at) AS refreshed_at
FROM analytics_property_daily_rollups r
JOIN properties p
  ON p.id=r.property_id
 AND p.organization_id=r.organization_id
WHERE app.can_access_property(r.property_id)
GROUP BY
  r.organization_id,p.country_code,p.region_code,p.city,r.local_date,r.currency;

CREATE OR REPLACE VIEW analytics_country_daily_rollups
WITH (security_invoker=true) AS
SELECT
  r.organization_id,
  p.country_code,
  r.local_date,
  r.currency,
  COUNT(DISTINCT r.property_id)::integer AS property_count,
  SUM(r.available_unit_nights)::bigint AS available_unit_nights,
  SUM(r.occupied_unit_nights)::bigint AS occupied_unit_nights,
  SUM(r.booking_count)::bigint AS booking_count,
  SUM(r.accommodation_revenue_minor)::bigint AS accommodation_revenue_minor,
  SUM(r.gross_revenue_minor)::bigint AS gross_revenue_minor,
  SUM(r.net_revenue_minor)::bigint AS net_revenue_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.occupied_unit_nights)::numeric/SUM(r.available_unit_nights),6
    )
  END AS occupancy,
  CASE
    WHEN SUM(r.occupied_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.occupied_unit_nights),2
    )
  END AS adr_minor,
  CASE
    WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.accommodation_revenue_minor)::numeric/SUM(r.available_unit_nights),2
    )
  END AS revpar_minor,
  CASE
    WHEN SUM(r.booking_count)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.avg_lead_time_days*r.booking_count)::numeric/SUM(r.booking_count),2
    )
  END AS avg_lead_time_days,
  CASE
    WHEN SUM(r.booking_count)=0 THEN 0::numeric
    ELSE ROUND(
      SUM(r.avg_stay_nights*r.booking_count)::numeric/SUM(r.booking_count),2
    )
  END AS avg_stay_nights,
  MAX(r.refreshed_at) AS refreshed_at
FROM analytics_property_daily_rollups r
JOIN properties p
  ON p.id=r.property_id
 AND p.organization_id=r.organization_id
WHERE app.can_access_property(r.property_id)
GROUP BY r.organization_id,p.country_code,r.local_date,r.currency;

COMMIT;
