import {afterAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
const db=new DatabaseService();
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
const manager={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const frontdesk={...manager,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
const accountant={...manager,userId:'b1000000-0000-4000-8000-000000000001',membershipId:'b1000000-0000-4000-8000-000000000002'};
const foreign={...manager,organizationId:'10000000-0000-4000-8000-000000000001',membershipId:'73100000-0000-4000-8000-000000000001'};
async function stay(checkedOut=true){
 const reservation=randomUUID(),guest=randomUUID();
 await db.withActor(manager,async c=>{
  await c.query(`INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Registry')`,[guest,org]);
  await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot)
   VALUES($1,$2,$3,'00000000-0000-0000-0000-000000000004',$4,$1::uuid::text,$5,now()-interval '2 days',now()-interval '1 day','UZS','{}')`,[reservation,org,property,guest,checkedOut?'checked_out':'confirmed']);
 });return {reservation,guest};
}
async function folio(){const {reservation}=await stay();return db.withActor(manager,async c=>(await c.query(`INSERT INTO guest_folios(organization_id,property_id,reservation_id,currency) VALUES($1,$2,$3,'UZS') RETURNING id`,[org,property,reservation])).rows[0].id as string);}
async function entry(folioId:string,kind='service',amount='100',reversal:string|null=null){
 return db.withActor(frontdesk,async c=>(await c.query(`INSERT INTO folio_entries(organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,reversal_of)
 VALUES($1,$2,$3,'UZS',$4,$5,'{"en":"Synthetic"}','test',$6,$7,$8) RETURNING id`,[org,property,folioId,kind,amount,randomUUID(),randomUUID(),reversal])).rows[0].id as string);
}
afterAll(()=>db.onModuleDestroy());
describe.sequential('B1 registries on restricted PostgreSQL role',()=>{
 it('creates an exact bigint folio, reverses once, refuses invalid reversals and closed charges',async()=>{
  const f=await folio(),e=await entry(f,'service','9007199254740993');
  await expect(entry(f,'reversal','-1',e)).rejects.toMatchObject({code:'23514'});
  await entry(f,'reversal','-9007199254740993',e);
  await expect(entry(f,'reversal','-9007199254740993',e)).rejects.toMatchObject({code:'23505'});
  await db.withActor(manager,async c=>{
   expect((await c.query('SELECT sum(amount_minor)::text balance FROM folio_entries WHERE folio_id=$1',[f])).rows[0].balance).toBe('0');
   expect((await c.query('DELETE FROM folio_entries WHERE id=$1',[e])).rowCount).toBe(0);
   await c.query("UPDATE guest_folios SET status='closed',closed_at=now() WHERE id=$1",[f]);
  });
  await expect(entry(f)).rejects.toMatchObject({code:'23514'});
  await expect(db.withActor(manager,c=>c.query("UPDATE guest_folios SET status='open',closed_at=NULL WHERE id=$1",[f]))).rejects.toMatchObject({code:'23514'});
 });
 it('enforces tenant references, currency, actor identity, property scopes and forced RLS',async()=>{
  const f=await folio(),{reservation}=await stay();
  await expect(db.withActor(manager,c=>c.query(`INSERT INTO guest_folios(organization_id,property_id,reservation_id,currency) VALUES($1,$2,$3,'USD')`,[org,property,reservation]))).rejects.toMatchObject({code:'23503'});
  for(const actor of [foreign,{...manager,userId:frontdesk.userId},{...manager,membershipId:randomUUID()}]){
   await db.withActor(actor,async c=>expect((await c.query('SELECT id FROM guest_folios WHERE id=$1',[f])).rowCount).toBe(0));
  }
  await db.withActor(frontdesk,async c=>expect((await c.query("SELECT app.registry_access($1,'50000000-0000-4000-8000-000000000001','reservation.read') ok",[org])).rows[0].ok).toBe(false));
  const tables=['guest_folios','folio_entries','service_catalog','service_orders','promotion_codes','promotion_redemptions','loyalty_tiers','loyalty_stay_credits','host_payout_drafts','reservation_disputes','dispute_events','stay_reviews'];
  const rows=(await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1::text[])',[tables])).rows;
  expect(rows).toHaveLength(tables.length);expect(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
 });
 it('keeps financial dispute writes restricted to the existing scoped accountant',async()=>{
  const {reservation}=await stay();
  const insert=(actor:typeof manager)=>db.withActor(actor,c=>c.query(`INSERT INTO reservation_disputes(organization_id,property_id,reservation_id,currency,claimed_minor,reason_code,idempotency_key) VALUES($1,$2,$3,'UZS',100,'synthetic',$4) RETURNING id`,[org,property,reservation,randomUUID()]));
  await expect(insert(manager)).rejects.toMatchObject({code:'42501'});
  await expect(insert(frontdesk)).rejects.toMatchObject({code:'42501'});
  const id=(await insert(accountant)).rows[0].id;
  await db.withActor(frontdesk,async c=>expect((await c.query('SELECT id FROM reservation_disputes WHERE id=$1',[id])).rowCount).toBe(0));
  await db.withActor(accountant,async c=>expect((await c.query('SELECT id FROM reservation_disputes WHERE id=$1',[id])).rowCount).toBe(1));
 });
 it('serializes competing promotion redemptions and rejects a spent campaign',async()=>{
  const promo=randomUUID(),stays=await Promise.all([stay(),stay()]);
  await db.withActor(manager,c=>c.query(`INSERT INTO promotion_codes(id,organization_id,code,name,discount_bps,valid_from,valid_until,max_redemptions,active) VALUES($1,$2,$3,'{"en":"Synthetic race"}',1000,now()-interval '1 day',now()+interval '1 day',1,true)`,[promo,org,promo.toUpperCase()]));
  const redeem=({reservation,guest}:{reservation:string;guest:string})=>db.withActor(frontdesk,c=>c.query(`INSERT INTO promotion_redemptions(organization_id,property_id,promotion_id,reservation_id,guest_profile_id,currency,discount_minor,snapshot) VALUES($1,$2,$3,$4,$5,'UZS',100,'{}')`,[org,property,promo,reservation,guest]));
  const race=await Promise.allSettled(stays.map(redeem));expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('PROMOTION_LIMIT');
  await expect(redeem(await stay())).rejects.toThrow('PROMOTION_LIMIT');
 });
 it('credits only completed stays belonging to the guest, once',async()=>{
  const a=await stay(),b=await stay(false);
  const credit=({reservation,guest}:{reservation:string;guest:string})=>db.withActor(frontdesk,c=>c.query(`INSERT INTO loyalty_stay_credits(organization_id,property_id,reservation_id,guest_profile_id,currency) VALUES($1,$2,$3,$4,'UZS')`,[org,property,reservation,guest]));
  await credit(a);await expect(credit(a)).rejects.toMatchObject({code:'23505'});
  await expect(credit(b)).rejects.toThrow('LOYALTY_STAY_INELIGIBLE');
  await expect(credit({...b,guest:a.guest})).rejects.toThrow('LOYALTY_STAY_INELIGIBLE');
 });
 it('preserves service order price snapshots and supports standalone orders',async()=>{
  const {guest}=await stay(),service=randomUUID();
  await db.withActor(manager,c=>c.query(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor) VALUES($1,$2,$3,$1::uuid::text,'{"en":"Synthetic"}','UZS',100)`,[service,org,property]));
  const order=await db.withActor(frontdesk,async c=>(await c.query(`INSERT INTO service_orders(organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$4,'UZS',1,100,10,now(),'{}',$5) RETURNING id`,[org,property,service,guest,randomUUID()])).rows[0].id);
  await expect(db.withActor(frontdesk,c=>c.query('UPDATE service_orders SET total_minor=200 WHERE id=$1',[order]))).rejects.toThrow('SERVICE_ORDER_TRANSITION_INVALID');
  await db.withActor(frontdesk,c=>c.query("UPDATE service_orders SET status='accepted' WHERE id=$1",[order]));
  await expect(db.withActor(frontdesk,c=>c.query("UPDATE service_orders SET status='completed' WHERE id=$1",[order]))).rejects.toThrow('SERVICE_ORDER_TRANSITION_INVALID');
 });
 it('does not expose a review submission or payout execution path',async()=>{
  const {reservation}=await stay();
  await expect(db.withActor(manager,c=>c.query(`INSERT INTO stay_reviews(organization_id,property_id,reservation_id,currency,author_side,overall_rating,body,publish_after) VALUES($1,$2,$3,'UZS','guest',5,'Synthetic',now())`,[org,property,reservation]))).rejects.toMatchObject({code:'42501'});
  expect((await db.query("SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='host_payout_drafts'::regclass AND contype='c'")).rows.some(r=>r.def.includes('draft')&&r.def.includes('cancelled')&&!r.def.includes('paid'))).toBe(true);
 });
});
