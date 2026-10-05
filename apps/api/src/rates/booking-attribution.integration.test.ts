import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsProjectionService} from "../analytics/analytics-projection.service";
import {BookingHoldService} from "../booking/booking-hold.service";
import {BookingLifecycleService} from "../booking/booking-lifecycle.service";
import {QuoteService} from "./quote.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";
const POLICY="f2000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,
  userId:USER,
  membershipId:MEMBERSHIP,
  requestId:"booking-attribution-integration"
};

const db=new DatabaseService();
const quotes=new QuoteService(db);
const holds=new BookingHoldService(db);
const lifecycle=new BookingLifecycleService(db);
const analytics=new AnalyticsProjectionService(db);

let quoteId="";
let reservationId="";

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO cancellation_policy_templates(
         id,organization_id,code,name,rules
       ) VALUES(
         $1,$2,'ATTRIBUTION_TEST','{"en":"Attribution test"}'::jsonb,$3::jsonb
       )
       ON CONFLICT(organization_id,code) DO UPDATE SET rules=EXCLUDED.rules`,
      [
        POLICY,ORG,
        JSON.stringify({
          version:1,
          rules:[{minHoursBeforeCheckIn:0,refundBps:10000}],
          nonRefundableLineCodes:[]
        })
      ]
    );
    await client.query(
      "UPDATE rate_plans SET cancellation_policy_id=$1 WHERE id=$2",
      [POLICY,RATE]
    );
  });

  const quote=await quotes.createQuote({
    actor,
    propertyId:PROPERTY,
    unitId:UNIT,
    ratePlanId:RATE,
    checkInAt:"2029-06-10T14:00:00+05:00",
    checkOutAt:"2029-06-12T12:00:00+05:00",
    guests:[{age:35,residency:"resident"}],
    attribution:{
      bookingChannel:"staff_crm",
      marketSegment:"Corporate Sales",
      source:"staff_actor"
    }
  });
  quoteId=quote.quoteId;

  const hold=await holds.createHold({
    actor,
    quoteId,
    idempotencyKey:"booking-attribution-hold-v1",
    ttlSeconds:900
  });
  reservationId=hold.reservationId;

  await lifecycle.confirmHold(
    actor,
    reservationId,
    "booking-attribution-confirm-v1"
  );

  for(let i=0;i<12;i++){
    const result=await analytics.processBatch(actor,500);
    if(result.scanned===0)break;
  }
});

describe.sequential("transactional booking attribution",()=>{
  it("persists normalized quote attribution with actor provenance",async()=>{
    const row=await db.withActor(actor,async client=>{
      return (await client.query<{
        booking_channel:string|null;
        market_segment:string|null;
        attribution_source:string|null;
        attribution_actor_user_id:string|null;
        attribution_actor_membership_id:string|null;
      }>(
        `SELECT
           booking_channel,market_segment,attribution_source,
           attribution_actor_user_id,attribution_actor_membership_id
         FROM booking_quotes
        WHERE id=$1`,
        [quoteId]
      )).rows[0];
    });

    expect(row.booking_channel).toBe("staff_crm");
    expect(row.market_segment).toBe("corporate_sales");
    expect(row.attribution_source).toBe("staff_actor");
    expect(row.attribution_actor_user_id).toBe(USER);
    expect(row.attribution_actor_membership_id).toBe(MEMBERSHIP);
  });

  it("freezes attribution in the reservation snapshot",async()=>{
    const snapshot=await db.withActor(actor,async client=>{
      return (await client.query<{quote_snapshot:Record<string,unknown>}>(
        "SELECT quote_snapshot FROM reservations WHERE id=$1",
        [reservationId]
      )).rows[0].quote_snapshot;
    });

    expect(snapshot).toMatchObject({
      quoteId,
      bookingChannel:"staff_crm",
      marketSegment:"corporate_sales",
      attributionSource:"staff_actor"
    });
  });

  it("projects the transactional attribution into analytics",async()=>{
    const fact=await db.withActor(actor,async client=>{
      return (await client.query<{
        booking_channel:string|null;
        market_segment:string|null;
        status:string;
      }>(
        `SELECT booking_channel,market_segment,status
         FROM analytics_reservation_facts
        WHERE reservation_id=$1`,
        [reservationId]
      )).rows[0];
    });

    expect(fact.status).toBe("confirmed");
    expect(fact.booking_channel).toBe("staff_crm");
    expect(fact.market_segment).toBe("corporate_sales");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
