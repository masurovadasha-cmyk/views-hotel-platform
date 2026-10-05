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
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    if(from>to)throw new Error("INVALID_ANALYTICS_RANGE");

    return this.db.withActor(actor,async client=>{
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
  async propertyDimensions(
    actor:RequestActorContext,
    propertyId:string,
    from:string,
    to:string
  ){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    if(from>to)throw new Error("INVALID_ANALYTICS_RANGE");

    return this.db.withActor(actor,async client=>{
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

      const rows=await client.query<{
        local_date:string;currency:string;booking_channel:string;market_segment:string;
        booking_count:number;active_booking_count:number;cancelled_booking_count:number;
        no_show_booking_count:number;cancellation_rate:string;no_show_rate:string;
        avg_lead_time_days:string;avg_stay_nights:string;
      }>(
        `SELECT
           local_date::text,currency,booking_channel,market_segment,
           booking_count,active_booking_count,cancelled_booking_count,no_show_booking_count,
           cancellation_rate::text,no_show_rate::text,
           avg_lead_time_days::text,avg_stay_nights::text
         FROM analytics_property_daily_dimensions
        WHERE organization_id=$1
          AND property_id=$2
          AND local_date BETWEEN $3::date AND $4::date
        ORDER BY local_date,booking_channel,market_segment,currency`,
        [actor.organizationId,propertyId,from,to]
      );

      return rows.rows.map(row=>({
        date:row.local_date,
        currency:row.currency,
        bookingChannel:row.booking_channel,
        marketSegment:row.market_segment,
        bookingCount:Number(row.booking_count),
        activeBookingCount:Number(row.active_booking_count),
        cancelledBookingCount:Number(row.cancelled_booking_count),
        noShowBookingCount:Number(row.no_show_booking_count),
        cancellationRate:Number(row.cancellation_rate),
        noShowRate:Number(row.no_show_rate),
        avgLeadTimeDays:Number(row.avg_lead_time_days),
        avgStayNights:Number(row.avg_stay_nights)
      }));
    });
  }

  async projectionHealth(actor:RequestActorContext){
    return this.db.withActor(actor,async client=>{
      const role=(await client.query<{code:string|null}>(
        "SELECT app.current_membership_role() AS code"
      )).rows[0]?.code;
      if(!role||!["owner","manager","accountant"].includes(role)){
        throw new Error("ANALYTICS_ROLE_FORBIDDEN");
      }

      const row=(await client.query<{
        pending_events:number;oldest_pending_at:Date|null;
        last_processed_at:Date|null;oldest_pending_age_seconds:string;
        consecutive_failures:number;last_error_code:string|null;
        last_started_at:Date|null;last_completed_at:Date|null;status:string;
      }>(
        `SELECT pending_events,oldest_pending_at,last_processed_at,
                oldest_pending_age_seconds::text,consecutive_failures,last_error_code,
                last_started_at,last_completed_at,status
           FROM analytics_projection_slo
          WHERE organization_id=$1`,
        [actor.organizationId]
      )).rows[0];

      return {
        status:row?.status??"healthy",
        pendingEvents:Number(row?.pending_events??0),
        oldestPendingAt:row?.oldest_pending_at?.toISOString()??null,
        lastProcessedAt:row?.last_processed_at?.toISOString()??null,
        oldestPendingAgeSeconds:Number(row?.oldest_pending_age_seconds??0),
        consecutiveFailures:Number(row?.consecutive_failures??0),
        lastErrorCode:row?.last_error_code??null,
        lastStartedAt:row?.last_started_at?.toISOString()??null,
        lastCompletedAt:row?.last_completed_at?.toISOString()??null
      };
    });
  }
}
