import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {OwnerInventoryService} from './owner-inventory.service';
import {QuoteService} from '../rates/quote.service';
const db=new DatabaseService(),service=new OwnerInventoryService(db);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000003',membershipId:'30000000-0000-4000-8000-000000000003',requestId:randomUUID()};
const input={name:'Synthetic owner property',city:'Tashkent',address:'Synthetic address',unitTypeName:'Double',maxGuests:2,unitCodes:['A2','A1'],nightlyMinor:'900719925474099',freeCancellationHours:48};
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('owner inventory draft PostgreSQL boundary',()=>{
 it('creates an atomic inactive fund with exact money, audit/outbox and replay',async()=>{
  const key=randomUUID(),r=await service.create(actor,input,key);
  expect(r.status).toBe('draft');expect(r.units).toHaveLength(2);expect(r.nightlyMinor).toBe(input.nightlyMinor);
  expect(await service.create(actor,{...input,unitCodes:['A1','A2']},key)).toEqual({...r,idempotentReplay:true});
  await expect(service.create(actor,{...input,name:'Changed'},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT status FROM properties WHERE id=$1',[r.propertyId])).rows[0].status).toBe('draft');
   expect((await c.query('SELECT active,base_nightly_minor FROM rate_plans WHERE id=$1',[r.ratePlanId])).rows[0]).toEqual({active:false,base_nightly_minor:input.nightlyMinor});
   expect((await c.query('SELECT active FROM cancellation_policy_templates WHERE id=$1',[r.policyId])).rows[0].active).toBe(false);
   expect((await c.query('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1',[r.propertyId])).rows[0].n).toBe(1);
   expect((await c.query('SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1',[r.propertyId])).rows[0].n).toBe(1);
  });
  expect((await service.list(actor)).properties.some(p=>p.id===r.propertyId&&p.unitCount===2)).toBe(true);
  await expect(new QuoteService(db).createQuote({actor,propertyId:r.propertyId,unitId:r.units[0].id,ratePlanId:r.ratePlanId,checkInAt:'2027-12-01T14:00:00+05:00',checkOutAt:'2027-12-02T12:00:00+05:00',guests:[{age:30,residency:'resident'}]})).rejects.toThrow('UNIT_OR_RATE_NOT_FOUND');
 });
 it('serializes simultaneous retries to one fund',async()=>{
  const key=randomUUID(),results=await Promise.all(Array.from({length:4},()=>service.create(actor,input,key)));
  expect(new Set(results.map(r=>r.propertyId)).size).toBe(1);expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
 });
 it('rejects front desk, scoped host, mismatched user and foreign organization, including reads',async()=>{
  for(const a of [
   {...actor,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'},
   {...actor,userId:'20000000-0000-4000-8000-000000000004',membershipId:'30000000-0000-4000-8000-000000000004'},
   {...actor,userId:'20000000-0000-4000-8000-000000000002'},
   {...actor,organizationId:'10000000-0000-4000-8000-000000000001'}]){
   await expect(service.create(a,input,randomUUID())).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
   await expect(service.list(a)).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
  }
  expect((await service.list(actor)).properties.some(p=>p.id==='10000000-0000-4000-8000-000000000002')).toBe(false);
 });
 it('rolls back the complete fund when writing the audit fails',async()=>{
  const name='Rollback '+randomUUID();
  const broken=new OwnerInventoryService({withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return (sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('INJECTED_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService);
  await expect(broken.create(actor,{...input,name},randomUUID())).rejects.toThrow('INJECTED_AUDIT_FAILURE');
  await db.withActor(actor,async c=>expect((await c.query("SELECT count(*)::int n FROM properties WHERE name->>'ru'=$1",[name])).rows[0].n).toBe(0));
 });
 it('remains off by default and outside test rehearsal',async()=>{
  vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED','');await expect(service.create(actor,input,randomUUID())).rejects.toThrow('OWNER_INVENTORY_DISABLED');
  vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(service.list(actor)).rejects.toThrow('OWNER_INVENTORY_DISABLED');
 });
});
