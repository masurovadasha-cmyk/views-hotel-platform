import {afterAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {BookingConflictError} from "./booking.errors";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const actor={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"booking-integration-test"
};

const db=new DatabaseService();
const holds=new BookingHoldService(db);
const lifecycle=new BookingLifecycleService(db);

function input(key:string,start:string,end:string){
  return {
    actor,propertyId:PROPERTY,unitId:UNIT,ratePlanId:RATE,
    checkInAt:start,checkOutAt:end,currency:"UZS",
    priceLines:[
      {type:"stay",label:{en:"Stay"},amountMinor:182000000n,currency:"UZS",sortOrder:0},
      {type:"tax",label:{en:"Taxes and fees"},amountMinor:21840000n,currency:"UZS",sortOrder:1}
    ],
    idempotencyKey:key,ttlSeconds:900
  };
}

describe.sequential("booking hold integration",()=>{
  it("allows only one concurrent hold for the same unit and period",async()=>{
    const a=input("concurrency-a","2027-01-10T14:00:00+05:00","2027-01-12T12:00:00+05:00");
    const b=input("concurrency-b","2027-01-10T14:00:00+05:00","2027-01-12T12:00:00+05:00");
    const results=await Promise.allSettled([holds.createHold(a),holds.createHold(b)]);
    const successes=results.filter(x=>x.status==="fulfilled");
    const failures=results.filter(x=>x.status==="rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(BookingConflictError);
  });

  it("replays the same idempotency key without creating another reservation",async()=>{
    const request=input("idem-same","2027-02-01T14:00:00+05:00","2027-02-03T12:00:00+05:00");
    const first=await holds.createHold(request);
    const second=await holds.createHold(request);
    expect(second.reservationId).toBe(first.reservationId);
    expect(second.idempotentReplay).toBe(true);
    expect(second.totalMinor).toBe(203840000n);
  });

  it("confirms a valid hold and converts the inventory period to reservation",async()=>{
    const hold=await holds.createHold(input("confirm-create","2027-03-01T14:00:00+05:00","2027-03-02T12:00:00+05:00"));
    const confirmed=await lifecycle.confirmHold(actor,hold.reservationId,"confirm-command");
    expect(confirmed.status).toBe("confirmed");
    const state=await db.withActor(actor,async client=>{
      const r=await client.query<{status:string}>("SELECT status FROM reservations WHERE id=$1",[hold.reservationId]);
      const p=await client.query<{kind:string;expires_at:Date|null}>("SELECT kind,expires_at FROM inventory_periods WHERE reservation_id=$1",[hold.reservationId]);
      return {reservation:r.rows[0],period:p.rows[0]};
    });
    expect(state.reservation.status).toBe("confirmed");
    expect(state.period.kind).toBe("reservation");
    expect(state.period.expires_at).toBeNull();
  });

  it("expires stale holds and releases their inventory",async()=>{
    const hold=await holds.createHold(input("expire-create","2027-04-01T14:00:00+05:00","2027-04-02T12:00:00+05:00"));
    await db.withActor(actor,async client=>{
      await client.query("UPDATE reservations SET hold_expires_at=now()-interval '1 second' WHERE id=$1",[hold.reservationId]);
      await client.query("UPDATE inventory_periods SET expires_at=now()-interval '1 second' WHERE reservation_id=$1",[hold.reservationId]);
    });
    const result=await lifecycle.expireTenantBatch(ORG,10);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const state=await db.withActor(actor,async client=>{
      const r=await client.query<{status:string}>("SELECT status FROM reservations WHERE id=$1",[hold.reservationId]);
      const p=await client.query<{count:string}>("SELECT count(*)::text AS count FROM inventory_periods WHERE reservation_id=$1",[hold.reservationId]);
      return {status:r.rows[0].status,count:Number(p.rows[0].count)};
    });
    expect(state.status).toBe("cancelled");
    expect(state.count).toBe(0);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
