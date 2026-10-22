import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {HousekeepingService} from './housekeeping.service';
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const actor={organizationId:org,userId:'74900000-0000-4000-8000-000000000001',membershipId:'74900000-0000-4000-8000-000000000001',requestId:randomUUID()};
const other={...actor,userId:'74900000-0000-4000-8000-000000000002',membershipId:'74900000-0000-4000-8000-000000000002'};
const token='7'.repeat(64),otherToken='8'.repeat(64),unit=randomUUID(),type=randomUUID();
const db=new DatabaseService(),service=new HousekeepingService(db);
beforeAll(()=>db.withActor(actor,async c=>{
 await c.query('INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,$3,2)',[type,property,{en:'Synthetic cleaning'}]);
 await c.query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,'CLEAN-TEST')",[unit,property,type]);
}));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_HOUSEKEEPING_PILOT_ENABLED','true');vi.stubEnv('VIEWS_STAFF_AUTH_ORGANIZATION_ID',org);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
async function task(){const id=randomUUID();await db.withActor(actor,async c=>{
 await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot,quote_snapshot)
 VALUES($1,$2,$3,$4,$5,'checked_out','2025-01-01','2025-01-02','UZS','{}','{"localStayPilot":true}')`,[id,org,property,unit,'CLEAN-'+id]);
 await c.query('INSERT INTO local_stay_turnovers(reservation_id,organization_id,property_id,unit_id) VALUES($1,$2,$3,$4)',[id,org,property,unit]);
});return id;}
describe.sequential('housekeeping PostgreSQL task isolation',()=>{
 it('lists no guest data and completes only a self-claimed task with one receipt',async()=>{
  const id=await task();const list=await service.list(actor,token,property),row=list.items.find(x=>x.taskId===id);
  expect(Object.keys(row).sort()).toEqual(['assignment','createdAt','taskId','unitCode']);expect(row.assignment).toBe('available');
  await expect(service.act(actor,token,property,id,'complete',randomUUID())).rejects.toThrow('HOUSEKEEPING_NOT_ASSIGNED');
  await service.act(actor,token,property,id,'claim',randomUUID());
  expect((await service.list(actor,token,property)).items.find(x=>x.taskId===id).assignment).toBe('mine');
  await expect(service.act(other,otherToken,property,id,'complete',randomUUID())).rejects.toThrow('HOUSEKEEPING_NOT_ASSIGNED');
  const key=randomUUID(),r=await service.act(actor,token,property,id,'complete',key);
  expect(await service.act(actor,token,property,id,'complete',key)).toEqual({...r,idempotentReplay:true});
  await expect(service.act(actor,token,property,id,'release',key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  expect((await service.list(actor,token,property)).items.some(x=>x.taskId===id)).toBe(false);
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT status,completed_by FROM local_stay_turnovers WHERE reservation_id=$1',[id])).rows[0]).toEqual({status:'completed',completed_by:actor.userId});
   expect((await c.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND after_state->>'action'='complete'",[id])).rows[0].n).toBe(1);
  });
 });
 it('two cleaners cannot claim the same task and only the assignee can release it',async()=>{
  const id=await task(),claims=await Promise.allSettled([service.act(actor,token,property,id,'claim',randomUUID()),service.act(other,otherToken,property,id,'claim',randomUUID())]);
  expect(claims.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const first=claims[0].status==='fulfilled',winner=first?actor:other,winToken=first?token:otherToken;
  await expect(service.act(first?other:actor,first?otherToken:token,property,id,'release',randomUUID())).rejects.toThrow('HOUSEKEEPING_NOT_ASSIGNED');
  await service.act(winner,winToken,property,id,'release',randomUUID());
  expect((await service.list(actor,token,property)).items.find(x=>x.taskId===id).assignment).toBe('available');
 });
 it('rejects other sessions, foreign properties, forged actor, missing token and disabled mode',async()=>{
  for(const [a,t,p] of [[actor,otherToken,property],[{...actor,userId:other.userId},token,property],[actor,'',property],[actor,token,'50000000-0000-4000-8000-000000000001']] as const)
   await expect(service.list(a,t,p)).rejects.toThrow('HOUSEKEEPING_FORBIDDEN');
  const id=await task();await expect(service.act(actor,token,property,randomUUID(),'claim',randomUUID())).rejects.toThrow('HOUSEKEEPING_TASK_FORBIDDEN');
  vi.stubEnv('VIEWS_HOUSEKEEPING_PILOT_ENABLED','');await expect(service.act(actor,token,property,id,'claim',randomUUID())).rejects.toThrow('HOUSEKEEPING_DISABLED');
 });
 it('refuses occupied rooms and leaves assignment unchanged',async()=>{
  const id=await task(),occupied=randomUUID();
  await db.withActor(actor,c=>c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot)
   VALUES($1,$2,$3,$4,$5,'checked_in','2025-02-01','2025-02-02','UZS','{}')`,[occupied,org,property,unit,'OCCUPIED-'+occupied]));
  try{await expect(service.act(actor,token,property,id,'claim',randomUUID())).rejects.toThrow('HOUSEKEEPING_UNIT_OCCUPIED');}
  finally{await db.withActor(actor,c=>c.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[occupied]));}
  expect((await service.list(actor,token,property)).items.find(x=>x.taskId===id).assignment).toBe('available');
 });
 it('rolls back assignment and audit when outbox persistence fails',async()=>{
  const id=await task();
  const broken=new HousekeepingService({withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return (sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO outbox_events'))throw Error('INJECTED_OUTBOX_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService);
  await expect(broken.act(actor,token,property,id,'claim',randomUUID())).rejects.toThrow('INJECTED_OUTBOX_FAILURE');
  expect((await service.list(actor,token,property)).items.find(x=>x.taskId===id).assignment).toBe('available');
  await db.withActor(actor,async c=>expect((await c.query('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1',[id])).rows[0].n).toBe(0));
 });
 it('rejects a revoked session at the database boundary',async()=>{
  await db.query('SELECT app.staff_auth_logout($1,false)',[(await import('node:crypto')).createHash('sha256').update(otherToken).digest('hex')]);
  await expect(service.list(other,otherToken,property)).rejects.toThrow('HOUSEKEEPING_FORBIDDEN');
 });
});
