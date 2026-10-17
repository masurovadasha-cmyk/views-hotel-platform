import {afterAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {RefundReconciliationService} from './refund-reconciliation.service';
const db=new DatabaseService(),service=new RefundReconciliationService(db);
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
const manager={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const accountant={...manager,userId:'b1000000-0000-4000-8000-000000000001',membershipId:'b1000000-0000-4000-8000-000000000002'};
const frontdesk={...manager,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
async function fixture(status='uncertain',count=1){
 const reservation=randomUUID(),quote=randomUUID(),intent=randomUUID();
 return db.withOrganization(org,async c=>{
  await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,'00000000-0000-0000-0000-000000000004',$1::uuid::text,'cancelled','2031-12-01','2031-12-02','UZS','{}')`,[reservation,org,property]);
  await c.query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at) VALUES($1,$2,$3,'00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000008','2031-12-01','2031-12-02','{}','UZS',9007199254740993,9007199254740993,'{}','{}','synthetic-reconciliation',now()+interval '5 minutes')`,[quote,org,property]);
  await c.query(`INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,amount_minor,currency,idempotency_key) VALUES($1,$2,$3,$4,'payme',9007199254740993,'UZS',$1::uuid::text)`,[intent,org,reservation,quote]);
  return (await c.query<{id:string}>(`INSERT INTO payment_refund_requests(organization_id,payment_intent_id,provider,amount_minor,currency,reason,idempotency_key,external_capture_id,status,last_error)
   SELECT $1,$2,'payme',9007199254740993,'UZS','synthetic',gen_random_uuid()::text,gen_random_uuid()::text,$3,'PRIVATE_PROVIDER_MESSAGE' FROM generate_series(1,$4) RETURNING id`,[org,intent,status,count])).rows.map(r=>r.id);
 });
}
async function body(id:string){return {expectedRevision:(await service.detail(accountant,id)).revision,action:'provider_contacted',caseReference:'SYNTHETIC-TICKET-1'};}
afterAll(()=>db.onModuleDestroy());
describe.sequential('B3 refund review registry on restricted PostgreSQL role',()=>{
 it('returns exact money and bounded pages with filter-bound cursors, without raw provider errors',async()=>{
  const ids=await fixture('blocked',53),seen=new Set<string>();let cursor:string|undefined;
  do{
   const result=await service.list(accountant,{propertyId:property,status:'blocked',cursor});
   expect(result.items.length).toBeLessThanOrEqual(50);
   for(const item of result.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);if(ids.includes(item.id)){expect(item.amountMinor).toBe('9007199254740993');expect(item.diagnostic).toBeNull();expect(item).not.toHaveProperty('lastError');}}
   if(result.nextCursor)await expect(service.list(accountant,{propertyId:property,status:'uncertain',cursor:result.nextCursor})).rejects.toThrow('INVALID_REFUND_CURSOR');
   cursor=result.nextCursor??undefined;
  }while(cursor);
  expect(ids.every(id=>seen.has(id))).toBe(true);
 });
 it('checks bound identities and property permissions before list, detail and replay',async()=>{
  const [id]=await fixture(),input=await body(id),key=randomUUID();await service.review(accountant,id,key,input);
  for(const actor of [frontdesk,{...accountant,userId:manager.userId},{...accountant,organizationId:'10000000-0000-4000-8000-000000000001'}]){
   await expect(service.list(actor,{propertyId:property})).rejects.toThrow('PROPERTY_FORBIDDEN');
   await expect(service.detail(actor,id)).rejects.toThrow('REFUND_REQUEST_NOT_FOUND');
   await expect(service.review(actor,id,key,input)).rejects.toThrow('REFUND_REQUEST_NOT_FOUND');
  }
  await expect(service.list(accountant,{propertyId:'50000000-0000-4000-8000-000000000001'})).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect((await service.detail(manager,id)).id).toBe(id);
  await expect(service.review(manager,id,key,input)).rejects.toThrow('PROPERTY_FORBIDDEN');
 });
 it('serializes review replays and writes one immutable review, audit and event without changing the refund',async()=>{
  const [id]=await fixture(),input=await body(id),key=randomUUID();
  const result=await Promise.all(Array.from({length:4},()=>service.review(accountant,id,key,input)));
  expect(new Set(result.map(r=>r.reviewId)).size).toBe(1);expect(result.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  const detail=await service.detail(accountant,id);expect(detail.status).toBe('uncertain');expect(detail.revision).toBe(input.expectedRevision);expect(detail.reviews).toHaveLength(1);
  await db.withActor(accountant,async c=>{
   expect((await c.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='payment.refund_reviewed'",[id])).rows[0].n).toBe(1);
   expect((await c.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='payment.refund_reviewed'",[id])).rows[0].n).toBe(1);
   expect((await c.query("UPDATE payment_refund_reviews SET action='investigating' WHERE refund_request_id=$1",[id])).rowCount).toBe(0);
   expect((await c.query('DELETE FROM payment_refund_reviews WHERE refund_request_id=$1',[id])).rowCount).toBe(0);
  });
  await expect(service.review(accountant,id,key,{...input,action:'investigating'})).rejects.toThrow('REFUND_REVIEW_IDEMPOTENCY_CONFLICT');
 });
 it('rejects stale state after a callback and accepts an exact retry of a previously saved review',async()=>{
  const [id]=await fixture(),input=await body(id),key=randomUUID(),saved=await service.review(accountant,id,key,input);
  await db.withOrganization(org,c=>c.query("UPDATE payment_refund_requests SET status='completed',completed_at=now() WHERE id=$1",[id]));
  await expect(service.review(accountant,id,randomUUID(),input)).rejects.toThrow('REFUND_REVIEW_STALE');
  expect(await service.review(accountant,id,key,input)).toEqual({...saved,idempotentReplay:true});
 });
 it('enforces RLS and source/actor binding even for direct SQL inserts',async()=>{
  const [id]=await fixture();
  const insert=(a:typeof manager,p=property,user=a.userId,status='uncertain')=>db.withActor(a,c=>c.query(`INSERT INTO payment_refund_reviews(organization_id,property_id,refund_request_id,actor_user_id,actor_membership_id,idempotency_key,expected_revision,observed_status,action,case_reference)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'investigating','SYNTHETIC')`,[org,p,id,user,a.membershipId,randomUUID(),'a'.repeat(64),status]));
  await expect(insert(frontdesk)).rejects.toMatchObject({code:'42501'});
  await expect(insert(accountant,property,manager.userId)).rejects.toMatchObject({code:'42501'});
  await expect(insert(accountant,'50000000-0000-4000-8000-000000000001')).rejects.toThrow('REFUND_REVIEW_SOURCE_MISMATCH');
  await expect(insert(accountant,property,accountant.userId,'completed')).rejects.toThrow('REFUND_REVIEW_SOURCE_MISMATCH');
  const row=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='payment_refund_reviews'")).rows[0];expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 });
 it('rolls back a review if its audit cannot be persisted',async()=>{
  const [id]=await fixture(),input=await body(id);
  const broken={withActor:(a:typeof accountant,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('SYNTHETIC_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService;
  await expect(new RefundReconciliationService(broken).review(accountant,id,randomUUID(),input)).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');
  expect((await service.detail(accountant,id)).reviews).toHaveLength(0);
 });
 it('rejects manual settlement/resend commands and unbounded input',async()=>{
  const [id]=await fixture(),input=await body(id);
  for(const change of [{action:'completed'},{action:'resend'},{caseReference:'x'.repeat(101)},{status:'completed'},{expectedRevision:'bad'}])await expect(service.review(accountant,id,randomUUID(),{...input,...change})).rejects.toThrow('INVALID_REFUND_REVIEW');
  await expect(service.list(accountant,{propertyId:property,status:'all'})).rejects.toThrow('INVALID_REFUND_STATUS');
 });
});
