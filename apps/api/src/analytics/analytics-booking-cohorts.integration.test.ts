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

const ACTIVE="e1000000-0000-4000-8000-000000000001";
const CANCELLED="e1000000-0000-4000-8000-000000000002";
const NO_SHOW="e1000000-0000-4000-8000-000000000003";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"analytics-cohort-v2"
};

const db=new DatabaseService();
const projector=new AnalyticsProjectionService(db);
const queries=new AnalyticsQueryService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot,confirmed_at,cancelled_at,
         created_at,updated_at,version
       ) VALUES
       (
         $1,$4,$5,$6,$7,'VW-COHORT-V2-ACTIVE','confirmed',
         '2027-03-10T14:00:00+05','2027-03-12T12:00:00+05',
         'UZS',2000,2200,'{}'::jsonb,
         '{"bookingChannel":"Direct Web","marketSegment":"Leisure"}'::jsonb,
         '2027-02-10T12:00:00+05',NULL,
         '2027-02-10T12:00:00+05','2027-03-01T12:00:00+05',2
       ),
       (
         $2,$4,$5,$6,$7,'VW-COHORT-V2-CANCELLED','cancelled',
         '2027-03-10T14:00:00+05','2027-03-12T12:00:00+05',
         'UZS',1800,2000,'{}'::jsonb,
         '{"sourceChannel":"Direct Web","guestSegment":"Leisure"}'::jsonb,
         '2027-02-15T12:00:00+05','2027-03-05T14:00:00+05',
         '2027-02-15T12:00:00+05','2027-03-05T14:00:00+05',4
       ),
       (
         $3,$4,$5,$6,$7,'VW-COHORT-V2-NOSHOW','no_show',
         '2027-03-10T14:00:00+05','2027-03-11T12:00:00+05',
         'UZS',900,1000,'{}'::jsonb,
         '{}'::jsonb,
         '2027-02-20T12:00:00+05',NULL,
         '2027-02-20T12:00:00+05','2027-03-10T16:00:00+05',3
       )
       ON CONFLICT(id) DO NOTHING`,
      [ACTIVE,CANCELLED,NO_SHOW,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO booking_state_events(
         id,organization_id,reservation_id,event_type,from_status,to_status,
         actor_user_id,idempotency_key,payload,created_at
       ) VALUES
       (
         gen_random_uuid(),$1,$2,'booking.cancelled','confirmed','cancelled',
         $4,'analytics-cohort-v2-cancelled','{}'::jsonb,'2027-03-05T14:00:00+05'
       ),
       (
         gen_random_uuid(),$1,$3,'booking.no_show','confirmed','no_show',
         $4,'analytics-cohort-v2-no-show','{}'::jsonb,'2027-03-10T16:00:00+05'
       )
       ON CONFLICT(organization_id,idempotency_key,event_type) DO NOTHING`,
      [ORG,CANCELLED,NO_SHOW,USER]
    );

    await client.query(
      `INSERT INTO outbox_events(
         id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload,occurred_at
       ) VALUES
       (gen_random_uuid(),$1,'reservation',$2,'booking.confirmed',$5,$6::jsonb,'2027-03-01T12:00:00+05'),
       (gen_random_uuid(),$1,'reservation',$3,'booking.cancelled',$7,$8::jsonb,'2027-03-05T14:00:00+05'),
       (gen_random_uuid(),$1,'reservation',$4,'booking.no_show',$9,$10::jsonb,'2027-03-10T16:00:00+05')
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        ORG,ACTIVE,CANCELLED,NO_SHOW,
        "analytics-cohort-v2-active-event",JSON.stringify({reservationId:ACTIVE}),
        "analytics-cohort-v2-cancelled-event",JSON.stringify({reservationId:CANCELLED}),
        "analytics-cohort-v2-no-show-event",JSON.stringify({reservationId:NO_SHOW})
      ]
    );
  });

  for(let i=0;i<12;i++){
    const result=await projector.processBatch(actor,500);
    if(result.scanned===0)break;
  }
});

describe.sequential("Stage 6 truthful booking cohorts",()=>{
  it("normalizes explicit dimensions and preserves missing attribution as null",async()=>{
    const facts=await db.withActor(actor,async client=>{
      return (await client.query<{
        reservation_id:string;booking_channel:string|null;market_segment:string|null;
        booking_local_date:string;cancelled_at:Date|null;no_show_at:Date|null;
        cancellation_lead_days:string|null;
      }>(
        `SELECT
           reservation_id,booking_channel,market_segment,booking_local_date::text,
           cancelled_at,no_show_at,cancellation_lead_days::text
         FROM analytics_reservation_facts
        WHERE reservation_id = ANY($1::uuid[])
        ORDER BY reservation_id`,
        [[ACTIVE,CANCELLED,NO_SHOW]]
      )).rows;
    });

    const active=facts.find(x=>x.reservation_id===ACTIVE);
    const cancelled=facts.find(x=>x.reservation_id===CANCELLED);
    const noShow=facts.find(x=>x.reservation_id===NO_SHOW);
    if(!active||!cancelled||!noShow)throw new Error("EXPECTED_COHORT_FACTS");

    expect(active.booking_channel).toBe("direct_web");
    expect(active.market_segment).toBe("leisure");
    expect(active.booking_local_date).toBe("2027-02-10");

    expect(cancelled.booking_channel).toBe("direct_web");
    expect(cancelled.market_segment).toBe("leisure");
    expect(cancelled.cancelled_at).not.toBeNull();
    expect(Number(cancelled.cancellation_lead_days)).toBeCloseTo(5,1);

    expect(noShow.booking_channel).toBeNull();
    expect(noShow.market_segment).toBeNull();
    expect(noShow.no_show_at).not.toBeNull();
  });

  it("calculates arrival-cohort cancellation and no-show rates",async()=>{
    const rows=await queries.propertyBookingCohorts(
      actor,PROPERTY,"2027-03-10","2027-03-10"
    );

    const attributed=rows.find(
      x=>x.bookingChannel==="direct_web"&&x.marketSegment==="leisure"
    );
    const unattributed=rows.find(
      x=>x.bookingChannel===null&&x.marketSegment===null
    );
    if(!attributed||!unattributed)throw new Error("EXPECTED_COHORT_ROWS");

    expect(attributed.bookingCount).toBe(2);
    expect(attributed.activeOrStayedCount).toBe(1);
    expect(attributed.cancellationCount).toBe(1);
    expect(attributed.noShowCount).toBe(0);
    expect(attributed.cancellationRate).toBe(0.5);
    expect(attributed.noShowRate).toBe(0);
    expect(attributed.avgCancellationLeadDays).toBeCloseTo(5,1);

    expect(unattributed.bookingCount).toBe(1);
    expect(unattributed.activeOrStayedCount).toBe(0);
    expect(unattributed.cancellationCount).toBe(0);
    expect(unattributed.noShowCount).toBe(1);
    expect(unattributed.noShowRate).toBe(1);
  });

  it("filters by normalized explicit dimensions",async()=>{
    const rows=await queries.propertyBookingCohorts(
      actor,PROPERTY,"2027-03-10","2027-03-10","Direct Web","Leisure"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].bookingChannel).toBe("direct_web");
    expect(rows[0].marketSegment).toBe("leisure");
    expect(rows[0].bookingCount).toBe(2);
  });

  it("does not reintroduce the synthetic unknown dimension",async()=>{
    const rows=await queries.propertyDimensions(
      actor,PROPERTY,"2027-03-10","2027-03-10"
    );
    expect(rows.some(x=>x.bookingChannel==="unknown"||x.marketSegment==="unknown")).toBe(false);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
