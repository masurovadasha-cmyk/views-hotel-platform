import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

const CACHE_TTL_SECONDS=60;
const MAX_RANGE_DAYS=366;
const PAYLOAD_VERSION=1;

type DashboardScope=
  | {type:"organization"}
  | {type:"property";propertyId:string};

type SourceState={
  rollupRefreshedAt:string|null;
  rollupRows:number;
  reservationProjectedAt:string|null;
  reservationFacts:number;
  economicsProjectedAt:string|null;
  economicsFacts:number;
};

type DashboardPayload={
  scope:{type:"organization"|"property";propertyId?:string;accessiblePropertyCount:number};
  range:{from:string;to:string};
  currencies:Array<{
    currency:string;
    hospitality:{
      availableUnitNights:number;
      occupiedUnitNights:number;
      accommodationRevenueMinor:string;
      grossRevenueMinor:string;
      netRevenueMinor:string;
      occupancy:number;
      adrMinor:string;
      revparMinor:string;
    };
    lifecycle:{
      bookingCount:number;
      activeOrStayedCount:number;
      cancellationCount:number;
      noShowCount:number;
      cancellationRate:number;
      noShowRate:number;
      avgLeadTimeDays:number;
      avgStayNights:number;
      avgCancellationLeadDays:number|null;
    };
    marketplace:{
      finalizedEconomicsPresent:boolean;
      netCollectedMinor:string;
      platformCommissionMinor:string;
      ownerPayableMinor:string;
      taxesWithheldMinor:string;
      otherDeductionsMinor:string;
      platformCommissionRate:number;
      ownerPayableRate:number;
    };
  }>;
};

@Injectable()
export class AnalyticsDashboardService{
  constructor(private readonly db:DatabaseService){}

  async summary(
    actor:RequestActorContext,
    scope:DashboardScope,
    from:string,
    to:string
  ){
    validateDateRange(from,to);

    return this.db.withActor(actor,async client=>{
      await assertDashboardRole(client);

      const propertyIds=await this.resolvePropertyIds(
        client,actor.organizationId,scope
      );
      const scopeKey=scope.type==="organization"
        ?"organization"
        :"property:"+scope.propertyId;
      const scopeHash=hash(propertyIds.join(","));
      const source=await this.sourceState(
        client,actor.organizationId,propertyIds,from,to
      );
      const sourceSignature=hash(JSON.stringify(source));
      const etag=hash([
        actor.organizationId,scopeKey,scopeHash,from,to,sourceSignature
      ].join(":"));

      const cached=(await client.query<{
        payload:DashboardPayload;generated_at:Date;expires_at:Date;
      }>(
        `SELECT payload,generated_at,expires_at
           FROM analytics_dashboard_cache
          WHERE organization_id=$1
            AND scope_key=$2
            AND scope_hash=$3
            AND from_date=$4::date
            AND to_date=$5::date
            AND source_signature=$6
            AND payload_version=$7
            AND expires_at>now()
          LIMIT 1`,
        [
          actor.organizationId,scopeKey,scopeHash,from,to,
          sourceSignature,PAYLOAD_VERSION
        ]
      )).rows[0];

      if(cached){
        return {
          ...cached.payload,
          freshness:{...source,sourceSignature,etag},
          cache:{
            hit:true,
            generatedAt:cached.generated_at.toISOString(),
            expiresAt:cached.expires_at.toISOString(),
            ttlSeconds:CACHE_TTL_SECONDS
          }
        };
      }

      const payload=await this.buildPayload(
        client,actor.organizationId,scope,propertyIds,from,to
      );

      const stored=(await client.query<{
        generated_at:Date;expires_at:Date;
      }>(
        `INSERT INTO analytics_dashboard_cache(
           id,organization_id,scope_key,scope_hash,property_ids,
           from_date,to_date,source_signature,payload_version,payload,
           generated_by_membership_id,generated_at,expires_at
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4::uuid[],$5::date,$6::date,$7,$8,$9::jsonb,
           $10,now(),now()+make_interval(secs=>$11)
         )
         ON CONFLICT(organization_id,scope_key,scope_hash,from_date,to_date)
         DO UPDATE SET
           property_ids=EXCLUDED.property_ids,
           source_signature=EXCLUDED.source_signature,
           payload_version=EXCLUDED.payload_version,
           payload=EXCLUDED.payload,
           generated_by_membership_id=EXCLUDED.generated_by_membership_id,
           generated_at=now(),
           expires_at=now()+make_interval(secs=>$11)
         RETURNING generated_at,expires_at`,
        [
          actor.organizationId,scopeKey,scopeHash,propertyIds,from,to,
          sourceSignature,PAYLOAD_VERSION,JSON.stringify(payload),
          actor.membershipId,CACHE_TTL_SECONDS
        ]
      )).rows[0];

      return {
        ...payload,
        freshness:{...source,sourceSignature,etag},
        cache:{
          hit:false,
          generatedAt:stored.generated_at.toISOString(),
          expiresAt:stored.expires_at.toISOString(),
          ttlSeconds:CACHE_TTL_SECONDS
        }
      };
    });
  }

  private async resolvePropertyIds(
    client:PoolClient,
    organizationId:string,
    scope:DashboardScope
  ){
    if(scope.type==="property"){
      const row=(await client.query<{id:string}>(
        `SELECT id
           FROM properties
          WHERE id=$1
            AND organization_id=$2
            AND app.can_access_property(id)`,
        [scope.propertyId,organizationId]
      )).rows[0];
      if(!row)throw new Error("PROPERTY_FORBIDDEN");
      return [row.id];
    }

    return (await client.query<{id:string}>(
      `SELECT id
         FROM properties
        WHERE organization_id=$1
          AND app.can_access_property(id)
        ORDER BY id`,
      [organizationId]
    )).rows.map(row=>row.id);
  }

  private async sourceState(
    client:PoolClient,
    organizationId:string,
    propertyIds:string[],
    from:string,
    to:string
  ):Promise<SourceState>{
    if(propertyIds.length===0){
      return {
        rollupRefreshedAt:null,rollupRows:0,
        reservationProjectedAt:null,reservationFacts:0,
        economicsProjectedAt:null,economicsFacts:0
      };
    }

    const row=(await client.query<{
      rollup_refreshed_at:Date|null;rollup_rows:string;
      reservation_projected_at:Date|null;reservation_facts:string;
      economics_projected_at:Date|null;economics_facts:string;
    }>(
      `SELECT
        (
          SELECT MAX(r.refreshed_at)
          FROM analytics_property_daily_rollups r
          WHERE r.organization_id=$1
            AND r.property_id=ANY($2::uuid[])
            AND r.local_date BETWEEN $3::date AND $4::date
        ) AS rollup_refreshed_at,
        (
          SELECT COUNT(*)::text
          FROM analytics_property_daily_rollups r
          WHERE r.organization_id=$1
            AND r.property_id=ANY($2::uuid[])
            AND r.local_date BETWEEN $3::date AND $4::date
        ) AS rollup_rows,
        (
          SELECT MAX(r.projected_at)
          FROM analytics_reservation_facts r
          WHERE r.organization_id=$1
            AND r.property_id=ANY($2::uuid[])
            AND r.check_in_local_date BETWEEN $3::date AND $4::date
        ) AS reservation_projected_at,
        (
          SELECT COUNT(*)::text
          FROM analytics_reservation_facts r
          WHERE r.organization_id=$1
            AND r.property_id=ANY($2::uuid[])
            AND r.check_in_local_date BETWEEN $3::date AND $4::date
        ) AS reservation_facts,
        (
          SELECT MAX(e.projected_at)
          FROM analytics_marketplace_economic_facts e
          JOIN analytics_reservation_facts r
            ON r.reservation_id=e.reservation_id
           AND r.organization_id=e.organization_id
          WHERE e.organization_id=$1
            AND e.property_id=ANY($2::uuid[])
            AND r.check_in_local_date<=$4::date
            AND r.check_out_local_date>$3::date
        ) AS economics_projected_at,
        (
          SELECT COUNT(*)::text
          FROM analytics_marketplace_economic_facts e
          JOIN analytics_reservation_facts r
            ON r.reservation_id=e.reservation_id
           AND r.organization_id=e.organization_id
          WHERE e.organization_id=$1
            AND e.property_id=ANY($2::uuid[])
            AND r.check_in_local_date<=$4::date
            AND r.check_out_local_date>$3::date
        ) AS economics_facts`,
      [organizationId,propertyIds,from,to]
    )).rows[0];

    return {
      rollupRefreshedAt:iso(row.rollup_refreshed_at),
      rollupRows:Number(row.rollup_rows),
      reservationProjectedAt:iso(row.reservation_projected_at),
      reservationFacts:Number(row.reservation_facts),
      economicsProjectedAt:iso(row.economics_projected_at),
      economicsFacts:Number(row.economics_facts)
    };
  }

  private async buildPayload(
    client:PoolClient,
    organizationId:string,
    scope:DashboardScope,
    propertyIds:string[],
    from:string,
    to:string
  ):Promise<DashboardPayload>{
    const currencyMap=new Map<string,DashboardPayload["currencies"][number]>();

    const ensure=(currency:string)=>{
      let item=currencyMap.get(currency);
      if(!item){
        item={
          currency,
          hospitality:{
            availableUnitNights:0,occupiedUnitNights:0,
            accommodationRevenueMinor:"0",grossRevenueMinor:"0",netRevenueMinor:"0",
            occupancy:0,adrMinor:"0.00",revparMinor:"0.00"
          },
          lifecycle:{
            bookingCount:0,activeOrStayedCount:0,cancellationCount:0,noShowCount:0,
            cancellationRate:0,noShowRate:0,avgLeadTimeDays:0,avgStayNights:0,
            avgCancellationLeadDays:null
          },
          marketplace:{
            finalizedEconomicsPresent:false,
            netCollectedMinor:"0",platformCommissionMinor:"0",ownerPayableMinor:"0",
            taxesWithheldMinor:"0",otherDeductionsMinor:"0",
            platformCommissionRate:0,ownerPayableRate:0
          }
        };
        currencyMap.set(currency,item);
      }
      return item;
    };

    if(propertyIds.length>0){
      const hospitality=await client.query<{
        currency:string;available_unit_nights:string;occupied_unit_nights:string;
        accommodation_revenue_minor:string;gross_revenue_minor:string;net_revenue_minor:string;
        occupancy:string;adr_minor:string;revpar_minor:string;
      }>(
        `SELECT
           currency,
           SUM(available_unit_nights)::text AS available_unit_nights,
           SUM(occupied_unit_nights)::text AS occupied_unit_nights,
           SUM(accommodation_revenue_minor)::text AS accommodation_revenue_minor,
           SUM(gross_revenue_minor)::text AS gross_revenue_minor,
           SUM(net_revenue_minor)::text AS net_revenue_minor,
           CASE
             WHEN SUM(available_unit_nights)=0 THEN 0::numeric
             ELSE ROUND(SUM(occupied_unit_nights)::numeric/SUM(available_unit_nights),6)
           END::text AS occupancy,
           CASE
             WHEN SUM(occupied_unit_nights)=0 THEN 0::numeric
             ELSE ROUND(SUM(accommodation_revenue_minor)::numeric/SUM(occupied_unit_nights),2)
           END::text AS adr_minor,
           CASE
             WHEN SUM(available_unit_nights)=0 THEN 0::numeric
             ELSE ROUND(SUM(accommodation_revenue_minor)::numeric/SUM(available_unit_nights),2)
           END::text AS revpar_minor
         FROM analytics_property_daily_rollups
        WHERE organization_id=$1
          AND property_id=ANY($2::uuid[])
          AND local_date BETWEEN $3::date AND $4::date
        GROUP BY currency
        ORDER BY currency`,
        [organizationId,propertyIds,from,to]
      );

      for(const row of hospitality.rows){
        const item=ensure(row.currency);
        item.hospitality={
          availableUnitNights:Number(row.available_unit_nights),
          occupiedUnitNights:Number(row.occupied_unit_nights),
          accommodationRevenueMinor:row.accommodation_revenue_minor,
          grossRevenueMinor:row.gross_revenue_minor,
          netRevenueMinor:row.net_revenue_minor,
          occupancy:Number(row.occupancy),
          adrMinor:decimal2(row.adr_minor),
          revparMinor:decimal2(row.revpar_minor)
        };
      }

      const lifecycle=await client.query<{
        currency:string;booking_count:string;active_or_stayed_count:string;
        cancellation_count:string;no_show_count:string;cancellation_rate:string;
        no_show_rate:string;avg_lead_time_days:string;avg_stay_nights:string;
        avg_cancellation_lead_days:string|null;
      }>(
        `SELECT
           currency,
           SUM(booking_count)::text AS booking_count,
           SUM(active_or_stayed_count)::text AS active_or_stayed_count,
           SUM(cancellation_count)::text AS cancellation_count,
           SUM(no_show_count)::text AS no_show_count,
           CASE
             WHEN SUM(booking_count)=0 THEN 0::numeric
             ELSE ROUND(SUM(cancellation_count)::numeric/SUM(booking_count),6)
           END::text AS cancellation_rate,
           CASE
             WHEN SUM(booking_count)=0 THEN 0::numeric
             ELSE ROUND(SUM(no_show_count)::numeric/SUM(booking_count),6)
           END::text AS no_show_rate,
           CASE
             WHEN SUM(booking_count)=0 THEN 0::numeric
             ELSE ROUND(
               SUM(avg_lead_time_days*booking_count)::numeric/SUM(booking_count),
               2
             )
           END::text AS avg_lead_time_days,
           CASE
             WHEN SUM(booking_count)=0 THEN 0::numeric
             ELSE ROUND(
               SUM(avg_stay_nights*booking_count)::numeric/SUM(booking_count),
               2
             )
           END::text AS avg_stay_nights,
           CASE
             WHEN SUM(cancellation_count)=0 THEN NULL
             ELSE ROUND(
               SUM(COALESCE(avg_cancellation_lead_days,0)*cancellation_count)::numeric
               /SUM(cancellation_count),
               2
             )
           END::text AS avg_cancellation_lead_days
         FROM analytics_booking_cohorts_daily
        WHERE organization_id=$1
          AND property_id=ANY($2::uuid[])
          AND arrival_date BETWEEN $3::date AND $4::date
        GROUP BY currency
        ORDER BY currency`,
        [organizationId,propertyIds,from,to]
      );

      for(const row of lifecycle.rows){
        const item=ensure(row.currency);
        item.lifecycle={
          bookingCount:Number(row.booking_count),
          activeOrStayedCount:Number(row.active_or_stayed_count),
          cancellationCount:Number(row.cancellation_count),
          noShowCount:Number(row.no_show_count),
          cancellationRate:Number(row.cancellation_rate),
          noShowRate:Number(row.no_show_rate),
          avgLeadTimeDays:Number(row.avg_lead_time_days),
          avgStayNights:Number(row.avg_stay_nights),
          avgCancellationLeadDays:row.avg_cancellation_lead_days===null
            ?null:Number(row.avg_cancellation_lead_days)
        };
      }

      const marketplace=await client.query<{
        currency:string;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        platform_commission_rate:string;owner_payable_rate:string;
      }>(
        `SELECT
           currency,
           SUM(net_collected_minor)::text AS net_collected_minor,
           SUM(platform_commission_minor)::text AS platform_commission_minor,
           SUM(owner_payable_minor)::text AS owner_payable_minor,
           SUM(taxes_withheld_minor)::text AS taxes_withheld_minor,
           SUM(other_deductions_minor)::text AS other_deductions_minor,
           CASE
             WHEN SUM(net_collected_minor)=0 THEN 0::numeric
             ELSE ROUND(
               SUM(platform_commission_minor)::numeric/SUM(net_collected_minor),
               6
             )
           END::text AS platform_commission_rate,
           CASE
             WHEN SUM(net_collected_minor)=0 THEN 0::numeric
             ELSE ROUND(
               SUM(owner_payable_minor)::numeric/SUM(net_collected_minor),
               6
             )
           END::text AS owner_payable_rate
         FROM analytics_marketplace_stay_daily
        WHERE organization_id=$1
          AND property_id=ANY($2::uuid[])
          AND local_date BETWEEN $3::date AND $4::date
        GROUP BY currency
        ORDER BY currency`,
        [organizationId,propertyIds,from,to]
      );

      for(const row of marketplace.rows){
        const item=ensure(row.currency);
        item.marketplace={
          finalizedEconomicsPresent:true,
          netCollectedMinor:row.net_collected_minor,
          platformCommissionMinor:row.platform_commission_minor,
          ownerPayableMinor:row.owner_payable_minor,
          taxesWithheldMinor:row.taxes_withheld_minor,
          otherDeductionsMinor:row.other_deductions_minor,
          platformCommissionRate:Number(row.platform_commission_rate),
          ownerPayableRate:Number(row.owner_payable_rate)
        };
      }
    }

    return {
      scope:{
        type:scope.type,
        ...(scope.type==="property"?{propertyId:scope.propertyId}:{}),
        accessiblePropertyCount:propertyIds.length
      },
      range:{from,to},
      currencies:[...currencyMap.values()].sort((a,b)=>a.currency.localeCompare(b.currency))
    };
  }
}

async function assertDashboardRole(client:PoolClient){
  const role=(await client.query<{code:string|null}>(
    "SELECT app.current_membership_role() AS code"
  )).rows[0]?.code;
  if(!role||!["host","owner","manager","accountant"].includes(role)){
    throw new Error("ANALYTICS_ROLE_FORBIDDEN");
  }
}

function validateDateRange(from:string,to:string){
  const start=parseDate(from),end=parseDate(to);
  if(start===null||end===null)throw new Error("INVALID_ANALYTICS_DATE");
  if(start>end)throw new Error("INVALID_ANALYTICS_RANGE");
  const days=Math.floor((end-start)/86400000)+1;
  if(days>MAX_RANGE_DAYS)throw new Error("ANALYTICS_RANGE_TOO_LARGE");
}

function parseDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,day]=value.split("-").map(Number);
  const ms=Date.UTC(year,month-1,day);
  const d=new Date(ms);
  if(
    d.getUTCFullYear()!==year||
    d.getUTCMonth()!==month-1||
    d.getUTCDate()!==day
  )return null;
  return ms;
}

function hash(value:string){
  return createHash("sha256").update(value).digest("hex");
}

function iso(value:Date|null){
  return value?value.toISOString():null;
}

function decimal2(value:string){
  return Number(value).toFixed(2);
}
