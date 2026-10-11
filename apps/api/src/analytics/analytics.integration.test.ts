import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsQueryService} from "./analytics-query.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const QUOTE="c1000000-0000-4000-8000-000000000001";
const RESERVATION="c2000000-0000-4000-8000-000000000001";
const PAYMENT_INTENT="c3000000-0000-4000-8000-000000000001";
const CANCELLED_RESERVATION="c2000000-0000-4000-8000-000000000002";
const NOSHOW_RESERVATION="c2000000-0000-4000-8000-000000000003";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"analytics-integration"
};

const db=new DatabaseService();
const projector=new AnalyticsProjectionService(db);
const queries=new AnalyticsQueryService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO booking_quotes(
         id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,
         guest_context,currency,accommodation_minor,discount_minor,charges_minor,total_minor,
         cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at
       ) VALUES(
         $1,$2,$3,$4,$5,
         '2027-01-10T14:00:00+05','2027-01-12T12:00:00+05',
         '{"guests":[{"age":35}]}'::jsonb,'UZS',1001,0,200,1201,
         '{}'::jsonb,'{}'::jsonb,'analytics-stage6',now()+interval '1 day'
       )
       ON CONFLICT(id) DO NOTHING`,
      [QUOTE,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot,created_at,updated_at,version
       ) VALUES(
         $1,$2,$3,$4,$5,'VW-ANALYTICS-STAGE6','confirmed',
         '2027-01-10T14:00:00+05','2027-01-12T12:00:00+05',
         'UZS',1001,1201,'{}'::jsonb,$6::jsonb,
         '2027-01-01T12:00:00+05','2027-01-02T12:00:00+05',3
       )
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION,ORG,PROPERTY,UNIT,RATE,JSON.stringify({quoteId:QUOTE,bookingChannel:"direct",marketSegment:"leisure"})]
    );

    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot,created_at,updated_at,version,cancelled_at
       ) VALUES
       ($1,$3,$4,$5,$6,'VW-ANALYTICS-CANCEL','cancelled',
        '2027-01-10T14:00:00+05','2027-01-12T12:00:00+05',
        'UZS',800,900,'{}'::jsonb,$7::jsonb,
        '2026-12-20T12:00:00+05','2027-01-05T12:00:00+05',2,'2027-01-05T12:00:00+05'),
       ($2,$3,$4,$5,$6,'VW-ANALYTICS-NOSHOW','no_show',
        '2027-01-10T14:00:00+05','2027-01-12T12:00:00+05',
        'UZS',700,700,'{}'::jsonb,$8::jsonb,
        '2026-12-25T12:00:00+05','2027-01-10T18:00:00+05',2,NULL)
       ON CONFLICT(id) DO NOTHING`,
      [
        CANCELLED_RESERVATION,NOSHOW_RESERVATION,ORG,PROPERTY,UNIT,RATE,
        JSON.stringify({bookingChannel:"ota",marketSegment:"leisure"}),
        JSON.stringify({bookingChannel:"corporate_portal",marketSegment:"business"})
      ]
    );

    await client.query(
      `INSERT INTO booking_state_events(
         id,organization_id,reservation_id,event_type,from_status,to_status,
         idempotency_key,payload,created_at
       ) VALUES(
         gen_random_uuid(),$1,$2,'booking.no_show','confirmed','no_show',
         'analytics-stage6-noshow-state','{}'::jsonb,'2027-01-10T18:00:00+05'
       )
       ON CONFLICT DO NOTHING`,
      [ORG,NOSHOW_RESERVATION]
    );

    await client.query(
      `INSERT INTO payment_intents(
         id,organization_id,reservation_id,quote_id,provider,status,amount_minor,currency,
         idempotency_key,captured_minor,refunded_minor,version,created_at,updated_at
       ) VALUES(
         $1,$2,$3,$4,'test-provider','partially_refunded',1201,'UZS',
         'analytics-stage6-payment',1201,201,4,
         '2027-01-02T12:00:00+05','2027-01-03T12:00:00+05'
       )
       ON CONFLICT(id) DO NOTHING`,
      [PAYMENT_INTENT,ORG,RESERVATION,QUOTE]
    );

    await client.query(
      `INSERT INTO outbox_events(
         id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload,occurred_at
       ) VALUES
       (gen_random_uuid(),$1,'reservation',$2,'booking.confirmed',$3,$4::jsonb,'2027-01-02T12:00:00+05'),
       (gen_random_uuid(),$1,'payment_intent',$5,'finance.payment_intent.v1',$6,$7::jsonb,'2027-01-03T12:00:00+05'),
       (gen_random_uuid(),$1,'reservation',$8,'booking.cancelled',$9,$10::jsonb,'2027-01-05T12:00:00+05'),
       (gen_random_uuid(),$1,'reservation',$11,'booking.no_show',$12,$13::jsonb,'2027-01-10T18:00:00+05')
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        ORG,RESERVATION,
        "analytics-stage6-booking-event",JSON.stringify({reservationId:RESERVATION}),
        PAYMENT_INTENT,
        "analytics-stage6-payment-event",JSON.stringify({reservationId:RESERVATION,paymentIntentId:PAYMENT_INTENT}),
        CANCELLED_RESERVATION,
        "analytics-stage6-cancelled-event",JSON.stringify({reservationId:CANCELLED_RESERVATION}),
        NOSHOW_RESERVATION,
        "analytics-stage6-noshow-event",JSON.stringify({reservationId:NOSHOW_RESERVATION})
      ]
    );
  });
});

describe.sequential("Stage 6 analytics projections",()=>{
  it("projects reservation/payment facts idempotently from outbox",async()=>{
    const first=await projector.processBatch(actor,500);
    expect(first.scanned).toBeGreaterThanOrEqual(2);

    const second=await projector.processBatch(actor,500);
    expect(second.projected).toBe(0);

    const facts=await db.withActor(actor,async client=>{
      const reservation=(await client.query<{
        stay_nights:number;lead_time_days:string;accommodation_minor:string;
        gross_revenue_minor:string;source_version:number;
      }>(
        `SELECT stay_nights,lead_time_days::text,accommodation_minor::text,
                gross_revenue_minor::text,source_version
           FROM analytics_reservation_facts
          WHERE reservation_id=$1`,
        [RESERVATION]
      )).rows[0];

      const payment=(await client.query<{
        captured_minor:string;refunded_minor:string;net_collected_minor:string;
      }>(
        `SELECT captured_minor::text,refunded_minor::text,net_collected_minor::text
           FROM analytics_payment_facts
          WHERE reservation_id=$1`,
        [RESERVATION]
      )).rows[0];

      return {reservation,payment};
    });

    expect(facts.reservation.stay_nights).toBe(2);
    expect(Number(facts.reservation.lead_time_days)).toBeGreaterThan(8);
    expect(facts.reservation.accommodation_minor).toBe("1001");
    expect(facts.reservation.gross_revenue_minor).toBe("1201");
    expect(facts.reservation.source_version).toBe(3);

    expect(facts.payment.captured_minor).toBe("1201");
    expect(facts.payment.refunded_minor).toBe("201");
    expect(facts.payment.net_collected_minor).toBe("1000");
  });

  it("preserves exact minor-unit totals across daily allocation",async()=>{
    await projector.processBatch(actor,500);
    const rows=await queries.propertyDaily(actor,PROPERTY,"2027-01-10","2027-01-11");

    const target=rows.filter(row=>row.currency==="UZS");
    expect(target).toHaveLength(2);

    expect(target[0].date).toBe("2027-01-10");
    expect(target[0].occupiedUnitNights).toBe(1);
    expect(target[0].availableUnitNights).toBeGreaterThanOrEqual(1);
    expect(target[0].accommodationRevenueMinor).toBe("501");
    expect(target[0].grossRevenueMinor).toBe("601");
    expect(target[0].netRevenueMinor).toBe("500");

    expect(target[1].date).toBe("2027-01-11");
    expect(target[1].accommodationRevenueMinor).toBe("500");
    expect(target[1].grossRevenueMinor).toBe("600");
    expect(target[1].netRevenueMinor).toBe("500");

    const accommodationTotal=target.reduce(
      (sum,row)=>sum+BigInt(row.accommodationRevenueMinor),0n
    );
    const grossTotal=target.reduce(
      (sum,row)=>sum+BigInt(row.grossRevenueMinor),0n
    );
    const netTotal=target.reduce(
      (sum,row)=>sum+BigInt(row.netRevenueMinor),0n
    );

    expect(accommodationTotal).toBe(1001n);
    expect(grossTotal).toBe(1201n);
    expect(netTotal).toBe(1000n);
  });

  it("exposes truthful channel/segment cancellation and no-show dimensions",async()=>{
    await projector.processBatch(actor,500);
    const rows=await queries.propertyDimensions(actor,PROPERTY,"2027-01-10","2027-01-10");

    const direct=rows.find(row=>row.bookingChannel==="direct"&&row.marketSegment==="leisure");
    const ota=rows.find(row=>row.bookingChannel==="ota"&&row.marketSegment==="leisure");
    const corporate=rows.find(row=>row.bookingChannel==="corporate_portal"&&row.marketSegment==="business");

    expect(direct?.activeBookingCount).toBe(1);
    expect(ota?.cancelledBookingCount).toBe(1);
    expect(ota?.cancellationRate).toBe(1);
    expect(corporate?.noShowBookingCount).toBe(1);
    expect(corporate?.noShowRate).toBe(1);
  });

  it("reports analytics projection lag from unconsumed relevant events",async()=>{
    await projector.processBatch(actor,500);

    await db.withActor(actor,async client=>{
      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload,occurred_at
         ) VALUES(
           gen_random_uuid(),$1,'reservation',$2,'booking.analytics_health_probe',
           $3,$4::jsonb,now()-interval '10 minutes'
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          ORG,RESERVATION,
          "analytics-stage6-health-probe",
          JSON.stringify({reservationId:RESERVATION})
        ]
      );
    });

    const health=await queries.projectionHealth(actor);
    expect(health.pendingEvents).toBeGreaterThanOrEqual(1);
    expect(health.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(500);
  });

  it("calculates occupancy, ADR, RevPAR, lead time and stay length centrally",async()=>{
    await projector.processBatch(actor,500);
    const rows=await queries.propertyDaily(actor,PROPERTY,"2027-01-10","2027-01-10");
    const day=rows.find(row=>row.currency==="UZS");
    if(!day)throw new Error("EXPECTED_ANALYTICS_DAY");

    expect(day.occupancy).toBeGreaterThan(0);
    expect(day.adrMinor).toBe("501.00");
    expect(Number(day.revparMinor)).toBeGreaterThan(0);
    expect(day.avgLeadTimeDays).toBeGreaterThan(8);
    expect(day.avgStayNights).toBe(2);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
