import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

@Injectable()
export class AnalyticsQueryService{
  constructor(private readonly db:DatabaseService){}

  async propertyDaily(
    actor:RequestActorContext,
    propertyId:string,
    from:string,
    to:string
  ){
    validateRange(from,to);

    return this.db.withActor(actor,async client=>{
      await assertAnalyticsAccess(client,propertyId);

      const rows=await client.query<{
        local_date:string;currency:string|null;available_unit_nights:number;
        occupied_unit_nights:number;booking_count:number;
        accommodation_revenue_minor:string;gross_revenue_minor:string;net_revenue_minor:string;
        occupancy:string;adr_minor:string;revpar_minor:string;
        avg_lead_time_days:string;avg_stay_nights:string;
      }>(
        `SELECT
           local_date::text,currency,available_unit_nights,occupied_unit_nights,booking_count,
           accommodation_revenue_minor::text,gross_revenue_minor::text,net_revenue_minor::text,
           occupancy::text,adr_minor::text,revpar_minor::text,
           avg_lead_time_days::text,avg_stay_nights::text
         FROM analytics_property_daily
        WHERE organization_id=$1
          AND property_id=$2
          AND local_date BETWEEN $3::date AND $4::date
        ORDER BY local_date,currency NULLS LAST`,
        [actor.organizationId,propertyId,from,to]
      );

      return rows.rows.map(row=>({
        date:row.local_date,
        currency:row.currency,
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
    });
  }

  async propertyBookingCohorts(
    actor:RequestActorContext,
    propertyId:string,
    from:string,
    to:string,
    sourceChannel?:string,
    guestSegment?:string
  ){
    validateRange(from,to);
    validateDimension(sourceChannel,"SOURCE_CHANNEL");
    validateDimension(guestSegment,"GUEST_SEGMENT");

    return this.db.withActor(actor,async client=>{
      await assertAnalyticsAccess(client,propertyId);

      const rows=await client.query<{
        arrival_date:string;currency:string;source_channel:string|null;guest_segment:string|null;
        booking_count:number;active_or_stayed_count:number;cancellation_count:number;no_show_count:number;
        cancellation_rate:string;no_show_rate:string;avg_lead_time_days:string;avg_stay_nights:string;
        avg_cancellation_lead_days:string|null;
      }>(
        `SELECT
           arrival_date::text,currency,source_channel,guest_segment,
           booking_count,active_or_stayed_count,cancellation_count,no_show_count,
           cancellation_rate::text,no_show_rate::text,
           avg_lead_time_days::text,avg_stay_nights::text,
           avg_cancellation_lead_days::text
         FROM analytics_booking_cohorts_daily
        WHERE organization_id=$1
          AND property_id=$2
          AND arrival_date BETWEEN $3::date AND $4::date
          AND ($5::text IS NULL OR source_channel=$5)
          AND ($6::text IS NULL OR guest_segment=$6)
        ORDER BY arrival_date,currency,source_channel NULLS LAST,guest_segment NULLS LAST`,
        [
          actor.organizationId,propertyId,from,to,
          sourceChannel?.trim()||null,guestSegment?.trim()||null
        ]
      );

      return rows.rows.map(row=>({
        arrivalDate:row.arrival_date,
        currency:row.currency,
        sourceChannel:row.source_channel,
        guestSegment:row.guest_segment,
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
    });
  }
}

function validateRange(from:string,to:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)){
    throw new Error("INVALID_ANALYTICS_DATE");
  }
  if(from>to)throw new Error("INVALID_ANALYTICS_RANGE");
}

function validateDimension(value:string|undefined,name:string){
  if(value===undefined)return;
  const normalized=value.trim();
  if(!normalized||normalized.length>80)throw new Error("INVALID_"+name);
}

async function assertAnalyticsAccess(
  client:import("pg").PoolClient,
  propertyId:string
){
  const role=(await client.query<{code:string|null}>(
    "SELECT app.current_membership_role() AS code"
  )).rows[0]?.code;
  if(!role||!["host","owner","manager","accountant"].includes(role)){
    throw new Error("ANALYTICS_ROLE_FORBIDDEN");
  }

  const access=(await client.query<{allowed:boolean}>(
    "SELECT app.can_access_property($1::uuid) AS allowed",[propertyId]
  )).rows[0]?.allowed;
  if(!access)throw new Error("PROPERTY_FORBIDDEN");
}
