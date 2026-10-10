import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

const DASHBOARD_SCHEMA_VERSION=2;
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

      const comparisonPeriod=this.previousPeriod(input.from,input.to);
      const [sources,comparisonSources]=await Promise.all([
        this.sourceState(
          client,actor.organizationId,input.from,input.to,input.propertyId??null
        ),
        this.sourceState(
          client,actor.organizationId,comparisonPeriod.from,comparisonPeriod.to,input.propertyId??null
        )
      ]);
      const sourceFingerprint=this.hash({
        schemaVersion:DASHBOARD_SCHEMA_VERSION,
        organizationId:actor.organizationId,
        membershipId:actor.membershipId,
        propertyId:input.propertyId??null,
        from:input.from,
        to:input.to,
        sources,
        comparisonPeriod,
        comparisonSources
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
        geography,
        channelSegmentBreakdown,
        previousKpis,
        previousLifecycle,
        previousMarketplace
      ]=await Promise.all([
        this.kpis(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.lifecycle(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.marketplace(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.geography(client,actor.organizationId,input.from,input.to,input.propertyId??null),
        this.channelSegmentBreakdown(
          client,actor.organizationId,input.from,input.to,input.propertyId??null
        ),
        this.kpis(
          client,actor.organizationId,comparisonPeriod.from,comparisonPeriod.to,input.propertyId??null
        ),
        this.lifecycle(
          client,actor.organizationId,comparisonPeriod.from,comparisonPeriod.to,input.propertyId??null
        ),
        this.marketplace(
          client,actor.organizationId,comparisonPeriod.from,comparisonPeriod.to,input.propertyId??null
        )
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
          scopeFingerprint:sources.scopeFingerprint,
          scopePropertyCount:sources.propertyIds.length,
          rollupRefreshedAt:sources.rollupRefreshedAt,
          rollupRowCount:sources.rollupRowCount,
          reservationProjectedAt:sources.reservationProjectedAt,
          reservationFactCount:sources.reservationFactCount,
          economicsProjectedAt:sources.economicsProjectedAt,
          economicsFactCount:sources.economicsFactCount
        },
        kpisByCurrency,
        lifecycleByCurrency,
        marketplaceByCurrency,
        geography,
        channelSegmentBreakdown,
        comparison:{
          mode:"previous_equal_period",
          period:comparisonPeriod,
          freshness:{
            projectionStatus:comparisonSources.projectionStatus,
            pendingEvents:comparisonSources.pendingEvents,
            oldestPendingAt:comparisonSources.oldestPendingAt,
            lastProcessedAt:comparisonSources.lastProcessedAt,
            scopePropertyCount:comparisonSources.propertyIds.length,
            rollupRefreshedAt:comparisonSources.rollupRefreshedAt,
            rollupRowCount:comparisonSources.rollupRowCount,
            reservationProjectedAt:comparisonSources.reservationProjectedAt,
            reservationFactCount:comparisonSources.reservationFactCount,
            economicsProjectedAt:comparisonSources.economicsProjectedAt,
            economicsFactCount:comparisonSources.economicsFactCount
          },
          kpisByCurrency:this.compareKpis(kpisByCurrency,previousKpis),
          lifecycleByCurrency:this.compareLifecycle(lifecycleByCurrency,previousLifecycle),
          marketplaceByCurrency:this.compareMarketplace(
            marketplaceByCurrency,previousMarketplace
          )
        }
      };
      const expiresAt=new Date(generatedAt.getTime()+CACHE_TTL_SECONDS*1000);

      await client.query(
        `INSERT INTO analytics_dashboard_cache(
           cache_key,organization_id,membership_id,property_id,property_ids,from_date,to_date,
           schema_version,source_fingerprint,payload,generated_at,expires_at
         ) VALUES($1,$2,$3,$4,$5::uuid[],$6::date,$7::date,$8,$9,$10::jsonb,$11,$12)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload=EXCLUDED.payload,
           generated_at=EXCLUDED.generated_at,
           expires_at=EXCLUDED.expires_at`,
        [
          cacheKey,actor.organizationId,actor.membershipId,input.propertyId??null,
          sources.propertyIds,input.from,input.to,DASHBOARD_SCHEMA_VERSION,sourceFingerprint,
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
    const scope=(await client.query<{property_ids:string[]}>(
      `SELECT COALESCE(
         array_agg(p.id::text ORDER BY p.id),
         ARRAY[]::text[]
       ) AS property_ids
       FROM properties p
       WHERE p.organization_id=$1
         AND app.can_access_property(p.id)
         AND ($2::uuid IS NULL OR p.id=$2)`,
      [organizationId,propertyId]
    )).rows[0];

    const propertyIds=scope?.property_ids??[];
    const scopeFingerprint=this.hash(propertyIds);

    const timestamps=(await client.query<{
      rollup_refreshed_at:Date|null;rollup_row_count:string;
      reservation_projected_at:Date|null;reservation_fact_count:string;
      economics_projected_at:Date|null;economics_fact_count:string;
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
           SELECT COUNT(*)::text
             FROM analytics_property_daily_rollups r
            WHERE r.organization_id=$1
              AND r.local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(r.property_id)
              AND ($4::uuid IS NULL OR r.property_id=$4)
         ) AS rollup_row_count,
         (
           SELECT MAX(f.projected_at)
             FROM analytics_reservation_facts f
            WHERE f.organization_id=$1
              AND f.check_in_local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(f.property_id)
              AND ($4::uuid IS NULL OR f.property_id=$4)
         ) AS reservation_projected_at,
         (
           SELECT COUNT(*)::text
             FROM analytics_reservation_facts f
            WHERE f.organization_id=$1
              AND f.check_in_local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(f.property_id)
              AND ($4::uuid IS NULL OR f.property_id=$4)
         ) AS reservation_fact_count,
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
         ) AS economics_projected_at,
         (
           SELECT COUNT(*)::text
             FROM analytics_marketplace_economic_facts e
             JOIN analytics_reservation_facts f
               ON f.reservation_id=e.reservation_id
              AND f.organization_id=e.organization_id
            WHERE e.organization_id=$1
              AND f.check_in_local_date BETWEEN $2::date AND $3::date
              AND app.can_access_property(e.property_id)
              AND ($4::uuid IS NULL OR e.property_id=$4)
         ) AS economics_fact_count`,
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
      propertyIds,
      scopeFingerprint,
      projectionStatus:health?.status??"healthy",
      pendingEvents:Number(health?.pending_events??0),
      oldestPendingAt:health?.oldest_pending_at?.toISOString()??null,
      lastProcessedAt:health?.last_processed_at?.toISOString()??null,
      consecutiveFailures:Number(health?.consecutive_failures??0),
      lastErrorCode:health?.last_error_code??null,
      rollupRefreshedAt:timestamps?.rollup_refreshed_at?.toISOString()??null,
      rollupRowCount:Number(timestamps?.rollup_row_count??0),
      reservationProjectedAt:timestamps?.reservation_projected_at?.toISOString()??null,
      reservationFactCount:Number(timestamps?.reservation_fact_count??0),
      economicsProjectedAt:timestamps?.economics_projected_at?.toISOString()??null,
      economicsFactCount:Number(timestamps?.economics_fact_count??0)
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

  private async channelSegmentBreakdown(
    client:PoolClient,
    organizationId:string,
    from:string,
    to:string,
    propertyId:string|null
  ){
    const rows=await client.query<{
      currency:string;booking_channel:string|null;market_segment:string|null;
      booking_count:string;active_or_stayed_count:string;cancellation_count:string;
      no_show_count:string;cancellation_rate:string;no_show_rate:string;
      economics_reservation_count:string;economics_coverage_rate:string|null;
      net_collected_minor:string;platform_commission_minor:string;owner_payable_minor:string;
      platform_commission_rate:string;owner_payable_rate:string;
    }>(
      `WITH lifecycle AS (
         SELECT
           c.currency,c.booking_channel,c.market_segment,
           SUM(c.booking_count)::bigint AS booking_count,
           SUM(c.active_or_stayed_count)::bigint AS active_or_stayed_count,
           SUM(c.cancellation_count)::bigint AS cancellation_count,
           SUM(c.no_show_count)::bigint AS no_show_count
         FROM analytics_booking_cohorts_daily c
         WHERE c.organization_id=$1
           AND c.arrival_date BETWEEN $2::date AND $3::date
           AND app.can_access_property(c.property_id)
           AND ($4::uuid IS NULL OR c.property_id=$4)
         GROUP BY c.currency,c.booking_channel,c.market_segment
       ),
       economics AS (
         SELECT
           e.currency,e.booking_channel,e.market_segment,
           SUM(e.reservation_count)::bigint AS reservation_count,
           SUM(e.net_collected_minor)::bigint AS net_collected_minor,
           SUM(e.platform_commission_minor)::bigint AS platform_commission_minor,
           SUM(e.owner_payable_minor)::bigint AS owner_payable_minor
         FROM analytics_marketplace_arrival_daily e
         WHERE e.organization_id=$1
           AND e.arrival_date BETWEEN $2::date AND $3::date
           AND app.can_access_property(e.property_id)
           AND ($4::uuid IS NULL OR e.property_id=$4)
         GROUP BY e.currency,e.booking_channel,e.market_segment
       )
       SELECT
         COALESCE(l.currency,e.currency) AS currency,
         COALESCE(l.booking_channel,e.booking_channel) AS booking_channel,
         COALESCE(l.market_segment,e.market_segment) AS market_segment,
         COALESCE(l.booking_count,0)::text AS booking_count,
         COALESCE(l.active_or_stayed_count,0)::text AS active_or_stayed_count,
         COALESCE(l.cancellation_count,0)::text AS cancellation_count,
         COALESCE(l.no_show_count,0)::text AS no_show_count,
         CASE
           WHEN COALESCE(l.booking_count,0)=0 THEN 0::numeric
           ELSE ROUND(l.cancellation_count::numeric/l.booking_count,6)
         END::text AS cancellation_rate,
         CASE
           WHEN COALESCE(l.booking_count,0)=0 THEN 0::numeric
           ELSE ROUND(l.no_show_count::numeric/l.booking_count,6)
         END::text AS no_show_rate,
         COALESCE(e.reservation_count,0)::text AS economics_reservation_count,
         CASE
           WHEN COALESCE(l.booking_count,0)=0 THEN NULL::numeric
           ELSE ROUND(COALESCE(e.reservation_count,0)::numeric/l.booking_count,6)
         END::text AS economics_coverage_rate,
         COALESCE(e.net_collected_minor,0)::text AS net_collected_minor,
         COALESCE(e.platform_commission_minor,0)::text AS platform_commission_minor,
         COALESCE(e.owner_payable_minor,0)::text AS owner_payable_minor,
         CASE
           WHEN COALESCE(e.net_collected_minor,0)=0 THEN 0::numeric
           ELSE ROUND(e.platform_commission_minor::numeric/e.net_collected_minor,6)
         END::text AS platform_commission_rate,
         CASE
           WHEN COALESCE(e.net_collected_minor,0)=0 THEN 0::numeric
           ELSE ROUND(e.owner_payable_minor::numeric/e.net_collected_minor,6)
         END::text AS owner_payable_rate
       FROM lifecycle l
       FULL OUTER JOIN economics e
         ON e.currency=l.currency
        AND e.booking_channel IS NOT DISTINCT FROM l.booking_channel
        AND e.market_segment IS NOT DISTINCT FROM l.market_segment
       ORDER BY
         COALESCE(l.currency,e.currency),
         COALESCE(l.booking_channel,e.booking_channel) NULLS LAST,
         COALESCE(l.market_segment,e.market_segment) NULLS LAST`,
      [organizationId,from,to,propertyId]
    );

    return rows.rows.map(row=>({
      currency:row.currency,
      bookingChannel:row.booking_channel,
      marketSegment:row.market_segment,
      bookingCount:Number(row.booking_count),
      activeOrStayedCount:Number(row.active_or_stayed_count),
      cancellationCount:Number(row.cancellation_count),
      noShowCount:Number(row.no_show_count),
      cancellationRate:Number(row.cancellation_rate),
      noShowRate:Number(row.no_show_rate),
      economicsReservationCount:Number(row.economics_reservation_count),
      economicsCoverageRate:row.economics_coverage_rate===null
        ?null
        :Number(row.economics_coverage_rate),
      netCollectedMinor:row.net_collected_minor,
      platformCommissionMinor:row.platform_commission_minor,
      ownerPayableMinor:row.owner_payable_minor,
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

  private compareKpis(current:any[],previous:any[]){
    return this.currencyPairs(current,previous).map(({currency,currentRow,previousRow})=>({
      currency,
      current:currentRow,
      previous:previousRow,
      delta:currentRow&&previousRow?{
        bookingCount:Number(currentRow.bookingCount)-Number(previousRow.bookingCount),
        occupiedUnitNights:Number(currentRow.occupiedUnitNights)-Number(previousRow.occupiedUnitNights),
        accommodationRevenueMinor:this.integerDelta(
          currentRow.accommodationRevenueMinor,previousRow.accommodationRevenueMinor
        ),
        grossRevenueMinor:this.integerDelta(
          currentRow.grossRevenueMinor,previousRow.grossRevenueMinor
        ),
        netRevenueMinor:this.integerDelta(
          currentRow.netRevenueMinor,previousRow.netRevenueMinor
        ),
        occupancy:this.numberDelta(currentRow.occupancy,previousRow.occupancy),
        adrMinor:this.fixedDelta(currentRow.adrMinor,previousRow.adrMinor,2),
        revparMinor:this.fixedDelta(currentRow.revparMinor,previousRow.revparMinor,2),
        avgLeadTimeDays:this.numberDelta(
          currentRow.avgLeadTimeDays,previousRow.avgLeadTimeDays
        ),
        avgStayNights:this.numberDelta(
          currentRow.avgStayNights,previousRow.avgStayNights
        )
      }:null
    }));
  }

  private compareLifecycle(current:any[],previous:any[]){
    return this.currencyPairs(current,previous).map(({currency,currentRow,previousRow})=>({
      currency,
      current:currentRow,
      previous:previousRow,
      delta:currentRow&&previousRow?{
        bookingCount:Number(currentRow.bookingCount)-Number(previousRow.bookingCount),
        cancellationCount:Number(currentRow.cancellationCount)-Number(previousRow.cancellationCount),
        noShowCount:Number(currentRow.noShowCount)-Number(previousRow.noShowCount),
        cancellationRate:this.numberDelta(
          currentRow.cancellationRate,previousRow.cancellationRate
        ),
        noShowRate:this.numberDelta(currentRow.noShowRate,previousRow.noShowRate),
        avgLeadTimeDays:this.numberDelta(
          currentRow.avgLeadTimeDays,previousRow.avgLeadTimeDays
        ),
        avgStayNights:this.numberDelta(
          currentRow.avgStayNights,previousRow.avgStayNights
        )
      }:null
    }));
  }

  private compareMarketplace(current:any[],previous:any[]){
    return this.currencyPairs(current,previous).map(({currency,currentRow,previousRow})=>({
      currency,
      current:currentRow,
      previous:previousRow,
      delta:currentRow&&previousRow?{
        reservationCount:Number(currentRow.reservationCount)-Number(previousRow.reservationCount),
        netCollectedMinor:this.integerDelta(
          currentRow.netCollectedMinor,previousRow.netCollectedMinor
        ),
        platformCommissionMinor:this.integerDelta(
          currentRow.platformCommissionMinor,previousRow.platformCommissionMinor
        ),
        ownerPayableMinor:this.integerDelta(
          currentRow.ownerPayableMinor,previousRow.ownerPayableMinor
        ),
        platformCommissionRate:this.numberDelta(
          currentRow.platformCommissionRate,previousRow.platformCommissionRate
        ),
        ownerPayableRate:this.numberDelta(
          currentRow.ownerPayableRate,previousRow.ownerPayableRate
        )
      }:null
    }));
  }

  private currencyPairs(current:any[],previous:any[]){
    const currencies=[...new Set(
      [...current,...previous].map(row=>String(row.currency))
    )].sort();
    return currencies.map(currency=>({
      currency,
      currentRow:current.find(row=>row.currency===currency)??null,
      previousRow:previous.find(row=>row.currency===currency)??null
    }));
  }

  private previousPeriod(from:string,to:string){
    const dayMs=86400000;
    const start=Date.parse(from+"T00:00:00Z");
    const end=Date.parse(to+"T00:00:00Z");
    const days=Math.floor((end-start)/dayMs)+1;
    const previousTo=new Date(start-dayMs);
    const previousFrom=new Date(previousTo.getTime()-(days-1)*dayMs);
    return {
      from:previousFrom.toISOString().slice(0,10),
      to:previousTo.toISOString().slice(0,10)
    };
  }

  private integerDelta(current:string,previous:string){
    return (BigInt(current)-BigInt(previous)).toString();
  }

  private fixedDelta(current:string,previous:string,scale:number){
    return this.formatFixed(
      this.parseFixed(current,scale)-this.parseFixed(previous,scale),
      scale
    );
  }

  private parseFixed(value:string,scale:number){
    const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
    if(!match)throw new Error("INVALID_DASHBOARD_DECIMAL");
    const factor=10n**BigInt(scale);
    const fraction=(match[3]??"").padEnd(scale,"0").slice(0,scale);
    let result=BigInt(match[2])*factor+BigInt(fraction||"0");
    if(match[1]==="-")result=-result;
    return result;
  }

  private formatFixed(value:bigint,scale:number){
    const negative=value<0n;
    const absolute=negative?-value:value;
    const factor=10n**BigInt(scale);
    const integer=absolute/factor;
    const fraction=(absolute%factor).toString().padStart(scale,"0");
    return (negative?"-":"")+integer.toString()+(scale?"."+fraction:"");
  }

  private numberDelta(current:number,previous:number){
    return Number((Number(current)-Number(previous)).toFixed(6));
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
