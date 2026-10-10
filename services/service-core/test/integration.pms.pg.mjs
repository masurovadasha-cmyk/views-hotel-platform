import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {applyPmsBookingEvent} from "../src/pms-sync.mjs";
import {inTenantTransaction} from "../src/postgres.mjs";

if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL required");
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
test("PMS events deduplicate and reject stale booking versions",async()=>{
 const organizationId=randomUUID(),propertyId=randomUUID(),guestPrincipalId="pms-guest",bookingReference="VW-PMS-"+randomUUID();
 const base={organizationId,propertyId,guestPrincipalId,bookingReference,source:"test-pms",startsAt:"2026-10-01T10:00:00Z",endsAt:"2026-11-01T10:00:00Z"};
 try{
  const first=await applyPmsBookingEvent(pool,{...base,eventId:"event-1",version:1,status:"checked_in"});
  assert.equal(first.applied,true);
  const duplicate=await applyPmsBookingEvent(pool,{...base,eventId:"event-1",version:1,status:"checked_in"});
  assert.equal(duplicate.reason,"duplicate");
  const updated=await applyPmsBookingEvent(pool,{...base,eventId:"event-3",version:3,status:"cancelled"});
  assert.equal(updated.applied,true);
  const stale=await applyPmsBookingEvent(pool,{...base,eventId:"event-2",version:2,status:"checked_in"});
  assert.equal(stale.reason,"stale");
  const row=await inTenantTransaction(pool,organizationId,async db=>(await db.query("SELECT status,source_version FROM service_guest_bookings WHERE organization_id=$1 AND booking_reference=$2",[organizationId,bookingReference])).rows[0]);
  assert.equal(row.status,"cancelled");
  assert.equal(Number(row.source_version),3);
 }finally{await pool.end()}
});
