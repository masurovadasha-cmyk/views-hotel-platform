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
let sequence=0;
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
describe.sequential('V Market / real PostgreSQL',()=>{
 it('reserves exact prices, issues stock once and charges only on guest receipt',async()=>{
  const f=await fixture(undefined,'9007199254740993'),key=randomUUID();
  let o=await service.request(f.a.token,key,f.body);expect((await service.request(f.a.token,key,f.body)).idempotentReplay).toBe(true);
  expect(o.totalMinor).toBe('18014398509481986');expect((await service.catalog(f.a.token,f.r)).items.find(i=>i.id===f.s)).toMatchObject({availableQuantity:'3'});
  await expect(supply.issue(actor(),randomUUID(),{propertyId:property,itemId:f.s,quantity:'4',reference:'Cannot use reserves'})).rejects.toThrow('SERVICE_STOCK_RESERVED');
  expect((await new SupplyReadService(db).list(actor(),'stock',property)).items.find(i=>i.itemId===f.s)).toMatchObject({quantity:'5',reservedQuantity:'2',availableQuantity:'3'});
  await expect(new SupplyStocktakeService(db).confirm(actor(),randomUUID(),{propertyId:property,itemId:f.s,expectedQuantity:'5',expectedRevision:'0',countedQuantity:'1',reason:'Below reserve'})).rejects.toThrow('SERVICE_STOCK_RESERVED');
  expect((await stock('SELECT * FROM supply_stocktakes WHERE item_id=$1',[f.s])).rowCount).toBe(0);
  await expect(run("UPDATE service_orders SET status='completed' WHERE id=$1",[o.orderId])).rejects.toMatchObject({code:'23514'});
  o=await act(o,'pick');await expect(act(o,'ready',{checklist:{...checklist,expiry:false}})).rejects.toThrow('SERVICE_INPUT_INVALID');o=await act(o,'ready',{checklist});
  const handKey=randomUUID(),handBody=command(o,'handover');const handed=await Promise.all([service.staffAct(actor(),'b1'.repeat(32),o.orderId,handKey,handBody),service.staffAct(actor(),'b1'.repeat(32),o.orderId,handKey,handBody)]);expect(handed.filter(r=>!r.idempotentReplay)).toHaveLength(1);o=handed[0];
  expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('3');expect((await stock("SELECT * FROM supply_movements WHERE item_id=$1 AND kind='issue'",[f.s])).rowCount).toBe(1);
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
  const receiptKey=randomUUID(),body=command(o,'confirm_receipt');await service.guestAct(f.a.token,o.orderId,receiptKey,body);expect((await service.guestAct(f.a.token,o.orderId,receiptKey,body)).idempotentReplay).toBe(true);
  expect((await run('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[o.orderId])).rows).toEqual([{amount_minor:'18014398509481986'}]);
 });
 it('serializes competing guests for the last stock and releases cancellation reserves',async()=>{
  const a=await fixture(),b=await fixture(a.s);const body=(f:typeof a)=>({...f.body,lines:[{...f.body.lines[0],quantity:4}],expectedTotalMinor:'400'});
  const outcomes=await Promise.allSettled([service.request(a.a.token,randomUUID(),body(a)),service.request(b.a.token,randomUUID(),body(b))]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='rejected')).toMatchObject({reason:{message:'SERVICE_STOCK_UNAVAILABLE'}});
  const n=outcomes[0].status==='fulfilled'?0:1,f=n===0?a:b,o=(outcomes[n] as PromiseFulfilledResult<MarketReceipt>).value;
  await service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'cancel'));
  expect((await service.catalog(a.a.token,a.r)).items.find(i=>i.id===a.s)).toMatchObject({availableQuantity:'5'});
  expect((await stock('SELECT * FROM supply_movements WHERE item_id=$1',[a.s])).rowCount).toBe(0);
 });
 it('rejects stale prices, cross-guest access, buyer execution and direct table writes',async()=>{
  const f=await fixture(),other=await fixture();await expect(service.request(f.a.token,randomUUID(),{...f.body,expectedTotalMinor:'1'})).rejects.toThrow('SERVICE_PRICE_CHANGED');
  await expect(service.request(f.a.token,randomUUID(),{...f.body,lines:[f.body.lines[0],f.body.lines[0]]})).rejects.toThrow('SERVICE_INPUT_INVALID');
  const o=await service.request(f.a.token,randomUUID(),f.body);
  await expect(service.guestList(other.a.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');await expect(service.guestAct(other.a.token,o.orderId,randomUUID(),command(o,'cancel'))).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(service.staffAct(actor(2),'b2'.repeat(32),o.orderId,randomUUID(),command(o,'pick'))).rejects.toThrow('SERVICE_FORBIDDEN');
  expect((await stock("UPDATE market_orders SET stage='cancelled' WHERE order_id=$1",[o.orderId])).rowCount).toBe(0);
  await guest.logout(f.a.token);await expect(service.request(f.a.token,randomUUID(),f.body)).rejects.toThrow();
 });
 it('rolls back a whole multi-item cart if one item is unavailable',async()=>{
  const f=await fixture(),g=await fixture();const lines=[f.body.lines[0],{...g.body.lines[0],quantity:6}];
  await expect(service.request(f.a.token,randomUUID(),{...f.body,lines,expectedTotalMinor:'800'})).rejects.toThrow('SERVICE_STOCK_UNAVAILABLE');
  expect((await service.catalog(f.a.token,f.r)).items.find(i=>i.id===f.s)).toMatchObject({availableQuantity:'5'});expect((await service.guestList(f.a.token,f.r)).items).toHaveLength(0);
 });
 it('serializes a guest reservation against an ordinary warehouse issue',async()=>{
  const f=await fixture(),body={...f.body,lines:[{...f.body.lines[0],quantity:4}],expectedTotalMinor:'400'};
  const outcomes=await Promise.allSettled([service.request(f.a.token,randomUUID(),body),supply.issue(actor(),randomUUID(),{propertyId:property,itemId:f.s,quantity:'4',reference:'Concurrent physical issue'})]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const available=(await service.catalog(f.a.token,f.r)).items.find(i=>i.id===f.s);expect(available).toMatchObject({availableQuantity:'1'});
 });
 it('serializes cancellation with picking and rejects changed catalogue revisions',async()=>{
  const f=await fixture();await run('UPDATE service_catalog SET price_minor=200 WHERE id=$1',[f.s]);
  await expect(service.request(f.a.token,randomUUID(),f.body)).rejects.toThrow('SERVICE_PRICE_CHANGED');
  const next={...f.body,lines:[{...f.body.lines[0],expectedRevision:f.body.lines[0].expectedRevision+1}],expectedTotalMinor:'400'};
  const o=await service.request(f.a.token,randomUUID(),next);
  const outcomes=await Promise.allSettled([act(o,'pick'),service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'cancel'))]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
 });
 it('tracks missing goods without charging or restocking; authenticates and replays issue commands',async()=>{
  const f=await fixture(),other=await fixture();let o=await service.request(f.a.token,randomUUID(),f.body);
  await expect(service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'report_issue',{note:'Missing water'}))).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  o=await act(o,'pick');o=await act(o,'ready',{checklist});o=await act(o,'handover');
  const key=randomUUID(),body=command(o,'report_issue',{note:'Missing water'});
  await expect(service.guestAct(other.a.token,o.orderId,key,body)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  const results=await Promise.all([service.guestAct(f.a.token,o.orderId,key,body),service.guestAct(f.a.token,o.orderId,key,body)]);
  expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);o=results[0];expect(o).toMatchObject({issue:{status:'open',note:'Missing water'}});
  await expect(service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'confirm_receipt'))).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  await expect(service.staffAct(actor(2),'b2'.repeat(32),o.orderId,randomUUID(),command(o,'answer_issue',{note:'Checked'}))).rejects.toThrow('SERVICE_FORBIDDEN');
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
  expect((await stock('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.s])).rows[0].quantity).toBe('3');
  o=await act(o,'answer_issue',{note:'Please collect the missing water at reception'});
  expect(o).toMatchObject({issue:{status:'answered',answer:'Please collect the missing water at reception'}});
  expect((await service.guestList(f.a.token,f.r)).items[0]).toMatchObject({issue:{status:'answered'}});
  const receiptKey=randomUUID(),receipt=command(o,'confirm_receipt');o=await service.guestAct(f.a.token,o.orderId,receiptKey,receipt);
  expect((await service.guestAct(f.a.token,o.orderId,receiptKey,receipt)).idempotentReplay).toBe(true);
  o=await service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'report_issue',{note:'Package was damaged'}));
  expect(o).toMatchObject({stage:'completed',issue:{status:'open'}});
  expect((await run('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[o.orderId])).rows).toEqual([{amount_minor:'200'}]);
 });
 it('is disabled by default and forbids receipt before handover',async()=>{
  const f=await fixture(),o=await service.request(f.a.token,randomUUID(),f.body);await expect(service.guestAct(f.a.token,o.orderId,randomUUID(),command(o,'confirm_receipt'))).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false');await expect(service.catalog(f.a.token,f.r)).rejects.toThrow('SERVICE_MARKET_DISABLED');
 });
});
