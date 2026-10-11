import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {OwnerRatesService} from './owner-rates.service';
import {QuoteService} from '../rates/quote.service';
import {BookingHoldService} from '../booking/booking-hold.service';
import type {RatesEdit} from './owner-rates.input';
const db=new DatabaseService(),rates=new OwnerRatesService(db);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000003',membershipId:'30000000-0000-4000-8000-000000000003',requestId:randomUUID()};
const property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
const from='2028-06-01',to='2028-06-10';
const rule={nightlyMinor:null,minStay:null,closed:false,closedToArrival:false,closedToDeparture:false};
async function fixture(){
 const unit=randomUUID(),rate=randomUUID(),policy=randomUUID();
 await db.withActor(actor,async c=>{
  await c.query(`INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)`,[unit,property,type,unit]);
  await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1,$2,$3,'{"en":"Synthetic rates"}','{"version":1,"rules":[{"minHoursBeforeCheckIn":0,"refundBps":10000}],"nonRefundableLineCodes":[]}')`,[policy,actor.organizationId,policy]);
  await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id) VALUES($1,$2,$3,'{"en":"Synthetic rates"}','UZS',100000,$4)`,[rate,property,type,policy]);
 });return {unit,rate};
}
async function edit(rate:string):Promise<RatesEdit>{const state=await rates.detail(actor,property,rate,from,to);return {...state,baseNightlyMinor:'200000',days:[],weekdays:[]} as RatesEdit;}
function body(v:RatesEdit):RatesEdit{return {revision:v.revision,from:v.from,to:v.to,baseNightlyMinor:v.baseNightlyMinor,days:v.days,weekdays:v.weekdays};}
const quoteInput=({unit,rate}:{unit:string;rate:string})=>({actor,propertyId:property,unitId:unit,ratePlanId:rate,checkInAt:'2028-06-01T14:00+05:00',checkOutAt:'2028-06-03T12:00+05:00',guests:[{age:30,residency:'resident' as const}]});
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_OWNER_RATES_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('B2 owner persisted prices',()=>{
 it('updates base/day/week prices and preserves existing quote and reservation snapshots',async()=>{
  const f=await fixture(),old=await new QuoteService(db).createQuote(quoteInput(f)),input=body(await edit(f.rate));
  input.days=[{...rule,stayDate:from,nightlyMinor:'300000'}];
  input.weekdays=[{...rule,isoWeekday:5,priceDeltaBps:1000}];
  await rates.update(actor,property,f.rate,input,randomUUID());
  const next=await new QuoteService(db).createQuote(quoteInput(f));
  expect(old.accommodationMinor).toBe(200000n);expect(next.accommodationMinor).toBe(520000n);
  const hold=await new BookingHoldService(db).createHold({actor:{...actor,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001'},quoteId:old.quoteId,idempotencyKey:randomUUID(),ttlSeconds:300});
  expect(hold.totalMinor).toBe(old.totalMinor);
  await db.withActor(actor,async c=>expect((await c.query('SELECT accommodation_minor::text amount FROM reservations WHERE id=$1',[hold.reservationId])).rows[0].amount).toBe('200000'));
 });
 it('rejects overcapacity and forged actor context before pricing or replaying holds',async()=>{
  const f=await fixture(),input=quoteInput(f),quotes=new QuoteService(db);
  await expect(quotes.createQuote({...input,guests:Array.from({length:3},()=>({age:30,residency:'resident' as const}))})).rejects.toThrow('INVALID_GUEST_COUNT');
  await expect(quotes.createQuote({...input,actor:{...actor,userId:'20000000-0000-4000-8000-000000000002'}})).rejects.toThrow('PROPERTY_FORBIDDEN');
  const q=await quotes.createQuote(input),holds=new BookingHoldService(db),key=randomUUID();
  const manager={...actor,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001'};
  await holds.createHold({actor:manager,quoteId:q.quoteId,idempotencyKey:key,ttlSeconds:300});
  await expect(holds.createHold({actor,quoteId:q.quoteId,idempotencyKey:key,ttlSeconds:300})).rejects.toThrow('PROPERTY_FORBIDDEN');
 });
 it('replays a lost response, rejects changed payload and serializes conflicting revisions',async()=>{
  const {rate}=await fixture(),input=body(await edit(rate)),key=randomUUID();
  const race=await Promise.all(Array.from({length:3},()=>rates.update(actor,property,rate,input,key)));
  expect(race.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  await expect(rates.update(actor,property,rate,{...input,baseNightlyMinor:'1'},key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await expect(rates.update(actor,property,rate,input,randomUUID())).rejects.toThrow('RATE_REVISION_CONFLICT');
  const current=body(await edit(rate));
  const competing=await Promise.allSettled(['300000','400000'].map(baseNightlyMinor=>rates.update(actor,property,rate,{...current,baseNightlyMinor},randomUUID())));
  expect(competing.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((competing.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('RATE_REVISION_CONFLICT');
 });
 it('removes only day overrides within the supplied window',async()=>{
  const {rate}=await fixture();
  await db.withActor(actor,c=>c.query("INSERT INTO rate_day_overrides(rate_plan_id,stay_date,nightly_minor) VALUES($1,'2028-06-01',300000),($1,'2028-07-01',400000)",[rate]));
  await rates.update(actor,property,rate,body(await edit(rate)),randomUUID());
  await db.withActor(actor,async c=>expect((await c.query('SELECT stay_date::text AS day FROM rate_day_overrides WHERE rate_plan_id=$1',[rate])).rows).toEqual([{day:'2028-07-01'}]));
 });
 it('enforces persisted closures, minimum nights and departure restrictions',async()=>{
  const f=await fixture();
  for(const [change,error] of [[{closed:true},'DATE_CLOSED'],[{closedToArrival:true},'CLOSED_TO_ARRIVAL'],[{minStay:3},'MIN_STAY_NOT_MET']] as const){
   const input=body(await edit(f.rate));input.days=[{...rule,stayDate:from,...change}];
   await rates.update(actor,property,f.rate,input,randomUUID());
   await expect(new QuoteService(db).createQuote(quoteInput(f))).rejects.toThrow(error);
  }
  const input=body(await edit(f.rate));input.days=[{...rule,stayDate:'2028-06-03',closedToDeparture:true}];
  await rates.update(actor,property,f.rate,input,randomUUID());
  await expect(new QuoteService(db).createQuote(quoteInput(f))).rejects.toThrow('CLOSED_TO_DEPARTURE');
 });
 it('denies foreign rates, wrong actors and feature activation by default',async()=>{
  const {rate}=await fixture(),frontdesk={...actor,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
  await expect(rates.detail(frontdesk,property,rate,from,to)).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
  await expect(rates.detail({...actor,userId:frontdesk.userId},property,rate,from,to)).rejects.toThrow('OWNER_INVENTORY_FORBIDDEN');
  await expect(rates.detail(actor,property,randomUUID(),from,to)).rejects.toThrow('RATE_NOT_FOUND');
  vi.stubEnv('VIEWS_OWNER_RATES_ENABLED','');await expect(rates.list(actor,property)).rejects.toThrow('OWNER_RATES_DISABLED');
 });
 it('rolls back prices and audit if the outbox insert fails',async()=>{
  const {rate}=await fixture(),before=await rates.detail(actor,property,rate,from,to);
  const broken=new OwnerRatesService({withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return (sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO outbox_events'))throw Error('INJECTED_OUTBOX_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService);
  await expect(broken.update(actor,property,rate,body(await edit(rate)),randomUUID())).rejects.toThrow('INJECTED_OUTBOX_FAILURE');
  expect(await rates.detail(actor,property,rate,from,to)).toEqual(before);
  await db.withActor(actor,async c=>expect((await c.query('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1',[rate])).rows[0].n).toBe(0));
 });
 it('holds a consistent price generation while an editor waits for the quote transaction',async()=>{
  const f=await fixture(),input=body(await edit(f.rate));input.days=[{...rule,stayDate:from,nightlyMinor:'300000'}];
  let release!:()=>void,reached!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),read=new Promise<void>(resolve=>{reached=resolve;});
  const pausedDb={withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return async(sql:string,args:unknown[])=>{const result=await target.query(sql,args);if(sql.includes('FOR SHARE OF rp')){reached();await gate;}return result;};return Reflect.get(target,key);}})))} as DatabaseService;
  const quoting=new QuoteService(pausedDb).createQuote(quoteInput(f));await read;
  const updating=rates.update(actor,property,f.rate,input,randomUUID());
  try{
   let blocked=false;
   for(let i=0;i<100;i++){
    const rows=await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM rate_plans%'");
    if(rows.rowCount){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(blocked).toBe(true);
  }finally{release();}
  const [old]=await Promise.all([quoting,updating]);expect(old.accommodationMinor).toBe(200000n);
  expect((await new QuoteService(db).createQuote(quoteInput(f))).accommodationMinor).toBe(500000n);
 });
});
