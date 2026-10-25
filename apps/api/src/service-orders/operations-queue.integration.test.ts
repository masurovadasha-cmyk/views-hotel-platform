import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {OperationsQueueService,type QueueKind} from './operations-queue.service';
import {ServiceOrderService} from './service-order.service';
import {LaundryService} from './laundry.service';
import {ConciergeService} from './concierge.service';
import {MarketService} from './market.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),queue=new OperationsQueueService(db,staff),cleaning=new ServiceOrderService(db,guest,staff),laundry=new LaundryService(db,guest,staff),concierge=new ConciergeService(db,guest,staff),market=new MarketService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n===5?2:n),membershipId:id(n),requestId:randomUUID()});
const stockActor={organizationId:org,userId:'76900000-0000-4000-8000-000000000001',membershipId:'76900000-0000-4000-8000-000000000001',requestId:randomUUID()};
const token=(n=1)=>('a'+n).repeat(32);
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_MARKET_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
async function fixture(){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('queue-'+randomUUID()+'@views.invalid','ru',net()),a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID(),l=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Queue')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1::uuid,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')",[r,org,property,u,g]);
 for(const [key,kind] of [[s,'cleaning'],[l,'laundry'],[randomUUID(),'concierge']])await run(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,commission_bps,active,execution_kind,duration_minutes) VALUES($1::uuid,$2,$3,$1::uuid::text,'{"ru":"Тест","en":"Test","uz":"Sinov"}','UZS',$5,1000,true,$4,40)`,[key,org,property,kind,kind==='concierge'?0:100]);
 return {a,r,u,s,l};
}
async function list(kind:QueueKind,n=1,cursor?:string){return (await queue.list(actor(n),token(n),{propertyId:property,kind,...cursor?{cursor}:{}})).sections[0];}
describe.sequential('operations queue / actual scoped PostgreSQL functions',()=>{
 it('projects real cleaning/laundry/concierge and market with no PII and independent keysets',async()=>{
  const f=await fixture(),when=new Date(Date.now()+3600000).toISOString();
  await cleaning.request(f.a.token,randomUUID(),{reservationId:f.r,serviceId:f.s,expectedRevision:1,expectedPriceMinor:'100',requestedFor:when});
  for(let i=0;i<3;i++){
   await laundry.request(f.a.token,randomUUID(),{reservationId:f.r,serviceId:f.l,expectedRevision:1,declaredCount:1,preferences:'Synthetic',pickupAt:when});
   await concierge.request(f.a.token,randomUUID(),{reservationId:f.r,category:'restaurant',partySize:2,budgetMinor:'0',message:'Synthetic request',requestedFor:when});
  }
  const product='76910000-0000-4000-8000-000000000060';
  const prior=(await run('SELECT active,revision,price_minor::text FROM service_catalog WHERE id=$1',[product])).rows[0];
  let marketOrder:Awaited<ReturnType<MarketService['request']>>|undefined;
  try{
   await run('UPDATE service_catalog SET active=true WHERE id=$1',[product]);const revision=(await run('SELECT revision FROM service_catalog WHERE id=$1',[product])).rows[0].revision;
   marketOrder=await market.request(f.a.token,randomUUID(),{reservationId:f.r,lines:[{serviceId:product,quantity:1,expectedRevision:revision}],expectedTotalMinor:prior.price_minor});
   const stockPage=(await queue.list(stockActor,'b1'.repeat(32),{propertyId:property,kind:'market'})).sections[0];
   expect(stockPage.status).toBe('available');expect(stockPage.items.some(r=>r.id===marketOrder!.orderId)).toBe(true);
   const all=await queue.list(actor(),token(),{propertyId:property});expect(all.sections).toHaveLength(4);
   for(const kind of ['cleaning','laundry','concierge'] as const){
    const first=all.sections.find(s=>s.kind===kind)!;expect(first.status).toBe('available');expect(first.items.length).toBeGreaterThan(0);
    for(const row of first.items){expect(Object.keys(row).sort()).toEqual(['id','kind','revision','sla','stage','unitCode']);expect(row.sla===null).toBe(kind!=='concierge');}
   }
   for(const kind of ['laundry','concierge'] as const){const first=await list(kind);expect(first.nextCursor).toBeTruthy();const next=await list(kind,1,first.nextCursor!);expect(next.items.length).toBeGreaterThan(0);expect(next.items.every(r=>r.id>first.nextCursor!)).toBe(true);expect(next.items.some(r=>first.items.some(a=>a.id===r.id))).toBe(false);}
  }finally{
   if(marketOrder)await market.guestAct(f.a.token,marketOrder.orderId,randomUUID(),{action:'cancel',expectedRevision:marketOrder.revision});
   await run('UPDATE service_catalog SET active=$2 WHERE id=$1',[product,prior.active]);
  }
 });
 it('filters forbidden services, cross-property and actor scopes without counts',async()=>{
  const result=await queue.list(actor(4),token(4),{propertyId:property});expect(result.sections.every(s=>s.status==='forbidden'&&s.items.length===0&&s.nextCursor===null)).toBe(true);
  const other=await queue.list(actor(),token(),{propertyId:randomUUID()});expect(other.sections.every(s=>s.status==='forbidden'&&s.items.length===0)).toBe(true);
  await expect(queue.list({...actor(),organizationId:randomUUID()},token(),{propertyId:property})).rejects.toThrow('STAFF_ACTOR_MISMATCH');
  await expect(queue.list(actor(),token(),{propertyId:property,cursor:randomUUID()})).rejects.toThrow('SERVICE_INPUT_INVALID');
 });
 it('retains existing assignment isolation including nullable concierge assignments',async()=>{
  const f=await fixture(),r=await concierge.request(f.a.token,randomUUID(),{reservationId:f.r,category:'restaurant',partySize:2,budgetMinor:'0',message:'Private fixture text',requestedFor:new Date(Date.now()+3600000).toISOString()});
  async function find(n:number){let cursor:string|undefined;for(let i=0;i<500;i++){const p=await list('concierge',n,cursor);if(p.items.some(x=>x.id===r.orderId))return true;if(!p.nextCursor)return false;cursor=p.nextCursor;}throw Error('FIXTURE_PAGE_BOUND');}
  expect(await find(6)).toBe(true);await concierge.staffAct(actor(6),token(6),r.orderId,randomUUID(),{action:'claim',expectedRevision:r.revision});expect(await find(6)).toBe(true);expect(await find(7)).toBe(false);
  const unassigned=await cleaning.request(f.a.token,randomUUID(),{reservationId:f.r,serviceId:f.s,expectedRevision:1,expectedPriceMinor:'100',requestedFor:new Date(Date.now()+3600000).toISOString()});
  let cursor:string|undefined;for(let i=0;i<500;i++){const cleaner=await list('cleaning',2,cursor);expect(cleaner.items.some(x=>x.id===unassigned.orderId)).toBe(false);if(!cleaner.nextCursor)break;cursor=cleaner.nextCursor;if(i===499)throw Error('FIXTURE_PAGE_BOUND');}
 });
 it('revalidates revoked unique session on subsequent read without touching shared fixture sessions',async()=>{
  const unique=randomBytes(32).toString('hex');expect((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[id(5),createHash('sha256').update(unique).digest('hex')])).rows[0].ok).toBe(true);
  try{await queue.list(actor(5),unique,{propertyId:property});await staff.logout(unique,false);await expect(queue.list(actor(5),unique,{propertyId:property})).rejects.toThrow('STAFF_SESSION_REQUIRED');}finally{await staff.logout(unique,false);}
 });
});
