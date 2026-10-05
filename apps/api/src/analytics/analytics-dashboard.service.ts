import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

const DASHBOARD_SCHEMA_VERSION=1;
const CACHE_TTL_SECONDS=300;
const MAX_RANGE_DAYS=366;

@Injectable()
export class AnalyticsDashboardService{
  constructor(private readonly db:DatabaseService){}

  async summary(
    actor:RequestActorContext,
    input:{from:string;to:string;propertyId?:string|null}
  ){
    this.validateDates(input.from,input.to);

    return this.db.withActor(actor,async client=>{
      await this.assertAccess(client,input.propertyId??null);

      const sources=await this.sourceState(
        client,actor.organizationId,input.from,input.to,input.propertyId??null
      );
      const sourceFingerprint=this.hash({
        schemaVersion:DASHBOARD_SCHEMA_VERSION,
        organizationId:actor.organizationId,
        membershipId:actor.membershipId,
        propertyId:input.propertyId??null,
        from:input.from,
        to:input.to,
        sources
      });
      const cacheKey=this.hash({
        schemaVersion:DASHBOARD_SCHEMA_VERSION,
        organizationId:actor.organizationId,
        membershipId:actor.membershipId,
        propertyId:input.propertyId??null,
        from:input.from,
        to:input.to,
        sourceFingerprint
      });

      const cached=(await client.query<{
        payload:Record<string,unknown>;generated_at:Date;expires_at:Date;
      }>(
        `SELECT payload,generated_at,expires_at
           FROM analytics_dashboard_cache
          WHERE cache_key=$1
            AND organization_id=$2
            AND membership_id=$3
            AND expires_at>now()
          LIMIT 1`,
        [cacheKey,actor.organizationId,actor.membershipId]
      )).rows[0];

      if(cached){
        return {
          ...cached.payload,
          cache:{
            hit:true,
            generatedAt:cached.generated_at.toISOString(),
            expiresAt:cached.expires_at.toISOString()
          }
        };
      }

      const [
        kpisByCurrency,
        lifecycleByCurrency,
        marketplaceByCurrency,
        geography
      ]=await Promise.all([
        this.kpis(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.lifecycle(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.marketplace(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.geography(client,actor.organizationId,input.from,input.to,input.propertyId??null)
      ]);

      const generatedAt=new Date();
      const payload={
        schemaVersion:DASHBOARD_SCHEMA_VERSION,
        scope:{
          organizationId:actor.organizationId,
          propertyId:input.propertyId??null
        },
        period:{from:input.from,to:input.to},
        freshness:{
          sourceFingerprint,
          projectionStatus:sources.projectionStatus,
          pendingEvents:sources.pendingEvents,
          oldestPendingAt:sources.oldestPendingAt,
          lastProcessedAt:sources.lastProcessedAt,
          consecutiveFailures:sources.consecutiveFailures,
          lastErrorCode:sources.lastErrorCode,
          rollupRefreshedAt:sources.rollupRefreshedAt,
          reservationProjectedAt:sources.reservationProjectedAt,
          economicsProjectedAt:sources.economicsProjectedAt
        },
        kpisByCurrency,
        lifecycleByCurrency,
        marketplaceByCurrency,
        geography
      };
      const expiresAt=new Date(generatedAt.getTime()+CACHE_TTL_SECONDS*1000);

      await client.query(
        `INSERT INTO analytics_dashboard_cache(
           cache_key,organization_id,membership_id,property_id,from_date,to_date,
           schema_version,source_fingerprint,payload,generated_at,expires_at
         ) VALUES($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb,$10,$11)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload=EXCLUDED.payload,
           generated_at=EXCLUDED.generated_at,
           expires_at=EXCLUDED.expires_at`,
        [
          cacheKey,actor.organizationId,actor.membershipId,input.propertyId??null,
          input.from,input.to,DASHBOARD_SCHEMA_VERSION,sourceFingerprint,
          JSON.stringify(payload),generatedAt,expiresAt
        ]
      );

      await client.query(
        `DELETE FROM analytics_dashboard_cache
          WHERE cache_key IN (
            SELECT cache_key
              FROM analytics_dashboard_cache
             WHERE organization_id=$1
               AND membership_id=$2
               AND expires_at<=now()
             ORDER BY expires_at
             LIMIT 100
          )`,
        [actor.organizationId,actor.membershipId]
      );

      return {
        ...payload,
        cache:{
          hit:false,
          generatedAt:generatedAt.toISOString(),
          expiresAt:expiresAt.toISOString()
        }
      };
    });
  }

  private async sourceState(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const timestamps=(await client.query<{
      rollup_refreshed_at:Date|null;
      reservation_projected_at:Date|null;
      economics_projected_at:Date|null;
    }>(
      `SELECT
         (
           SELECT MAX(r.refreshed_at)
             FROM analytics_property_daily_rollups r
            WHERE r.organization_id=$1
              AND r.local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(r.property_id)
              AND ($4::uuid IS NULL OR r.property_id=$4)
         ) AS rollup_refreshed_at,
         (
           SELECT MAX(f.projected_at)
             FROM analytics_reservation_facts f
            WHERE f.organization_id=$1
              AND f.check_in_local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(f.property_id)
              AND ($4::uuid IS NULL OR f.property_id=$4)
         ) AS reservation_projected_at,
         (
           SELECT MAX(e.projected_at)
             FROM analytics_marketplace_economic_facts e
             JOIN analytics_reservation_facts f
               ON f.reservation_id=e.reservation_id
              AND f.organization_id=e.organization_id
            WHERE e.organization_id=$1
              AND f.check_in_local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(e.property_id)
              AND ($4::uuid IS NULL OR e.property_id=$4)
         ) AS economics_projected_at`,
      [organizationId,from,to,propertyId]
    )).rows[0];

    const health=(await client.query<{
      pending_events:number;oldest_pending_at:Date|null;last_processed_at:Date|null;
      consecutive_failures:number;last_error_code:string|null;status:string;
    }>(
      `SELECT
         pending_events,oldest_pending_at,last_processed_at,
         consecutive_failures,last_error_code,status
       FROM analytics_projection_slo
       WHERE organization_id=$1`,
      [organizationId]
    )).rows[0];

    return {
      projectionStatus:health?.status??"healthy",
      pendingEvents:Number(health?.pending_events??0),
      oldestPendingAt:health?.oldest_pending_at?.toISOString()??null,
      lastProcessedAt:health?.last_processed_at?.toISOString()??null,
      consecutiveFailures:Number(health?.consecutive_failures??0),
      lastErrorCode:health?.last_error_code??null,
      rollupRefreshedAt:timestamps?.rollup_refreshed_at?.toISOString()??null,
      reservationProjectedAt:timestamps?.reservation_projected_at?.toISOString()??null,
      economicsProjectedAt:timestamps?.economics_projected_at?.toISOString()??null
    };
  }

  private async kpis(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const rows=await client.query<{
      currency:string;property_count:number;
      available_unit_nights:string;occupied_unit_nights:string;booking_count:string;
      accommodation_revenue_minor:string;gross_revenue_minor:string;net_revenue_minor:string;
      occupancy:string;adr_minor:string;revpar_minor:string;
      avg_lead_time_days:string;avg_stay_nights:string;
    }>(
      `SELECT
         r.currency,
         COUNT(DISTINCT r.property_id)::integer AS property_count,
         SUM(r.available_unit_nights)::text AS available_unit_nights,
         SUM(r.occupied_unit_nights)::text AS occupied_unit_nights,
         SUM(r.booking_count)::text AS booking_count,
         SUM(r.accommodation_revenue_minor)::text AS accommodation_revenue_minor,
         SUM(r.gross_revenue_minor)::text AS gross_revenue_minor,
         SUM(r.net_revenue_minor)::text AS net_revenue_minor,
         CASE
           WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.occupied_unit_nights)::numeric/SUM(r.available_unit_nights),6)
         END::text AS occupancy,
         CASE
           WHEN SUM(r.occupied_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.accommodation_revenue_minor)::numeric/SUM(r.occupied_unit_nights),2)
         END::text AS adr_minor,
         CASE
           WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.accommodation_revenue_minor)::numeric/SUM(r.available_unit_nights),2)
         END::text AS revpar_minor,
         CASE
           WHEN SUM(r.booking_count)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(r.avg_lead_time_days*r.booking_count)::numeric/SUM(r.booking_count),2
           )
         END::text AS avg_lead_time_days,
         CASE
           WHEN SUM(r.booking_count)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(r.avg_stay_nights*r.booking_count)::numeric/SUM(r.booking_count),2
           )
         END::text AS avg_stay_nights
       FROM analytics_property_daily_rollups r
       WHERE r.organization_id=$1
         AND r.local_date BETWEEN $2::date AND $3::date
         AND app.can_access_property(r.property_id)
         AND ($4::uuid IS NULL OR r.property_id=$4)
       GROUP BY r.currency
       ORDER BY r.currency`,
      [organizationId,from,to,propertyId]
    );

    return rows.rows.map(row=>({
      currency:row.currency,
      propertyCount:Number(row.property_count),
      availableUnitNights:Number(row.available_unit_nights),
      occupiedUnitNights:Number(row.occupied_unit_nights),
      bookingCount:Number(row.booking_count),
      accommodationRevenueMinor:row.accommodation_revenue_minor,
      grossRevenueMinor:row.gross_revenue_minor,
      netRevenueMinor:row.net_revenue_minor,
      occupancy:Number(row.occupancy),
      adrMinor:row.adr_minor,
      revparMinor:row.revpar_minor,
      avgLeadTimeDays:Number(row.avg_lead_time_days),
      avgStayNights:Number(row.avg_stay_nights)
    }));
  }

  private async lifecycle(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const rows=await client.query<{
      currency:string;booking_count:string;active_or_stayed_count:string;
      cancellation_count:string;no_show_count:string;cancellation_rate:string;no_show_rate:string;
      avg_lead_time_days:string;avg_stay_nights:string;avg_cancellation_lead_days:string|null;
    }>(
      `SELECT
         c.currency,
         SUM(c.booking_count)::text AS booking_count,
         SUM(c.active_or_stayed_count)::text AS active_or_stayed_count,
         SUM(c.cancellation_count)::text AS cancellation_count,
         SUM(c.no_show_count)::text AS no_show_count,
         CASE
           WHEN SUM(c.booking_count)=0 THEN 0::numeric
           ELSE ROUND(SUM(c.cancellation_count)::numeric/SUM(c.booking_count),6)
         END::text AS cancellation_rate,
         CASE
           WHEN SUM(c.booking_count)=0 THEN 0::numeric
           ELSE ROUND(SUM(c.no_show_count)::numeric/SUM(c.booking_count),6)
         END::text AS no_show_rate,
         CASE
           WHEN SUM(c.booking_count)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(c.avg_lead_time_days*c.booking_count)::numeric/SUM(c.booking_count),2
           )
         END::text AS avg_lead_time_days,
         CASE
           WHEN SUM(c.booking_count)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(c.avg_stay_nights*c.booking_count)::numeric/SUM(c.booking_count),2
           )
         END::text AS avg_stay_nights,
         CASE
           WHEN SUM(c.cancellation_count)=0 THEN NULL::numeric
           ELSE ROUND(
             SUM(COALESCE(c.avg_cancellation_lead_days,0)*c.cancellation_count)::numeric
             /SUM(c.cancellation_count),2
           )
         END::text AS avg_cancellation_lead_days
       FROM analytics_booking_cohorts_daily c
       WHERE c.organization_id=$1
         AND c.arrival_date BETWEEN $2::date AND $3::date
         AND app.can_access_property(c.property_id)
         AND ($4::uuid IS NULL OR c.property_id=$4)
       GROUP BY c.currency
       ORDER BY c.currency`,
      [organizationId,from,to,propertyId]
    );

    return rows.rows.map(row=>({
      currency:row.currency,
      bookingCount:Number(row.booking_count),
      activeOrStayedCount:Number(row.active_or_stayed_count),
      cancellationCount:Number(row.cancellation_count),
      noShowCount:Number(row.no_show_count),
      cancellationRate:Number(row.cancellation_rate),
      noShowRate:Number(row.no_show_rate),
      avgLeadTimeDays:Number(row.avg_lead_time_days),
      avgStayNights:Number(row.avg_stay_nights),
      avgCancellationLeadDays:row.avg_cancellation_lead_days===null
        ?null
        :Number(row.avg_cancellation_lead_days)
    }));
  }

  private async marketplace(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const rows=await client.query<{
      currency:string;reservation_count:string;net_collected_minor:string;
      platform_commission_minor:string;owner_payable_minor:string;
      taxes_withheld_minor:string;other_deductions_minor:string;
      platform_commission_rate:string;owner_payable_rate:string;
    }>(
      `SELECT
         e.currency,
         SUM(e.reservation_count)::text AS reservation_count,
         SUM(e.net_collected_minor)::text AS net_collected_minor,
         SUM(e.platform_commission_minor)::text AS platform_commission_minor,
         SUM(e.owner_payable_minor)::text AS owner_payable_minor,
         SUM(e.taxes_withheld_minor)::text AS taxes_withheld_minor,
         SUM(e.other_deductions_minor)::text AS other_deductions_minor,
         CASE
           WHEN SUM(e.net_collected_minor)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(e.platform_commission_minor)::numeric/SUM(e.net_collected_minor),6
           )
         END::text AS platform_commission_rate,
         CASE
           WHEN SUM(e.net_collected_minor)=0 THEN 0::numeric
           ELSE ROUND(
             SUM(e.owner_payable_minor)::numeric/SUM(e.net_collected_minor),6
           )
         END::text AS owner_payable_rate
       FROM analytics_marketplace_arrival_daily e
       WHERE e.organization_id=$1
         AND e.arrival_date BETWEEN $2::date AND $3::date
         AND app.can_access_property(e.property_id)
         AND ($4::uuid IS NULL OR e.property_id=$4)
       GROUP BY e.currency
       ORDER BY e.currency`,
      [organizationId,from,to,propertyId]
    );

    return rows.rows.map(row=>({
      currency:row.currency,
      reservationCount:Number(row.reservation_count),
      netCollectedMinor:row.net_collected_minor,
      platformCommissionMinor:row.platform_commission_minor,
      ownerPayableMinor:row.owner_payable_minor,
      taxesWithheldMinor:row.taxes_withheld_minor,
      otherDeductionsMinor:row.other_deductions_minor,
      platformCommissionRate:Number(row.platform_commission_rate),
      ownerPayableRate:Number(row.owner_payable_rate)
    }));
  }

  private async geography(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const rows=await client.query<{
      country_code:string;region_code:string|null;city:string;currency:string;
      property_count:number;available_unit_nights:string;occupied_unit_nights:string;
      booking_count:string;accommodation_revenue_minor:string;gross_revenue_minor:string;
      net_revenue_minor:string;occupancy:string;adr_minor:string;revpar_minor:string;
    }>(
      `SELECT
         p.country_code::text,p.region_code,p.city,r.currency,
         COUNT(DISTINCT r.property_id)::integer AS property_count,
         SUM(r.available_unit_nights)::text AS available_unit_nights,
         SUM(r.occupied_unit_nights)::text AS occupied_unit_nights,
         SUM(r.booking_count)::text AS booking_count,
         SUM(r.accommodation_revenue_minor)::text AS accommodation_revenue_minor,
         SUM(r.gross_revenue_minor)::text AS gross_revenue_minor,
         SUM(r.net_revenue_minor)::text AS net_revenue_minor,
         CASE
           WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.occupied_unit_nights)::numeric/SUM(r.available_unit_nights),6)
         END::text AS occupancy,
         CASE
           WHEN SUM(r.occupied_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.accommodation_revenue_minor)::numeric/SUM(r.occupied_unit_nights),2)
         END::text AS adr_minor,
         CASE
           WHEN SUM(r.available_unit_nights)=0 THEN 0::numeric
           ELSE ROUND(SUM(r.accommodation_revenue_minor)::numeric/SUM(r.available_unit_nights),2)
         END::text AS revpar_minor
       FROM analytics_property_daily_rollups r
       JOIN properties p
         ON p.id=r.property_id
        AND p.organization_id=r.organization_id
       WHERE r.organization_id=$1
         AND r.local_date BETWEEN $2::date AND $3::date
         AND app.can_access_property(r.property_id)
         AND ($4::uuid IS NULL OR r.property_id=$4)
       GROUP BY p.country_code,p.region_code,p.city,r.currency
       ORDER BY p.country_code,p.city,r.currency`,
      [organizationId,from,to,propertyId]
    );

    return rows.rows.map(row=>({
      countryCode:row.country_code,
      regionCode:row.region_code,
      city:row.city,
      currency:row.currency,
      propertyCount:Number(row.property_count),
      availableUnitNights:Number(row.available_unit_nights),
      occupiedUnitNights:Number(row.occupied_unit_nights),
      bookingCount:Number(row.booking_count),
      accommodationRevenueMinor:row.accommodation_revenue_minor,
      grossRevenueMinor:row.gross_revenue_minor,
      netRevenueMinor:row.net_revenue_minor,
      occupancy:Number(row.occupancy),
      adrMinor:row.adr_minor,
      revparMinor:row.revpar_minor
    }));
  }

  private async assertAccess(client:PoolClient,propertyId:string|null){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!["host","owner","manager","accountant"].includes(role)){
      throw new Error("ANALYTICS_ROLE_FORBIDDEN");
    }

    if(propertyId){
      const allowed=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",
        [propertyId]
      )).rows[0]?.allowed;
      if(!allowed)throw new Error("PROPERTY_FORBIDDEN");
    }
  }

  private validateDates(from:string,to:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    if(from>to)throw new Error("INVALID_ANALYTICS_RANGE");

    const start=Date.parse(from+"T00:00:00Z");
    const end=Date.parse(to+"T00:00:00Z");
    if(!Number.isFinite(start)||!Number.isFinite(end)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    const days=Math.floor((end-start)/86400000)+1;
    if(days<1||days>MAX_RANGE_DAYS)throw new Error("ANALYTICS_RANGE_TOO_LARGE");
  }

  private hash(value:unknown){
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
