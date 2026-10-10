import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

@Injectable()
export class MarketplaceAnalyticsQueryService{
  constructor(private readonly db:DatabaseService){}

  async propertyEconomics(
    actor:RequestActorContext,
    propertyId:string,
    from:string,
    to:string,
    bookingChannel?:string,
    marketSegment?:string
  ){
    this.validateDates(from,to);
    this.validateDimension(bookingChannel,"BOOKING_CHANNEL");
    this.validateDimension(marketSegment,"MARKET_SEGMENT");

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
        arrival_date:string;currency:string;booking_channel:string|null;market_segment:string|null;
        reservation_count:number;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        platform_commission_rate:string;owner_payable_rate:string;
      }>(
        "SELECT arrival_date::text,currency,booking_channel,market_segment,reservation_count,net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,taxes_withheld_minor::text,other_deductions_minor::text,platform_commission_rate::text,owner_payable_rate::text FROM analytics_marketplace_arrival_daily WHERE organization_id=$1 AND property_id=$2 AND arrival_date BETWEEN $3::date AND $4::date AND ($5::text IS NULL OR booking_channel=$5) AND ($6::text IS NULL OR market_segment=$6) ORDER BY arrival_date,currency,booking_channel NULLS LAST,market_segment NULLS LAST",
        [
          actor.organizationId,propertyId,from,to,
          this.normalizeDimension(bookingChannel),
          this.normalizeDimension(marketSegment)
        ]
      );

      return rows.rows.map(row=>({
        arrivalDate:row.arrival_date,
        currency:row.currency,
        bookingChannel:row.booking_channel,
        marketSegment:row.market_segment,
        reservationCount:Number(row.reservation_count),
        netCollectedMinor:row.net_collected_minor,
        platformCommissionMinor:row.platform_commission_minor,
        ownerPayableMinor:row.owner_payable_minor,
        taxesWithheldMinor:row.taxes_withheld_minor,
        otherDeductionsMinor:row.other_deductions_minor,
        platformCommissionRate:Number(row.platform_commission_rate),
        ownerPayableRate:Number(row.owner_payable_rate)
      }));
    });
  }

  async propertyStayEconomics(
    actor:RequestActorContext,
    propertyId:string,
    from:string,
    to:string,
    bookingChannel?:string,
    marketSegment?:string
  ){
    this.validateDates(from,to);
    this.validateDimension(bookingChannel,"BOOKING_CHANNEL");
    this.validateDimension(marketSegment,"MARKET_SEGMENT");

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
        local_date:string;currency:string;booking_channel:string|null;market_segment:string|null;
        reservation_count:number;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        platform_commission_rate:string;owner_payable_rate:string;
      }>(
        `SELECT
           local_date::text,currency,booking_channel,market_segment,reservation_count,
           net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,
           taxes_withheld_minor::text,other_deductions_minor::text,
           platform_commission_rate::text,owner_payable_rate::text
         FROM analytics_marketplace_stay_daily
        WHERE organization_id=$1
          AND property_id=$2
          AND local_date BETWEEN $3::date AND $4::date
          AND ($5::text IS NULL OR booking_channel=$5)
          AND ($6::text IS NULL OR market_segment=$6)
        ORDER BY local_date,currency,booking_channel NULLS LAST,market_segment NULLS LAST`,
        [
          actor.organizationId,propertyId,from,to,
          this.normalizeDimension(bookingChannel),
          this.normalizeDimension(marketSegment)
        ]
      );

      return rows.rows.map(row=>({
        date:row.local_date,
        currency:row.currency,
        bookingChannel:row.booking_channel,
        marketSegment:row.market_segment,
        reservationCount:Number(row.reservation_count),
        netCollectedMinor:row.net_collected_minor,
        platformCommissionMinor:row.platform_commission_minor,
        ownerPayableMinor:row.owner_payable_minor,
        taxesWithheldMinor:row.taxes_withheld_minor,
        otherDeductionsMinor:row.other_deductions_minor,
        platformCommissionRate:Number(row.platform_commission_rate),
        ownerPayableRate:Number(row.owner_payable_rate)
      }));
    });
  }

  private validateDates(from:string,to:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)){
      throw new Error("INVALID_ANALYTICS_DATE");
    }
    if(from>to)throw new Error("INVALID_ANALYTICS_RANGE");
  }

  private validateDimension(value:string|undefined,name:string){
    if(value===undefined)return;
    const trimmed=value.trim();
    if(!trimmed||trimmed.length>64)throw new Error("INVALID_"+name);
  }

  private normalizeDimension(value:string|undefined){
    if(value===undefined)return null;
    const normalized=value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,64);
    return normalized||null;
  }
}