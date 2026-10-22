import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {OwnerInventoryService} from './owner-inventory.service';
import {QuoteService} from '../rates/quote.service';
import type {InventoryEdit} from './owner-inventory.edit';
const db=new DatabaseService(),service=new OwnerInventoryService(db);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000003',membershipId:'30000000-0000-4000-8000-000000000003',requestId:randomUUID()};
const input={name:'Synthetic editable property',city:'Tashkent',address:'Synthetic address',unitTypeName:'Double',maxGuests:2,unitCodes:['A1','A2'],nightlyMinor:'10000000',freeCancellationHours:48};
const extra={id:null,name:'Family',maxGuests:4,units:[{id:null,code:'F1'},{id:null,code:'F2'}],nightlyMinor:'900719925474099',freeCancellationHours:72};
function edit(d:Awaited<ReturnType<OwnerInventoryService['detail']>>):InventoryEdit{
 return {revision:d.revision,name:d.name,city:d.city,address:d.address,categories:d.categories};
}
async function fresh(){const r=await service.create(actor,input,randomUUID());return {r,d:edit(await service.detail(actor,r.propertyId))};}
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('editable owner fund PostgreSQL boundary',()=>{
 it('adds categories and rooms, preserves IDs, precise rates and independent cancellation terms',async()=>{
  const {r,d}=await fresh(),key=randomUUID();
  const changed={...d,name:'Renamed property',city:'Samarkand',address:'Updated address',categories:[{...d.categories[0],name:'Suite',maxGuests:3,nightlyMinor:'20000001',freeCancellationHours:24,units:d.categories[0].units.map((u,i)=>({...u,code:'S'+i}))},extra]};
  const result=await service.update(actor,r.propertyId,changed,key),next=await service.detail(actor,r.propertyId);
  expect(result.status).toBe('draft');expect(next.revision).not.toBe(d.revision);expect(next.name).toBe(changed.name);
  expect(next.categories).toHaveLength(2);expect(next.categories.find(t=>t.id===r.unitTypeId)).toMatchObject(changed.categories[0]);expect(next.categories.find(t=>t.name==='Family')).toMatchObject({maxGuests:4,nightlyMinor:'900719925474099',freeCancellationHours:72});
  expect(await service.update(actor,r.propertyId,changed,key)).toEqual({...result,idempotentReplay:true});
  await expect(service.update(actor,r.propertyId,{...changed,name:'Other'},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await db.withActor(actor,async c=>{
   expect((await c.query("SELECT count(*)::int n FROM units WHERE property_id=$1 AND status='draft'",[r.propertyId])).rows[0].n).toBe(4);
   expect((await c.query('SELECT bool_and(NOT active) ok FROM rate_plans WHERE property_id=$1',[r.propertyId])).rows[0].ok).toBe(true);
   const audit=(await c.query("SELECT before_state,after_state FROM audit_log WHERE entity_id=$1 AND action='owner.inventory_updated'",[r.propertyId])).rows;expect(audit).toHaveLength(1);expect(audit[0].before_state.revision).toBe(d.revision);expect(audit[0].after_state.revision).toBe(next.revision);
   expect((await c.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='owner.inventory_updated'",[r.propertyId])).rows[0].n).toBe(1);
  });
  await expect(new QuoteService(db).createQuote({actor,propertyId:r.propertyId,unitId:r.units[0].id,ratePlanId:r.ratePlanId,checkInAt:'2027-12-01T14:00:00+05:00',checkOutAt:'2027-12-02T12:00:00+05:00',guests:[{age:30,residency:'resident'}]})).rejects.toThrow('UNIT_OR_RATE_NOT_FOUND');
 });
 it('serializes competing edits, rejects stale revisions and replays one concurrent command',async()=>{
  const {r,d}=await fresh();
  const results=await Promise.allSettled(['First','Second'].map(name=>service.update(actor,r.propertyId,{...d,name},randomUUID())));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect((results.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message).toBe('INVENTORY_REVISION_CONFLICT');
  const current=edit(await service.detail(actor,r.propertyId)),key=randomUUID();
  const replays=await Promise.all(Array.from({length:4},()=>service.update(actor,r.propertyId,{...current,categories:[...current.categories,extra]},key)));
  expect(replays.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect((await service.detail(actor,r.propertyId)).categories).toHaveLength(2);
 });
 it('swaps room codes without losing IDs, moves a room and removes an unused category',async()=>{
  const {r,d}=await fresh(),original=d.categories[0].units;
  await service.update(actor,r.propertyId,{...d,categories:[{...d.categories[0],units:original.map((u,i)=>({...u,code:original[1-i].code}))},extra]},randomUUID());
  const next=edit(await service.detail(actor,r.propertyId)),old=next.categories.find(c=>c.id===r.unitTypeId)!,family=next.categories.find(c=>c.name==='Family')!;
  expect(old.units.find(u=>u.id===original[0].id)?.code).toBe(original[1].code);
  await service.update(actor,r.propertyId,{...next,categories:[{...family,units:[family.units[0],old.units[0]]}]},randomUUID());
  const final=await service.detail(actor,r.propertyId);expect(final.categories).toHaveLength(1);expect(final.categories[0].units).toHaveLength(2);expect(final.categories[0].units.some(u=>u.id===old.units[0].id)).toBe(true);
 });
 it('rejects foreign room/type IDs and property reads without any partial writes',async()=>{
  const {r,d}=await fresh(),foreign=await fresh();
  for(const categories of [[{...d.categories[0],id:foreign.r.unitTypeId}],[{...d.categories[0],units:[{id:foreign.r.units[0].id,code:'Z1'}]}]])await expect(service.update(actor,r.propertyId,{...d,categories},randomUUID())).rejects.toThrow('INVALID_INVENTORY_DRAFT');
  expect(edit(await service.detail(actor,r.propertyId))).toEqual(d);
  await expect(service.detail(actor,'10000000-0000-4000-8000-000000000002')).rejects.toThrow('INVENTORY_NOT_FOUND');
  const denied={...actor,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
  await expect(service.detail(denied,r.propertyId)).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');await expect(service.update(denied,r.propertyId,d,randomUUID())).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
 });
 it('rolls back edits, inserted categories, removed rooms and policy changes if audit fails',async()=>{
  const {r,d}=await fresh();
  const broken=new OwnerInventoryService({withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return (sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('INJECTED_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService);
  await expect(broken.update(actor,r.propertyId,{...d,categories:[{...d.categories[0],freeCancellationHours:72,units:[d.categories[0].units[0]]},extra]},randomUUID())).rejects.toThrow('INJECTED_AUDIT_FAILURE');
  expect(edit(await service.detail(actor,r.propertyId))).toEqual(d);
  await db.withActor(actor,async c=>expect((await c.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='owner.inventory_updated'",[r.propertyId])).rows[0].n).toBe(0));
 });
 it('refuses activated inventory and operational records, even when another editor submits stale data',async()=>{
  for(const operation of ['property','unit','rate','reservation']){
   const {r,d}=await fresh();await db.withActor(actor,async c=>{
    if(operation==='property')await c.query("UPDATE properties SET status='active' WHERE id=$1",[r.propertyId]);
    if(operation==='unit')await c.query("UPDATE units SET status='active' WHERE id=$1",[r.units[0].id]);
    if(operation==='rate')await c.query('UPDATE rate_plans SET active=true WHERE id=$1',[r.ratePlanId]);
    if(operation==='reservation')await c.query(`INSERT INTO reservations(organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,'cancelled','2027-01-01','2027-01-02','UZS','{}')`,[actor.organizationId,r.propertyId,r.units[0].id,randomUUID()]);
   });
   await expect(service.detail(actor,r.propertyId)).rejects.toThrow('INVENTORY_NOT_EDITABLE');await expect(service.update(actor,r.propertyId,d,randomUUID())).rejects.toThrow('INVENTORY_NOT_EDITABLE');
  }
 });
 it('preserves separately configured pricing rules instead of cascading their removal',async()=>{
  const {r,d}=await fresh();
  await db.withActor(actor,c=>c.query("INSERT INTO rate_day_overrides(rate_plan_id,stay_date,nightly_minor) VALUES($1,'2027-01-01',999)",[r.ratePlanId]));
  await expect(service.update(actor,r.propertyId,{...d,categories:[extra]},randomUUID())).rejects.toThrow('INVENTORY_NOT_EDITABLE');
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT nightly_minor FROM rate_day_overrides WHERE rate_plan_id=$1',[r.ratePlanId])).rows[0].nightly_minor).toBe('999');
   expect((await c.query('SELECT count(*)::int n FROM units WHERE property_id=$1',[r.propertyId])).rows[0].n).toBe(2);
  });
 });
 it('is gated off outside the local pilot',async()=>{
  const {r,d}=await fresh();vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED','');
  await expect(service.detail(actor,r.propertyId)).rejects.toThrow('OWNER_INVENTORY_DISABLED');await expect(service.update(actor,r.propertyId,d,randomUUID())).rejects.toThrow('OWNER_INVENTORY_DISABLED');
 });
});
