import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {BookingHoldService} from "../booking/booking-hold.service";
import {BookingLifecycleService} from "../booking/booking-lifecycle.service";
import {CancellationPreviewService} from "./cancellation-preview.service";
import {QuoteService} from "./quote.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const POLICY="40000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"rates-integration-test"
};

const db=new DatabaseService();
const quotes=new QuoteService(db);
const holds=new BookingHoldService(db);
const lifecycle=new BookingLifecycleService(db);
const cancellation=new CancellationPreviewService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules)
       VALUES($1,$2,'TEST_FLEX','{"en":"Test flexible"}'::jsonb,$3::jsonb)
       ON CONFLICT(organization_id,code) DO NOTHING`,
      [POLICY,ORG,JSON.stringify({
        version:1,
        rules:[
          {minHoursBeforeCheckIn:72,refundBps:10000},
          {minHoursBeforeCheckIn:24,refundBps:5000},
          {minHoursBeforeCheckIn:0,refundBps:0}
        ],
        nonRefundableLineCodes:["TEST_STAGE3_TAX"]
      })]
    );
    await client.query("UPDATE rate_plans SET cancellation_policy_id=$1 WHERE id=$2",[POLICY,RATE]);

    await client.query(
      `INSERT INTO rate_day_overrides(
         id,rate_plan_id,stay_date,nightly_minor,closed,closed_to_arrival,closed_to_departure
       )
       VALUES('50000000-0000-4000-8000-000000000001',$1,'2027-06-10',120000000,false,false,false)
       ON CONFLICT(rate_plan_id,stay_date) DO UPDATE SET nightly_minor=EXCLUDED.nightly_minor`,
      [RATE]
    );

    await client.query(
      `INSERT INTO charge_rules(
         id,organization_id,property_id,country_code,code,label,rule_kind,rate_bps,residency,effective_from
       )
       SELECT '60000000-0000-4000-8000-000000000001',$1,$2,'UZ','TEST_STAGE3_TAX',
              '{"en":"Test configurable tax"}'::jsonb,'percent_of_accommodation',1000,'all','2026-01-01'
       WHERE NOT EXISTS(
         SELECT 1 FROM charge_rules WHERE id='60000000-0000-4000-8000-000000000001'
       )`,
      [ORG,PROPERTY]
    );
  });
});

describe.sequential("quote and cancellation integration",()=>{
  it("creates an immutable server quote from persisted rates and charges",async()=>{
    const quote=await quotes.createQuote({
      actor,propertyId:PROPERTY,unitId:UNIT,ratePlanId:RATE,
      checkInAt:"2027-06-10T14:00:00+05:00",
      checkOutAt:"2027-06-12T12:00:00+05:00",
      guests:[{age:35,residency:"resident"}]
    });

    expect(quote.nights).toBe(2);
    expect(quote.accommodationMinor).toBe(211000000n);
    expect(quote.chargesMinor).toBe(21100000n);
    expect(quote.totalMinor).toBe(232100000n);
    expect(quote.lines.some(x=>x.code==="TEST_STAGE3_TAX")).toBe(true);
    expect(quote.cancellationPolicy.propertyTimezone).toBe("Asia/Tashkent");

    await expect(db.withActor(actor,async client=>{
      await client.query("UPDATE booking_quotes SET total_minor=1 WHERE id=$1",[quote.quoteId]);
    })).rejects.toThrow(/immutable/i);
  });

  it("uses the frozen reservation policy for cancellation preview",async()=>{
    const quote=await quotes.createQuote({
      actor,propertyId:PROPERTY,unitId:UNIT,ratePlanId:RATE,
      checkInAt:"2027-07-10T14:00:00+05:00",
      checkOutAt:"2027-07-12T12:00:00+05:00",
      guests:[{age:35,residency:"resident"}]
    });
    const hold=await holds.createHold({
      actor,quoteId:quote.quoteId,idempotencyKey:"stage3-cancel-hold",ttlSeconds:900
    });
    await lifecycle.confirmHold(actor,hold.reservationId,"stage3-cancel-confirm");

    const preview=await cancellation.preview(
      actor,hold.reservationId,"2027-07-01T12:00:00+05:00"
    );

    expect(preview.refundBps).toBe(10000);
    expect(preview.refundMinor).toBe(quote.accommodationMinor);
    expect(preview.refundMinor).toBeLessThan(quote.totalMinor);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
