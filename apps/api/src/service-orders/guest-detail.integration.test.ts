import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {ServiceOrderService} from './service-order.service';
import {LaundryService} from './laundry.service';
import {MarketService} from './market.service';
import {ConciergeService} from './concierge.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db);
const services={cleaning:new ServiceOrderService(db,guest,staff),laundry:new LaundryService(db,guest,staff),market:new MarketService(db,guest,staff),concierge:new ConciergeService(db,guest,staff)};
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',manager='76800000-0000-4000-8000-000000000001';
const run=(sql:string,args:unknown[]=[],foreign=false)=>db.withActor(foreign?{organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()}:{organizationId:org,userId:manager,membershipId:manager,requestId:randomUUID()},c=>c.query(sql,args));
const detail=async(token:string,r:string,kind:string,target:string)=>(await db.query('SELECT app.guest_service_detail($1,$2,$3,$4) value',[createHash('sha256').update(token).digest('hex'),r,kind,target])).rows[0].value;
let marketSequence=60;
async function fixture(foreign=false){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('detail-'+randomUUID()+'@views.invalid','ru',net()),a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),organization=foreign?'00000000-0000-0000-0000-000000000001':org,p=foreign?'00000000-0000-0000-0000-000000000002':property;
 const q=(sql:string,args:unknown[]=[])=>run(sql,args,foreign);
 await q("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Detail')",[g,a.userId,organization]);
 await q("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,p]);await q('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,p,type]);
 await q("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,organization,p,u,g]);
 const ids:Record<string,string>={},when=new Date(Date.now()+86400000).toISOString();
 for(const kind of ['cleaning','laundry','concierge','market'] as const){
  if(foreign&&kind!=='cleaning')continue;const s=kind==='market'?'76910000-0000-4000-8000-'+String(++marketSequence).padStart(12,'0'):randomUUID();
  if(kind!=='market')await q("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{\"en\":\"Synthetic detail\"}','UZS',$4,true,$5,40)",[s,organization,p,kind==='concierge'?0:100,kind]);
  if(kind==='market')await q('UPDATE service_catalog SET active=true WHERE id=$1',[s]);const revision=(await q('SELECT revision FROM service_catalog WHERE id=$1',[s])).rows[0].revision;
  const body=kind==='cleaning'?{reservationId:r,serviceId:s,expectedRevision:revision,expectedPriceMinor:'100',requestedFor:when}:kind==='laundry'?{reservationId:r,serviceId:s,expectedRevision:revision,declaredCount:1,preferences:'Synthetic',pickupAt:when}:kind==='market'?{reservationId:r,lines:[{serviceId:s,quantity:1,expectedRevision:revision}],expectedTotalMinor:'100'}:{reservationId:r,category:'help',partySize:1,budgetMinor:'9007199254740993',requestedFor:when,message:'Synthetic detail request'};
  const receipt=await services[kind].request(a.token,randomUUID(),body);ids[kind]='intakeId' in receipt?receipt.intakeId:receipt.orderId;
 }
 return {a,r,g,ids,q};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_MARKET_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{try{
 if((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker==='VIEWS_DISPOSABLE_CORE_TEST')await run('UPDATE service_catalog SET active=false WHERE organization_id=$1 AND property_id=$2 AND id=ANY($3::uuid[]) AND active',[org,property,[61,62,63].map(n=>'76910000-0000-4000-8000-'+String(n).padStart(12,'0'))]);
}finally{await db.onModuleDestroy();}});
describe.sequential('guest service detail / scoped direct lookup',()=>{
 it('reads all four exact identities after checkout, without changing orders, folio or events',async()=>{
  const f=await fixture(),counts=async()=>(await f.q('SELECT (SELECT count(*) FROM service_orders WHERE reservation_id=$1)::int orders,(SELECT count(*) FROM folio_entries e JOIN guest_folios f ON f.id=e.folio_id WHERE f.reservation_id=$1)::int charges,(SELECT count(*) FROM outbox_events)::int events',[f.r])).rows[0];
  const before=await counts();await f.q("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.r]);
  for(const [kind,id] of Object.entries(f.ids)){
   const row=await detail(f.a.token,f.r,kind,id);expect(row[kind==='laundry'?'intakeId':'orderId']).toBe(id);expect(row.stage).toBe(kind==='market'?'reserved':'requested');
   if(kind==='market'){expect(row.lines[0]).toMatchObject({quantity:1,priceMinor:'100'});expect(JSON.stringify(row)).not.toMatch(/itemId|catalogRevision|stock|membership/);}
   else {const page=kind==='cleaning'?await services.cleaning.orders(f.a.token,f.r):await services[kind as 'laundry'|'concierge'].guestList(f.a.token,f.r);const {sla:_,...listed}=page.items[0] as Record<string,unknown>;expect(row).toMatchObject(listed);}
  }
  expect(await counts()).toEqual(before);
 });
 it('uniformly rejects nonexistent, wrong kind, another stay, cross tenant and invalid kind',async()=>{
  const own=await fixture(),other=await fixture(true),sameStay=randomUUID();
  await own.q("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) SELECT $2,organization_id,property_id,unit_id,primary_guest_id,$2::uuid::text,status,check_in_at,check_out_at,currency,0,'{}' FROM reservations WHERE id=$1",[own.r,sameStay]);
  for(const [kind,id] of Object.entries(own.ids)){
   for(const [r,k,target] of [[own.r,kind,randomUUID()],[sameStay,kind,id],[other.r,kind,id],[own.r,kind==='laundry'?'market':'laundry',id],[own.r,kind,other.ids.cleaning]])await expect(detail(own.a.token,r,k,target)).rejects.toMatchObject({code:'P0002',message:'SERVICE_STAY_NOT_FOUND'});
   await expect(detail(other.a.token,own.r,kind,id)).rejects.toMatchObject({code:'P0002',message:'SERVICE_STAY_NOT_FOUND'});
  }
  await expect(detail(own.a.token,own.r,'unknown',own.ids.cleaning)).rejects.toMatchObject({code:'22023',message:'SERVICE_INPUT_INVALID'});
 });
 it('rechecks current primary ownership and revocation on every lookup',async()=>{
  const f=await fixture();await f.q('UPDATE guest_profiles SET user_id=NULL WHERE id=$1 AND user_id=$2',[f.g,f.a.userId]);
  for(const [kind,id] of Object.entries(f.ids))await expect(detail(f.a.token,f.r,kind,id)).rejects.toMatchObject({code:'P0002',message:'SERVICE_STAY_NOT_FOUND'});
  await guest.logout(f.a.token);for(const [kind,id] of Object.entries(f.ids))await expect(detail(f.a.token,f.r,kind,id)).rejects.toMatchObject({code:'28000',message:'SERVICE_SESSION_INVALID'});
 });
 it('keeps direct API reads behind production, service and market gates',async()=>{
  const args=['synthetic-token',randomUUID(),'market',randomUUID()] as const;
  vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false');await expect(services.cleaning.detail(...args)).rejects.toThrow('SERVICE_MARKET_DISABLED');
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','false');await expect(services.cleaning.detail(...args)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(services.cleaning.detail(...args)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
 });
});
