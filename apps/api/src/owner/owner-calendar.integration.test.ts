import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {OwnerCalendarService} from './owner-calendar.service';
import {QuoteService} from '../rates/quote.service';
import {BookingHoldService} from '../booking/booking-hold.service';
const db=new DatabaseService(),service=new OwnerCalendarService(db);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000003',membershipId:'30000000-0000-4000-8000-000000000003',requestId:randomUUID()};
const property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
const block=(unitId:string,start='2027-05-01T14:00+05:00',end='2027-05-03T12:00+05:00')=>({action:'block',unitId,kind:'maintenance',start,end});
async function unit(){const id=randomUUID();await db.withActor(actor,c=>c.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[id,property,type,'CAL-'+id]));return id;}
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_OWNER_CALENDAR_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('owner calendar unified inventory',()=>{
 it('lists scoped periods without guest data and atomically creates/replays/removes a manual block',async()=>{
  const id=await unit(),key=randomUUID(),input=block(id),r=await service.mutate(actor,property,input,key);
  expect(await service.mutate(actor,property,input,key)).toEqual({...r,idempotentReplay:true});
  await expect(service.mutate(actor,property,{...input,kind:'host_block'},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  const list=await service.list(actor,property,'2027-05-01','2027-05-10'),period=list.periods.find(p=>p.id===r.periodId);
  expect(period.canRemove).toBe(true);expect(Object.keys(period).sort()).toEqual(['canRemove','end','expiresAt','id','kind','start','unitId']);
  const releaseKey=randomUUID(),released=await service.mutate(actor,property,{action:'unblock',periodId:r.periodId},releaseKey);
  expect(await service.mutate(actor,property,{action:'unblock',periodId:r.periodId},releaseKey)).toEqual({...released,idempotentReplay:true});
  expect(await service.mutate(actor,property,input,key)).toEqual({...r,idempotentReplay:true});
  expect((await service.list(actor,property,'2027-05-01','2027-05-10')).periods.some(p=>p.id===r.periodId)).toBe(false);
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1',[r.periodId])).rows[0].n).toBe(2);
   expect((await c.query('SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1',[r.periodId])).rows[0].n).toBe(2);
  });
 });
 it('allows adjacent half-open blocks and rejects overlap for both manual kinds',async()=>{
  const id=await unit();await service.mutate(actor,property,block(id),randomUUID());
  await service.mutate(actor,property,{...block(id,'2027-05-03T12:00+05:00','2027-05-04T12:00+05:00'),kind:'host_block'},randomUUID());
  await expect(service.mutate(actor,property,block(id,'2027-05-03T11:59+05:00','2027-05-04T12:00+05:00'),randomUUID())).rejects.toThrow('CALENDAR_PERIOD_CONFLICT');
 });
 it('serializes duplicates and ensures competing manual periods have one winner',async()=>{
  const id=await unit(),key=randomUUID();const results=await Promise.all(Array.from({length:4},()=>service.mutate(actor,property,block(id),key)));
  expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  const other=await unit(),race=await Promise.allSettled(Array.from({length:2},()=>service.mutate(actor,property,block(other),randomUUID())));expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('CALENDAR_PERIOD_CONFLICT');
 });
 it('uses the same exclusion boundary as a concurrently created payment hold',async()=>{
  const id=await unit(),rate=randomUUID(),policy=randomUUID();
  await db.withActor(actor,c=>c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1,$2,$3,'{"en":"Calendar proof"}','{"version":1,"rules":[{"minHoursBeforeCheckIn":0,"refundBps":0}],"nonRefundableLineCodes":[]}')`,[policy,actor.organizationId,policy]));
  await db.withActor(actor,c=>c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id) VALUES($1,$2,$3,'{"en":"Calendar proof"}','UZS',100000,$4)`,[rate,property,type,policy]));
  const input=block(id),quote=await new QuoteService(db).createQuote({actor,propertyId:property,unitId:id,ratePlanId:rate,checkInAt:input.start,checkOutAt:input.end,guests:[{age:30,residency:'resident'}]});
  const race=await Promise.allSettled([service.mutate(actor,property,input,randomUUID()),new BookingHoldService(db).createHold({actor,quoteId:quote.quoteId,idempotencyKey:randomUUID(),ttlSeconds:300})]);
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  await db.withActor(actor,async c=>expect((await c.query('SELECT count(*)::int n FROM inventory_periods WHERE unit_id=$1',[id])).rows[0].n).toBe(1));
 });
 it('cannot release externally managed blocks, altered periods or holds, including expired holds',async()=>{
  const id=await unit(),r=await service.mutate(actor,property,block(id),randomUUID());
  await db.withActor(actor,c=>c.query("UPDATE inventory_periods SET stay_period=tstzrange('2027-05-01T14:00:30+05','2027-05-03T12:00+05','[)') WHERE id=$1",[r.periodId]));
  expect((await service.list(actor,property,'2027-05-01','2027-05-10')).periods.find(p=>p.id===r.periodId).canRemove).toBe(false);
  await expect(service.mutate(actor,property,{action:'unblock',periodId:r.periodId},randomUUID())).rejects.toThrow('CALENDAR_BLOCK_NOT_FOUND');
  const external=randomUUID();await db.withActor(actor,c=>c.query(`INSERT INTO inventory_periods(id,organization_id,property_id,unit_id,kind,source_ref,stay_period) VALUES($1,$2,$3,$4,'external_calendar','channel-proof',tstzrange('2027-06-01','2027-06-02','[)'))`,[external,actor.organizationId,property,id]));
  await expect(service.mutate(actor,property,{action:'unblock',periodId:external},randomUUID())).rejects.toThrow('CALENDAR_BLOCK_NOT_FOUND');
  const held=await unit(),reservation=randomUUID(),period=randomUUID();await db.withActor(actor,async c=>{
   await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'hold','2027-05-01','2027-05-02','UZS','{}')`,[reservation,actor.organizationId,property,held,reservation]);
   await c.query(`INSERT INTO inventory_periods(id,organization_id,property_id,unit_id,kind,reservation_id,stay_period,expires_at) VALUES($1,$2,$3,$4,'payment_hold',$5,tstzrange('2027-05-01','2027-05-02','[)'),now()-interval '1 hour')`,[period,actor.organizationId,property,held,reservation]);
  });
  await expect(service.mutate(actor,property,{action:'unblock',periodId:period},randomUUID())).rejects.toThrow('CALENDAR_BLOCK_NOT_FOUND');
  await expect(service.mutate(actor,property,block(held),randomUUID())).rejects.toThrow('CALENDAR_PERIOD_CONFLICT');
 });
 it('rejects denied roles, foreign properties/units and default-off activation',async()=>{
  const denied={...actor,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
  await expect(service.list(denied,property,'2027-05-01','2027-05-10')).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
  await expect(service.mutate(denied,property,block(await unit()),randomUUID())).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
  await expect(service.list(actor,'10000000-0000-4000-8000-000000000002','2027-05-01','2027-05-10')).rejects.toThrow('INVENTORY_NOT_FOUND');
  await expect(service.mutate(actor,property,block('10000000-0000-4000-8000-000000000004'),randomUUID())).rejects.toThrow('CALENDAR_UNIT_UNAVAILABLE');
  vi.stubEnv('VIEWS_OWNER_CALENDAR_ENABLED','');await expect(service.list(actor,property,'2027-05-01','2027-05-10')).rejects.toThrow('OWNER_CALENDAR_DISABLED');
 });
 it('rolls back block creation and removal when the outbox fails',async()=>{
  const id=await unit(),r=await service.mutate(actor,property,block(id),randomUUID());
  const broken=new OwnerCalendarService({withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return (sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO outbox_events'))throw Error('INJECTED_OUTBOX_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService);
  await expect(broken.mutate(actor,property,{action:'unblock',periodId:r.periodId},randomUUID())).rejects.toThrow('INJECTED_OUTBOX_FAILURE');
  const next=await unit();await expect(broken.mutate(actor,property,block(next),randomUUID())).rejects.toThrow('INJECTED_OUTBOX_FAILURE');
  await db.withActor(actor,async c=>{expect((await c.query('SELECT count(*)::int n FROM inventory_periods WHERE id=$1',[r.periodId])).rows[0].n).toBe(1);expect((await c.query('SELECT count(*)::int n FROM inventory_periods WHERE unit_id=$1',[next])).rows[0].n).toBe(0);});
 });
});
