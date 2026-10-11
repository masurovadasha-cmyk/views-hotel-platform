import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {QuoteService} from "../rates/quote.service";
import {BookingConflictError,IdempotencyConflictError} from "./booking.errors";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const POLICY="40000000-0000-4000-8000-000000000001";
const actor={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"booking-integration-test"
};

const db=new DatabaseService();
const quotes=new QuoteService(db);
const holds=new BookingHoldService(db);
const lifecycle=new BookingLifecycleService(db);

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
        nonRefundableLineCodes:["TEST_TAX"]
      })]
    );
    await client.query("UPDATE rate_plans SET cancellation_policy_id=$1 WHERE id=$2",[POLICY,RATE]);
  });
});

async function makeQuote(start:string,end:string){
  return quotes.createQuote({
    actor,propertyId:PROPERTY,unitId:UNIT,ratePlanId:RATE,
    checkInAt:start,checkOutAt:end,
    guests:[{age:35,residency:"resident"}]
  });
}

function holdInput(key:string,quoteId:string,ttlSeconds=900){
  return {actor,quoteId,idempotencyKey:key,ttlSeconds};
}

describe.sequential("booking quote and hold integration",()=>{
  it("allows only one concurrent hold for the same unit and period",async()=>{
    const [quoteA,quoteB]=await Promise.all([
      makeQuote("2027-01-10T14:00:00+05:00","2027-01-12T12:00:00+05:00"),
      makeQuote("2027-01-10T14:00:00+05:00","2027-01-12T12:00:00+05:00")
    ]);
    const results=await Promise.allSettled([
      holds.createHold(holdInput("concurrency-a",quoteA.quoteId)),
      holds.createHold(holdInput("concurrency-b",quoteB.quoteId))
    ]);
    const successes=results.filter(x=>x.status==="fulfilled");
    const failures=results.filter(x=>x.status==="rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(BookingConflictError);
  });

  it("replays the same idempotency key without creating another reservation",async()=>{
    const quote=await makeQuote("2027-02-01T14:00:00+05:00","2027-02-03T12:00:00+05:00");
    const request=holdInput("idem-same",quote.quoteId);
    const first=await holds.createHold(request);
    const second=await holds.createHold(request);
    expect(second.reservationId).toBe(first.reservationId);
    expect(second.idempotentReplay).toBe(true);
    expect(second.totalMinor).toBe(quote.totalMinor);
  });

  it("rejects reuse of an idempotency key with a different quote",async()=>{
    const firstQuote=await makeQuote("2027-02-10T14:00:00+05:00","2027-02-11T12:00:00+05:00");
    const secondQuote=await makeQuote("2027-02-12T14:00:00+05:00","2027-02-13T12:00:00+05:00");
    await holds.createHold(holdInput("idem-conflict",firstQuote.quoteId));
    await expect(holds.createHold(holdInput("idem-conflict",secondQuote.quoteId))).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("freezes quote price lines and cancellation policy on the reservation",async()=>{
    const quote=await makeQuote("2027-02-20T14:00:00+05:00","2027-02-22T12:00:00+05:00");
    const hold=await holds.createHold(holdInput("snapshot-create",quote.quoteId));
    const snapshot=await db.withActor(actor,async client=>{
      const reservation=await client.query<{
        total_minor:string;cancellation_policy_snapshot:Record<string,unknown>;quote_snapshot:Record<string,unknown>;
      }>("SELECT total_minor::text,cancellation_policy_snapshot,quote_snapshot FROM reservations WHERE id=$1",[hold.reservationId]);
      const lines=await client.query<{code:string;amount_minor:string;refundable:boolean}>(
        "SELECT code,amount_minor::text,refundable FROM reservation_price_lines WHERE reservation_id=$1 ORDER BY sort_order,id",
        [hold.reservationId]
      );
      return {reservation:reservation.rows[0],lines:lines.rows};
    });
    expect(BigInt(snapshot.reservation.total_minor)).toBe(quote.totalMinor);
    expect((snapshot.reservation.quote_snapshot as {quoteId?:string}).quoteId).toBe(quote.quoteId);
    expect(snapshot.lines.length).toBe(quote.lines.length);
    expect((snapshot.reservation.cancellation_policy_snapshot as {rules?:unknown[]}).rules?.length).toBeGreaterThan(0);
  });

  it("confirms a valid hold and converts the inventory period to reservation",async()=>{
    const quote=await makeQuote("2027-03-01T14:00:00+05:00","2027-03-02T12:00:00+05:00");
    const hold=await holds.createHold(holdInput("confirm-create",quote.quoteId));
    const confirmed=await lifecycle.confirmHold(actor,hold.reservationId,"confirm-command");
    expect(confirmed.status).toBe("confirmed");
    const state=await db.withActor(actor,async client=>{
      const r=await client.query<{status:string}>("SELECT status FROM reservations WHERE id=$1",[hold.reservationId]);
      const p=await client.query<{kind:string;expires_at:Date|null}>(
        "SELECT kind,expires_at FROM inventory_periods WHERE reservation_id=$1",[hold.reservationId]
      );
      return {reservation:r.rows[0],period:p.rows[0]};
    });
    expect(state.reservation.status).toBe("confirmed");
    expect(state.period.kind).toBe("reservation");
    expect(state.period.expires_at).toBeNull();
    const replay=await lifecycle.confirmHold(actor,hold.reservationId,"confirm-command");
    expect(replay.idempotentReplay).toBe(true);
  });

  it("manually releases a hold and makes the dates sellable again",async()=>{
    const quote=await makeQuote("2027-03-10T14:00:00+05:00","2027-03-11T12:00:00+05:00");
    const hold=await holds.createHold(holdInput("release-create",quote.quoteId));
    const released=await lifecycle.releaseHold(actor,hold.reservationId,"release-command");
    expect(released.status).toBe("cancelled");
    const periodCount=await db.withActor(actor,async client=>{
      const p=await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM inventory_periods WHERE reservation_id=$1",[hold.reservationId]
      );
      return Number(p.rows[0].count);
    });
    expect(periodCount).toBe(0);
  });

  it("expires stale holds and releases their inventory",async()=>{
    const quote=await makeQuote("2027-04-01T14:00:00+05:00","2027-04-02T12:00:00+05:00");
    const hold=await holds.createHold(holdInput("expire-create",quote.quoteId));
    await db.withActor(actor,async client=>{
      await client.query("UPDATE reservations SET hold_expires_at=now()-interval '1 second' WHERE id=$1",[hold.reservationId]);
      await client.query("UPDATE inventory_periods SET expires_at=now()-interval '1 second' WHERE reservation_id=$1",[hold.reservationId]);
    });
    const result=await lifecycle.expireTenantBatch(ORG,10);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const state=await db.withActor(actor,async client=>{
      const r=await client.query<{status:string}>("SELECT status FROM reservations WHERE id=$1",[hold.reservationId]);
      const p=await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM inventory_periods WHERE reservation_id=$1",[hold.reservationId]
      );
      return {status:r.rows[0].status,count:Number(p.rows[0].count)};
    });
    expect(state.status).toBe("cancelled");
    expect(state.count).toBe(0);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
