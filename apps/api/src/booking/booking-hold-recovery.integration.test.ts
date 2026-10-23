import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DatabaseService} from '../database/database.service';
import {BookingHoldService} from './booking-hold.service';
import {BookingLifecycleService} from './booking-lifecycle.service';
const db=new DatabaseService(),holds=new BookingHoldService(db),lifecycle=new BookingLifecycleService(db);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const actor={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'73100000-0000-4000-8000-000000000001',requestId:'hold-recovery-test'};
const manager={...actor,userId:'76800000-0000-4000-8000-000000000001',membershipId:'76800000-0000-4000-8000-000000000001'};
const run=(sql:string,args:unknown[]=[])=>db.withActor(manager,c=>c.query(sql,args));
async function fixture(expiry="clock_timestamp()+interval '1 hour'"){
 const unit=randomUUID(),type=randomUUID(),rate=randomUUID(),quote=randomUUID(),key=randomUUID(),token=randomBytes(32).toString('hex');
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,type]);
 await run("INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,$3,'{}','UZS',100)",[rate,property,type]);
 await run(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at)
 VALUES($1,$2,$3,$4,$5,'2041-05-01T09:00:00Z','2041-05-02T07:00:00Z','{}','UZS',100,100,'{}','{}',$1::uuid::text,${expiry})`,[quote,org,property,unit,rate]);
 expect((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[actor.membershipId,createHash('sha256').update(token).digest('hex')])).rows[0].ok).toBe(true);
 return {actor,quoteId:quote,idempotencyKey:key,staffSession:token};
}
async function snapshot(key:string){return (await run(`SELECT
 (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM reservations r WHERE idempotency_key=$1) reservations,
 (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM booking_commands c WHERE idempotency_key=$1) commands,
 (SELECT count(*)::int FROM inventory_periods WHERE source_ref=$1) periods,
 (SELECT count(*)::int FROM booking_state_events WHERE idempotency_key=$1) events,
 (SELECT count(*)::int FROM outbox_events WHERE idempotency_key='outbox:'||$1) outbox`,[key])).rows[0];}
beforeAll(async()=>{expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');expect((await db.query('SELECT current_user role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]).toEqual({role:'views_app',rolsuper:false,rolbypassrls:false});});
afterAll(()=>db.onModuleDestroy());
describe.sequential('booking hold lost-response recovery',()=>{
 it.each(['confirmed','cancelled','expired'] as const)('recovers current %s outcome without creating another hold',async(status)=>{
  const input=await fixture(),first=await holds.createHold(input);
  if(status==='confirmed')await lifecycle.confirmHold(actor,first.reservationId,randomUUID());
  else if(status==='cancelled')await lifecycle.releaseHold(actor,first.reservationId,randomUUID());
  else await run("UPDATE reservations SET hold_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[first.reservationId]);
  const before=await snapshot(input.idempotencyKey),result=await holds.createHold(input);
  expect(result).toMatchObject({reservationId:first.reservationId,status:status==='expired'?'hold':status,activeHold:false,idempotentReplay:true,totalMinor:100n});
  if(status!=='expired')expect(result.holdExpiresAt).toBeNull();expect(await snapshot(input.idempotencyKey)).toEqual(before);
 });
 it('denies a revoked staff session even if actor membership still has permission',async()=>{
  const input=await fixture(),first=await holds.createHold(input),before=await snapshot(input.idempotencyKey);
  await db.query('SELECT app.staff_auth_logout($1,false)',[createHash('sha256').update(input.staffSession).digest('hex')]);
  await expect(holds.createHold(input)).rejects.toThrow('STAFF_SESSION_REQUIRED');expect(await snapshot(input.idempotencyKey)).toEqual(before);expect(first.reservationId).toBeTruthy();
 });
 it('denies cached replay after logout during an observed command uniqueness wait',async()=>{
  const input=await fixture();await holds.createHold(input);const before=await snapshot(input.idempotencyKey);
  const locker=new Client({connectionString:process.env.DATABASE_URL});let pending:Promise<unknown>|undefined;
  try{
   await locker.connect();await locker.query('BEGIN');await locker.query("SELECT set_config('app.organization_id',$1,true)",[org]);
   await locker.query('UPDATE booking_commands SET completed_at=completed_at WHERE organization_id=$1 AND idempotency_key=$2',[org,input.idempotencyKey]);
   const blocker=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=holds.createHold(input).then(value=>({value}),error=>({error}));
   let waiting=false;const deadline=Date.now()+2000;while(Date.now()<deadline){waiting=(await db.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);
   await db.query('SELECT app.staff_auth_logout($1,false)',[createHash('sha256').update(input.staffSession).digest('hex')]);await locker.query('ROLLBACK');
   expect(await pending).toMatchObject({error:{message:'STAFF_SESSION_REQUIRED'}});expect(await snapshot(input.idempotencyKey)).toEqual(before);
  }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;await locker.end();}
 });
 it('recovers a committed hold after quote expiry but rejects a fresh expired quote',async()=>{
  const input=await fixture("clock_timestamp()+interval '300 milliseconds'"),first=await holds.createHold(input);
  await new Promise(r=>setTimeout(r,350));const before=await snapshot(input.idempotencyKey);
  expect(await holds.createHold({...input,recoveryOnly:true,propertyId:property})).toMatchObject({reservationId:first.reservationId,activeHold:true,idempotentReplay:true});expect(await snapshot(input.idempotencyKey)).toEqual(before);
  const expired=await fixture("clock_timestamp()-interval '1 second'");await expect(holds.createHold(expired)).rejects.toThrow('QUOTE_EXPIRED');expect((await snapshot(expired.idempotencyKey)).commands).toEqual([]);
 });
 it('records a durable not-created result before allowing a new intent',async()=>{
  const input=await fixture();await expect(holds.createHold({...input,recoveryOnly:true,propertyId:property})).rejects.toThrow('HOLD_NOT_CREATED');
  const before=await snapshot(input.idempotencyKey);expect(before.reservations).toEqual([]);expect(before.periods).toBe(0);expect(before.commands).toHaveLength(1);expect(before.commands[0].result_snapshot).toEqual({notCreated:true});
  await expect(holds.createHold(input)).rejects.toThrow('HOLD_NOT_CREATED');await expect(holds.createHold({...input,recoveryOnly:true})).rejects.toThrow('HOLD_NOT_CREATED');
  await expect(holds.createHold({...input,ttlSeconds:60})).rejects.toThrow('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');expect(await snapshot(input.idempotencyKey)).toEqual(before);
 });
 it('prevents a delayed original from creating a hidden hold after conflict recovery and release',async()=>{
  const input=await fixture(),occupying=await holds.createHold({...input,idempotencyKey:randomUUID()});
  await expect(holds.createHold(input)).rejects.toThrow('UNIT_NOT_AVAILABLE');
  await expect(holds.createHold({...input,recoveryOnly:true})).rejects.toThrow('HOLD_NOT_CREATED');
  await lifecycle.releaseHold(actor,occupying.reservationId,randomUUID());
  const before=await snapshot(input.idempotencyKey);
  await expect(holds.createHold(input)).rejects.toThrow('HOLD_NOT_CREATED');
  expect(before.reservations).toEqual([]);expect(await snapshot(input.idempotencyKey)).toEqual(before);
 });
 it('serializes racing original and recovery as one committed hold or one durable absence',async()=>{
  const input=await fixture(),outcomes=await Promise.allSettled([holds.createHold(input),holds.createHold({...input,recoveryOnly:true})]);
  const state=await snapshot(input.idempotencyKey);expect(state.commands).toHaveLength(1);
  if(state.reservations.length){expect(state.reservations).toHaveLength(1);expect(state.periods).toBe(1);expect(state.events).toBe(1);expect(state.outbox).toBe(1);expect(outcomes.every(r=>r.status==='fulfilled')).toBe(true);}
  else{expect(state.periods).toBe(0);for(const r of outcomes){expect(r.status).toBe('rejected');if(r.status==='rejected')expect(r.reason.message).toBe('HOLD_NOT_CREATED');}}
 });
 it('does not permit foreign tenant/property, mismatched payload or insufficient role recovery',async()=>{
  const input=await fixture();await holds.createHold(input);const before=await snapshot(input.idempotencyKey);
  await expect(holds.createHold({...input,recoveryOnly:true,propertyId:randomUUID()})).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(holds.createHold({...input,recoveryOnly:true,actor:{...actor,organizationId:randomUUID()}})).rejects.toThrow('QUOTE_NOT_FOUND');
  const other=await fixture();await expect(holds.createHold({...input,recoveryOnly:true,quoteId:other.quoteId})).rejects.toThrow('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
  await expect(holds.createHold({...input,recoveryOnly:true,actor:{...actor,userId:'76900000-0000-4000-8000-000000000001',membershipId:'76900000-0000-4000-8000-000000000001'}})).rejects.toThrow('PROPERTY_FORBIDDEN');expect(await snapshot(input.idempotencyKey)).toEqual(before);
 });
 it('denies a revoked session for a fresh hold and does not persist a command',async()=>{
  const input=await fixture();await db.query('SELECT app.staff_auth_logout($1,false)',[createHash('sha256').update(input.staffSession).digest('hex')]);
  await expect(holds.createHold(input)).rejects.toThrow('STAFF_SESSION_REQUIRED');expect((await snapshot(input.idempotencyKey)).commands).toEqual([]);
 });

});
