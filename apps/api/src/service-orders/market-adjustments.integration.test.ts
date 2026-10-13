import {SupplyReadService} from '../supply/supply-read.service';
import {SupplyStocktakeService} from '../supply/supply-stocktake.service';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {MarketService,type MarketReceipt} from './market.service';
import {SupplyService} from '../supply/supply.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new MarketService(db,guest,staff),supply=new SupplyService(db);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76900000-0000-4000-8000-'+String(n).padStart(12,'0'),item=(n:number)=>'76910000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n),membershipId:id(n),requestId:randomUUID()});
const manager={organizationId:org,userId:'76800000-0000-4000-8000-000000000001',membershipId:'76800000-0000-4000-8000-000000000001',requestId:randomUUID()};
const run=(sql:string,args:unknown[]=[])=>db.withActor(manager,c=>c.query(sql,args));
const stock=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
let sequence=30;
async function fixture(product?:string,price='100'){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('market-'+randomUUID()+'@views.invalid','ru',net()),a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=product||item(++sequence);
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Market')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1::uuid,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,org,property,u,g]);
 if(!product)await run('UPDATE service_catalog SET active=true,price_minor=$2 WHERE id=$1',[s,price]);
 const revision=(await run('SELECT revision FROM service_catalog WHERE id=$1',[s])).rows[0].revision;
 const body={reservationId:r,lines:[{serviceId:s,quantity:2,expectedRevision:revision}],expectedTotalMinor:(BigInt(price)*2n).toString()};return {a,r,s,body};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_MARKET_PILOT_ENABLED:'true',VIEWS_SUPPLY_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
const command=(o:MarketReceipt,action:string,extra:Record<string,unknown>={})=>({action,expectedRevision:o.revision,...extra});
const act=(o:MarketReceipt,action:string,extra:Record<string,unknown>={})=>service.staffAct(actor(),'b1'.repeat(32),o.orderId,randomUUID(),command(o,action,extra));
const checklist={quantities:true,expiry:true,packaging:true};
const accountant={organizationId:org,userId:'76800000-0000-4000-8000-000000000004',membershipId:'76800000-0000-4000-8000-000000000004',requestId:randomUUID()};
async function completed(price='100'){
 const f=await fixture(undefined,price);let o=await service.request(f.a.token,randomUUID(),f.body);
 o=await act(o,'pick');o=await act(o,'ready',{checklist});o=await act(o,'handover');o=await service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'confirm_receipt'));return {f,o};
}
const credit=(o:MarketReceipt,amountMinor:string,key=randomUUID())=>service.credit(accountant,'a4'.repeat(32),o.orderId,key,{expectedRevision:o.revision,amountMinor,reason:'Guest adjustment'});
describe.sequential('V Market adjustments / real PostgreSQL',()=>{
 it('restocks an explicitly matched issued lot once without changing guest charges',async()=>{
  const f=await fixture();let o=await service.request(f.a.token,randomUUID(),f.body);o=await act(o,'pick');o=await act(o,'ready',{checklist});
  const b=(await stock('SELECT quantity::text,revision::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0];
  const snapshot=await new SupplyStocktakeService(db).confirm(actor(),randomUUID(),{propertyId:property,itemId:f.s,countedQuantity:b.quantity,expectedQuantity:b.quantity,expectedRevision:b.revision,reason:'Return provenance count',lots:[{lotCode:'RETURN-LOT',expiresOn:'2028-01-01',quantity:b.quantity}]});
  o=await act(o,'handover',{lotSelections:[{serviceId:f.s,lotAllocation:{snapshotId:snapshot.stocktakeId,lotCode:'RETURN-LOT',expiresOn:'2028-01-01'}}]});o=await service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'confirm_receipt'));
  const listed=(await service.staffList(actor(),'b1'.repeat(32),property)).items.find(x=>x.orderId===o.orderId);expect(listed?.issuedLots).toEqual([expect.objectContaining({serviceId:f.s,lotCode:'RETURN-LOT'})]);
  expect((await service.guestList(f.a.token,f.r)).items.find(x=>x.orderId===o.orderId)).not.toHaveProperty('issuedLots');
  o=await act(o,'receive_return',{serviceId:f.s,quantity:1,note:'Unopened return'});const rid=o.returns![0].id;
  const cmd=command(o,'restock_return',{returnId:rid,note:'Same label inspected',checklist:{sealed:true,expiry:true,quality:true},sameIssuedLot:true}),key=randomUUID();
  const both=await Promise.all([service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,cmd),service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,cmd)]);expect(both.filter(x=>!x.idempotentReplay)).toHaveLength(1);
  const movements=(await stock('SELECT m.return_source_issue_id,i.lot_allocation FROM supply_movements m JOIN supply_movements i ON i.id=m.return_source_issue_id WHERE m.market_return_id=$1',[rid])).rows;expect(movements).toHaveLength(1);expect(movements[0].lot_allocation.lotCode).toBe('RETURN-LOT');
  const history=await new SupplyReadService(db).list(actor(),'movements',property);expect(history.items.find(x=>x.returnLot?.sourceIssueId===movements[0].return_source_issue_id)).toMatchObject({kind:'return',lotTrackingStatus:'lot_returned',returnLot:{lotCode:'RETURN-LOT'}});
  expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('4');expect(both[0].totalMinor).toBe('200');
  const legacy=await completed();let old=await act(legacy.o,'receive_return',{serviceId:legacy.f.s,quantity:1,note:'Legacy return'});
  await expect(act(old,'restock_return',{returnId:old.returns![0].id,note:'No source lot',checklist:{sealed:true,expiry:true,quality:true},sameIssuedLot:true})).rejects.toThrow('SERVICE_RETURN_INVALID');
  expect((await stock('SELECT status FROM market_returns WHERE id=$1',[old.returns![0].id])).rows[0].status).toBe('quarantined');
 });
 it('records exact partial credits once, preserves stock and prevents over-crediting or reversal',async()=>{
  let {f,o}=await completed('9007199254740993');const key=randomUUID();
  const both=await Promise.all([credit(o,'9007199254740993',key),credit(o,'9007199254740993',key)]);expect(both.filter(x=>!x.idempotentReplay)).toHaveLength(1);o=both[0];
  expect(o).toMatchObject({creditedMinor:'9007199254740993'});
  await expect(credit(o,'9007199254740994')).rejects.toThrow('SERVICE_CREDIT_LIMIT');
  o=await credit(o,'9007199254740993');expect(o).toMatchObject({creditedMinor:'18014398509481986'});
  expect((await service.guestList(f.a.token,f.r)).items[0]).toMatchObject({creditedMinor:'18014398509481986',credits:expect.any(Array)});
  const entries=(await run('SELECT id,amount_minor::text,kind FROM folio_entries WHERE folio_id=(SELECT id FROM guest_folios WHERE reservation_id=$1)',[f.r])).rows;
  expect(entries.filter(e=>e.kind==='credit')).toHaveLength(2);expect(entries.reduce((a,e)=>a+BigInt(e.amount_minor),0n)).toBe(0n);
  expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('3');
  const original=entries.find(e=>e.kind==='service')!;
  await expect(run("INSERT INTO folio_entries(organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,reversal_of) SELECT organization_id,property_id,folio_id,currency,'reversal',-amount_minor,'{}','manual_reversal',gen_random_uuid(),'bad-reverse-credit',id FROM folio_entries WHERE id=$1",[original.id])).rejects.toMatchObject({code:'23514'});
 });
 it('denies warehouse credit, direct forged entries, credit before receipt and closed folios',async()=>{
  const f=await fixture(),early=await service.request(f.a.token,randomUUID(),f.body);
  await expect(credit(early,'10')).rejects.toThrow('SERVICE_CREDIT_NOT_ALLOWED');
  let {o}=await completed();await expect(service.credit(actor(),'b1'.repeat(32),o.orderId,randomUUID(),{expectedRevision:o.revision,amountMinor:'10',reason:'Not authorized'})).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.financeList(actor(),'b1'.repeat(32),property)).rejects.toThrow('SERVICE_FORBIDDEN');
  expect((await service.financeList(accountant,'a4'.repeat(32),property)).items).toEqual(expect.arrayContaining([expect.objectContaining({orderId:o.orderId})]));
  await expect(run("INSERT INTO folio_entries(organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,credit_of) SELECT organization_id,property_id,folio_id,currency,'credit',-10,'{}','market_credit',gen_random_uuid(),'forged-credit',id FROM folio_entries WHERE source_id=$1",[o.orderId])).rejects.toMatchObject({code:'23514'});
  await run("UPDATE guest_folios SET status='closed',closed_at=now() WHERE id=(SELECT folio_id FROM folio_entries WHERE source_id=$1)",[o.orderId]);
  await expect(credit(o,'10')).rejects.toThrow('FOLIO_NOT_OPEN');
 });
 it('quarantines returns, restocks inspected goods once and keeps credits separate',async()=>{
  let {f,o}=await completed();expect((await stock("SELECT j.status FROM supply_lot_movement_intake j JOIN supply_movements m ON m.id=j.movement_id WHERE m.item_id=$1 AND m.kind='issue'",[f.s])).rows).toEqual([{status:'allocation_pending'}]);const initial=o,key=randomUUID(),body=command(o,'receive_return',{serviceId:f.s,quantity:1,note:'Sealed item returned'});
  const results=await Promise.all([service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,body),service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,body)]);expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);o=results[0];const rid=o.returns![0].id;
  expect(o).toMatchObject({creditedMinor:'0',returns:[{status:'quarantined',quantity:1}]});expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('3');
  await expect(act(o,'restock_return',{returnId:rid,note:'Inspected',checklist:{sealed:false,expiry:true,quality:true}})).rejects.toThrow('SERVICE_INPUT_INVALID');
  const restockKey=randomUUID(),restockBody=command(o,'restock_return',{returnId:rid,note:'Sealed and expiry checked',checklist:{sealed:true,expiry:true,quality:true}});
  o=await service.staffAct(actor(),'b1'.repeat(32),o.orderId,restockKey,restockBody);expect((await service.staffAct(actor(),'b1'.repeat(32),o.orderId,restockKey,restockBody)).idempotentReplay).toBe(true);
  expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('4');
  expect((await stock("SELECT * FROM supply_movements WHERE market_return_id=$1",[rid])).rowCount).toBe(1);
  expect((await stock('SELECT j.status FROM supply_lot_movement_intake j JOIN supply_movements m ON m.id=j.movement_id WHERE m.market_return_id=$1',[rid])).rows).toEqual([{status:'allocation_pending'}]);
  await expect(act(o,'receive_return',{serviceId:f.s,quantity:2,note:'Too many units'})).rejects.toThrow('SERVICE_RETURN_LIMIT');
  o=await act(o,'receive_return',{serviceId:f.s,quantity:1,note:'Opened item returned'});const second=o.returns!.find(r=>r.status==='quarantined')!.id;
  o=await act(o,'discard_return',{returnId:second,note:'Opened packaging disposed'});expect(o.returns!.find(r=>r.id===second)!.status).toBe('discarded');
  await expect(act(o,'restock_return',{returnId:second,note:'Cannot restock discarded',checklist:{sealed:true,expiry:true,quality:true}})).rejects.toThrow('SERVICE_RETURN_INVALID');
  expect((await run('SELECT sum(amount_minor)::text amount FROM folio_entries WHERE folio_id=(SELECT id FROM guest_folios WHERE reservation_id=$1)',[f.r])).rows[0].amount).toBe(initial.totalMinor);
  o=await credit(o,'100');expect(o.creditedMinor).toBe('100');expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('4');
 });
 it('records server return times and preserves them on replay for guest and warehouse',async()=>{
  let {f,o}=await completed();
  o=await act(o,'receive_return',{serviceId:f.s,quantity:1,note:'Timeline receipt'});
  const rid=o.returns![0].id;
  expect(o.returns![0]).toMatchObject({receivedAt:expect.any(String),resolvedAt:null});
  const key=randomUUID(),body=command(o,'discard_return',{returnId:rid,note:'Damaged packaging'});
  o=await service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,body);
  const replay=await service.staffAct(actor(),'b1'.repeat(32),o.orderId,key,body);
  expect(replay.returns).toEqual(o.returns);
  const row=(await stock('SELECT created_at,resolved_at FROM market_returns WHERE id=$1',[rid])).rows[0];
  expect(row.resolved_at.getTime()).toBeGreaterThanOrEqual(row.created_at.getTime());
  const expected={id:rid,receivedAt:row.created_at.toISOString(),resolvedAt:row.resolved_at.toISOString()};
  for(const result of [await service.guestList(f.a.token,f.r),await service.staffList(actor(),'b1'.repeat(32),property)]){
   const order=result.items.find(x=>x.orderId===o.orderId)!;
   expect(order.returns).toEqual(expect.arrayContaining([expect.objectContaining({id:rid})]));
   const returned=order.returns!.find(x=>x.id===rid)! as unknown as {receivedAt:string;resolvedAt:string};
   expect(new Date(returned.receivedAt).toISOString()).toBe(expected.receivedAt);
   expect(new Date(returned.resolvedAt).toISOString()).toBe(expected.resolvedAt);
  }
 });
 it('requires warehouse authority and rejects returns before receipt or for another product',async()=>{
  const f=await fixture(),early=await service.request(f.a.token,randomUUID(),f.body);
  await expect(act(early,'receive_return',{serviceId:f.s,quantity:1,note:'Too early return'})).rejects.toThrow('SERVICE_RETURN_INVALID');
  const {o}=await completed();const body=command(o,'receive_return',{serviceId:f.s,quantity:1,note:'Wrong product'});
  await expect(service.staffAct(accountant,'a4'.repeat(32),o.orderId,randomUUID(),body)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(act(o,'receive_return',{serviceId:f.s,quantity:1,note:'Wrong product'})).rejects.toThrow('SERVICE_RETURN_INVALID');
  await expect(service.guestAct(f.a.token,o.orderId,randomUUID(),body)).rejects.toThrow('SERVICE_INPUT_INVALID');
 });
 it('serializes different credit commands on the same source',async()=>{
  const {o}=await completed();const results=await Promise.allSettled([credit(o,'120'),credit(o,'120')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await run('SELECT sum(amount_minor)::text amount FROM market_credits WHERE order_id=$1',[o.orderId])).rows[0].amount).toBe('120');
 });
});
