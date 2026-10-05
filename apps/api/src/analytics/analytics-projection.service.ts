import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

const ANALYTICS_CONSUMER="analytics-core-v1";

@Injectable()
export class AnalyticsProjectionService{
  constructor(private readonly db:DatabaseService){}

  async processBatch(actor:RequestActorContext,limit=100){
    this.validateLimit(limit);

    return this.db.withActor(actor,async client=>{
      const role=(await client.query<{code:string|null}>(
        "SELECT app.current_membership_role() AS code"
      )).rows[0]?.code;
      if(!role||!["owner","manager","accountant"].includes(role)){
        throw new Error("ANALYTICS_ROLE_FORBIDDEN");
      }
      return this.processClient(client,actor.organizationId,limit);
    });
  }

  async processOrganization(organizationId:string,limit=100){
    this.validateLimit(limit);
    return this.db.withOrganization(
      organizationId,
      client=>this.processClient(client,organizationId,limit)
    );
  }

  private validateLimit(limit:number){
    if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("INVALID_BATCH_LIMIT");
  }

  private async processClient(
    client:import("pg").PoolClient,
    organizationId:string,
    limit:number
  ){
    const events=await client.query<{
      id:string;aggregate_type:string;aggregate_id:string;event_type:string;payload:Record<string,unknown>;
    }>(
      `SELECT o.id,o.aggregate_type,o.aggregate_id,o.event_type,o.payload
         FROM outbox_events o
         LEFT JOIN analytics_projection_consumptions c
           ON c.outbox_event_id=o.id
          AND c.consumer=$2
        WHERE o.organization_id=$1
          AND c.outbox_event_id IS NULL
          AND (
            o.aggregate_type='reservation'
            OR o.event_type='finance.payment_intent.v1'
            OR o.event_type='marketplace.reservation_economics.v1'
          )
        ORDER BY o.occurred_at,o.id
        LIMIT $3`,
      [organizationId,ANALYTICS_CONSUMER,limit]
    );

    let projected=0;
    for(const event of events.rows){
      let reservationId:string|null=null;
      if(event.aggregate_type==="reservation"){
        reservationId=event.aggregate_id;
      }else if(
        event.event_type==="finance.payment_intent.v1"||
        event.event_type==="marketplace.reservation_economics.v1"
      ){
        reservationId=typeof event.payload?.reservationId==="string"
          ?event.payload.reservationId
          :null;
      }

      if(reservationId){
        await this.projectReservation(client,organizationId,reservationId);
        await this.projectPayments(client,organizationId,reservationId);
        await this.projectMarketplaceEconomics(client,organizationId,reservationId);
      }

      const inserted=await client.query(
        `INSERT INTO analytics_projection_consumptions(
           id,organization_id,outbox_event_id,consumer,event_type
         ) VALUES(gen_random_uuid(),$1,$2,$3,$4)
         ON CONFLICT(outbox_event_id,consumer) DO NOTHING
         RETURNING id`,
        [organizationId,event.id,ANALYTICS_CONSUMER,event.event_type]
      );
      if(inserted.rowCount)projected++;
    }

    return {scanned:events.rowCount??0,projected,consumer:ANALYTICS_CONSUMER};
  }

  private async projectReservation(
    client:import("pg").PoolClient,
    organizationId:string,
    reservationId:string
  ){
    const row=(await client.query<{
      id:string;organization_id:string;property_id:string;unit_id:string|null;status:string;
      currency:string;timezone:string;check_in_at:Date;check_out_at:Date;
      check_in_local_date:string;check_out_local_date:string;booking_local_date:string;
      stay_nights:number;created_at:Date;lead_time_days:string;
      accommodation_minor:string;total_minor:string;version:number;updated_at:Date;
      quote_snapshot:Record<string,unknown>;
      cancelled_at:Date|null;no_show_at:Date|null;cancellation_lead_days:string|null;
    }>(
      `SELECT
          r.id,r.organization_id,r.property_id,r.unit_id,r.status,r.currency,p.timezone,
          r.check_in_at,r.check_out_at,
          (r.check_in_at AT TIME ZONE p.timezone)::date::text AS check_in_local_date,
          (r.check_out_at AT TIME ZONE p.timezone)::date::text AS check_out_local_date,
          (r.created_at AT TIME ZONE p.timezone)::date::text AS booking_local_date,
          (
            (r.check_out_at AT TIME ZONE p.timezone)::date
            -(r.check_in_at AT TIME ZONE p.timezone)::date
          )::integer AS stay_nights,
          r.created_at,
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              (r.check_in_at AT TIME ZONE p.timezone)
              -(r.created_at AT TIME ZONE p.timezone)
            ))/86400.0
          )::text AS lead_time_days,
          r.accommodation_minor::text,r.total_minor::text,r.version,r.updated_at,
          r.quote_snapshot,
          COALESCE(r.cancelled_at,lifecycle.cancelled_event_at) AS cancelled_at,
          lifecycle.no_show_at,
          CASE
            WHEN COALESCE(r.cancelled_at,lifecycle.cancelled_event_at) IS NULL THEN NULL
            ELSE GREATEST(
              0,
              EXTRACT(EPOCH FROM (
                (r.check_in_at AT TIME ZONE p.timezone)
                -(COALESCE(r.cancelled_at,lifecycle.cancelled_event_at) AT TIME ZONE p.timezone)
              ))/86400.0
            )::text
          END AS cancellation_lead_days
        FROM reservations r
        JOIN properties p ON p.id=r.property_id
        LEFT JOIN LATERAL (
          SELECT
            MIN(e.created_at) FILTER (WHERE e.to_status='cancelled') AS cancelled_event_at,
            MIN(e.created_at) FILTER (WHERE e.to_status='no_show') AS no_show_at
          FROM booking_state_events e
          WHERE e.reservation_id=r.id
            AND e.organization_id=r.organization_id
        ) lifecycle ON true
       WHERE r.id=$1 AND r.organization_id=$2`,
      [reservationId,organizationId]
    )).rows[0];

    if(!row)return;
    if(row.stay_nights<1)throw new Error("ANALYTICS_INVALID_STAY_NIGHTS");

    const bookingChannel=this.snapshotDimension(row.quote_snapshot,[
      ["bookingChannel"],
      ["sourceChannel"],
      ["pricingSnapshot","bookingChannel"],
      ["pricingSnapshot","sourceChannel"]
    ]);
    const marketSegment=this.snapshotDimension(row.quote_snapshot,[
      ["marketSegment"],
      ["guestSegment"],
      ["guestContext","marketSegment"],
      ["guestContext","guestSegment"]
    ]);

    await client.query(
      `INSERT INTO analytics_reservation_facts(
         reservation_id,organization_id,property_id,unit_id,status,currency,property_timezone,
         check_in_at,check_out_at,check_in_local_date,check_out_local_date,booking_local_date,stay_nights,
         booked_at,lead_time_days,accommodation_minor,gross_revenue_minor,
         source_version,source_updated_at,projected_at,
         booking_channel,market_segment,cancelled_at,no_show_at,cancellation_lead_days
       ) VALUES(
         $1,$2,$3,$4,$5::reservation_status,$6,$7,$8,$9,$10::date,$11::date,$12::date,$13,
         $14,$15::numeric,$16,$17,$18,$19,now(),$20,$21,$22,$23,$24::numeric
       )
       ON CONFLICT(reservation_id) DO UPDATE SET
         organization_id=EXCLUDED.organization_id,
         property_id=EXCLUDED.property_id,
         unit_id=EXCLUDED.unit_id,
         status=EXCLUDED.status,
         currency=EXCLUDED.currency,
         property_timezone=EXCLUDED.property_timezone,
         check_in_at=EXCLUDED.check_in_at,
         check_out_at=EXCLUDED.check_out_at,
         check_in_local_date=EXCLUDED.check_in_local_date,
         check_out_local_date=EXCLUDED.check_out_local_date,
         booking_local_date=EXCLUDED.booking_local_date,
         stay_nights=EXCLUDED.stay_nights,
         booked_at=EXCLUDED.booked_at,
         lead_time_days=EXCLUDED.lead_time_days,
         accommodation_minor=EXCLUDED.accommodation_minor,
         gross_revenue_minor=EXCLUDED.gross_revenue_minor,
         source_version=EXCLUDED.source_version,
         source_updated_at=EXCLUDED.source_updated_at,
         booking_channel=EXCLUDED.booking_channel,
         market_segment=EXCLUDED.market_segment,
         cancelled_at=EXCLUDED.cancelled_at,
         no_show_at=EXCLUDED.no_show_at,
         cancellation_lead_days=EXCLUDED.cancellation_lead_days,
         projected_at=now()
       WHERE analytics_reservation_facts.source_version<=EXCLUDED.source_version`,
      [
        row.id,row.organization_id,row.property_id,row.unit_id,row.status,row.currency,row.timezone,
        row.check_in_at,row.check_out_at,row.check_in_local_date,row.check_out_local_date,row.booking_local_date,
        row.stay_nights,row.created_at,row.lead_time_days,row.accommodation_minor,row.total_minor,
        row.version,row.updated_at,bookingChannel,marketSegment,row.cancelled_at,row.no_show_at,
        row.cancellation_lead_days
      ]
    );

    await client.query(
      `INSERT INTO analytics_rollup_dirty_ranges(
         organization_id,property_id,dirty_from,dirty_to,updated_at
       ) VALUES($1,$2,$3::date,($4::date-1),now())
       ON CONFLICT(organization_id,property_id) DO UPDATE SET
         dirty_from=LEAST(analytics_rollup_dirty_ranges.dirty_from,EXCLUDED.dirty_from),
         dirty_to=GREATEST(analytics_rollup_dirty_ranges.dirty_to,EXCLUDED.dirty_to),
         updated_at=now()`,
      [organizationId,row.property_id,row.check_in_local_date,row.check_out_local_date]
    );
  }

  private snapshotDimension(snapshot:Record<string,unknown>,paths:string[][]){
    for(const path of paths){
      let value:unknown=snapshot;
      for(const key of path){
        if(!value||typeof value!=="object"||Array.isArray(value)){
          value=undefined;
          break;
        }
        value=(value as Record<string,unknown>)[key];
      }
      const normalized=this.dimensionCode(value);
      if(normalized!==null)return normalized;
    }
    return null;
  }

  private dimensionCode(value:unknown){
    if(typeof value!=="string")return null;
    const normalized=value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,64);
    return normalized||null;
  }

  private async projectMarketplaceEconomics(
    client:import("pg").PoolClient,
    organizationId:string,
    reservationId:string
  ){
    const row=(await client.query<{
      snapshot_id:string;organization_id:string;property_id:string;reservation_id:string;
      version:number;currency:string;net_collected_minor:string;platform_commission_minor:string;
      owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
      finalized_at:Date;
    }>(
      `SELECT
          s.id AS snapshot_id,s.organization_id,s.property_id,s.reservation_id,
          s.version,s.currency,s.net_collected_minor::text,
          s.platform_commission_minor::text,s.owner_payable_minor::text,
          s.taxes_withheld_minor::text,s.other_deductions_minor::text,
          s.finalized_at
        FROM reservation_economic_snapshots s
       WHERE s.organization_id=$1
         AND s.reservation_id=$2
         AND s.status='finalized'
       LIMIT 1`,
      [organizationId,reservationId]
    )).rows[0];

    if(!row)return;

    await client.query(
      `INSERT INTO analytics_marketplace_economic_facts(
         reservation_id,organization_id,property_id,currency,
         net_collected_minor,platform_commission_minor,owner_payable_minor,
         taxes_withheld_minor,other_deductions_minor,
         source_snapshot_id,source_version,source_finalized_at,projected_at
       ) VALUES(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()
       )
       ON CONFLICT(reservation_id) DO UPDATE SET
         organization_id=EXCLUDED.organization_id,
         property_id=EXCLUDED.property_id,
         currency=EXCLUDED.currency,
         net_collected_minor=EXCLUDED.net_collected_minor,
         platform_commission_minor=EXCLUDED.platform_commission_minor,
         owner_payable_minor=EXCLUDED.owner_payable_minor,
         taxes_withheld_minor=EXCLUDED.taxes_withheld_minor,
         other_deductions_minor=EXCLUDED.other_deductions_minor,
         source_snapshot_id=EXCLUDED.source_snapshot_id,
         source_version=EXCLUDED.source_version,
         source_finalized_at=EXCLUDED.source_finalized_at,
         projected_at=now()
       WHERE analytics_marketplace_economic_facts.source_version<=EXCLUDED.source_version`,
      [
        row.reservation_id,row.organization_id,row.property_id,row.currency,
        row.net_collected_minor,row.platform_commission_minor,row.owner_payable_minor,
        row.taxes_withheld_minor,row.other_deductions_minor,
        row.snapshot_id,row.version,row.finalized_at
      ]
    );
  }

  private async projectPayments(
    client:import("pg").PoolClient,
    organizationId:string,
    reservationId:string
  ){
    const row=(await client.query<{
      reservation_id:string;property_id:string;currency:string;
      captured_minor:string;refunded_minor:string;source_updated_at:Date;
    }>(
      `SELECT
          r.id AS reservation_id,
          r.property_id,
          r.currency,
          COALESCE(SUM(pi.captured_minor),0)::text AS captured_minor,
          COALESCE(SUM(pi.refunded_minor),0)::text AS refunded_minor,
          GREATEST(r.updated_at,COALESCE(MAX(pi.updated_at),r.updated_at)) AS source_updated_at
        FROM reservations r
        LEFT JOIN payment_intents pi
          ON pi.reservation_id=r.id
         AND pi.organization_id=r.organization_id
       WHERE r.id=$1 AND r.organization_id=$2
       GROUP BY r.id,r.property_id,r.currency,r.updated_at`,
      [reservationId,organizationId]
    )).rows[0];

    if(!row)return;
    const captured=BigInt(row.captured_minor);
    const refunded=BigInt(row.refunded_minor);
    const net=captured-refunded;

    await client.query(
      `INSERT INTO analytics_payment_facts(
         reservation_id,organization_id,property_id,currency,
         captured_minor,refunded_minor,net_collected_minor,source_updated_at,projected_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT(reservation_id) DO UPDATE SET
         organization_id=EXCLUDED.organization_id,
         property_id=EXCLUDED.property_id,
         currency=EXCLUDED.currency,
         captured_minor=EXCLUDED.captured_minor,
         refunded_minor=EXCLUDED.refunded_minor,
         net_collected_minor=EXCLUDED.net_collected_minor,
         source_updated_at=EXCLUDED.source_updated_at,
         projected_at=now()
       WHERE analytics_payment_facts.source_updated_at<=EXCLUDED.source_updated_at`,
      [
        row.reservation_id,organizationId,row.property_id,row.currency,
        captured.toString(),refunded.toString(),net.toString(),row.source_updated_at
      ]
    );
  }
}
