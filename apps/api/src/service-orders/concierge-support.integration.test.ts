import {ConciergeSupportService} from './concierge-support.service';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {ConciergeService,type ConciergeReceipt} from './concierge.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new ConciergeService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n===5?2:n),membershipId:id(n),requestId:randomUUID()});
const token=(n=1)=>('a'+n).repeat(32);
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
let slot=0;
async function account(){const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('service-'+randomUUID()+'@views.invalid','ru',net());return guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());}
async function fixture(price='0'){
 const a=await account(),r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Guest')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Service fixture\"}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1::uuid,$2,$3,$1::uuid::text)',[u,property,type]);
 await run(`INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot)
 VALUES($1::uuid,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')`,[r,org,property,u,g]);
 await run(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,commission_bps,active,execution_kind,duration_minutes) VALUES($1::uuid,$2,$3,$1::uuid::text,'{"ru":"Тестовая прачечная","en":"Synthetic laundry","uz":"Sinov kir yuvish"}','UZS',$4,1000,true,'concierge',40)`,[s,org,property,price]);
 const body={reservationId:r,category:'restaurant',partySize:2,budgetMinor:'9007199254740993',message:'Italian food please',requestedFor:new Date(Date.now()+(++slot)*3600000).toISOString()};return {a,r,g,s,u,body};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());

const support=new ConciergeSupportService(db,guest,staff);
const article=()=>({id:randomUUID(),expectedRevision:0,language:'en',title:'Parking '+randomUUID(),text:'Ask reception for the current parking instructions.',active:true});
describe('Concierge knowledge and consented guest context',()=>{
 it('saves once, searches literal text, versions and archives without guest access or worker writes',async()=>{
  const b=article(),key=randomUUID(),results=await Promise.all([support.saveKnowledge(actor(),token(),property,key,b),support.saveKnowledge(actor(),token(),property,key,b)]);
  expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  expect((await support.knowledge(actor(6),token(6),property,undefined,b.title)).items[0]).toMatchObject({id:b.id,revision:1});
  await expect(support.saveKnowledge(actor(6),token(6),property,randomUUID(),b)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(support.saveKnowledge(actor(),token(),randomUUID(),randomUUID(),b)).rejects.toThrow('SERVICE_FORBIDDEN');
  await support.saveKnowledge(actor(),token(),property,randomUUID(),{...b,expectedRevision:1,active:false});
  expect((await support.knowledge(actor(6),token(6),property,undefined,b.title)).items).toHaveLength(0);
  expect((await support.knowledge(actor(),token(),property,undefined,b.title)).items[0].active).toBe(false);
  await expect(support.saveKnowledge(actor(),token(),property,key,{...b,text:'Other'})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
 });
 it('rejects stale concurrent editors and malformed input, without overwriting the winner',async()=>{
  const b=article();await support.saveKnowledge(actor(),token(),property,randomUUID(),b);
  const results=await Promise.allSettled(['One','Two'].map(text=>support.saveKnowledge(actor(),token(),property,randomUUID(),{...b,expectedRevision:1,text})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{message:'SERVICE_REVISION_CHANGED'}});
  await expect(support.saveKnowledge(actor(),token(),property,randomUUID(),{...b,text:'x'.repeat(501)})).rejects.toThrow('SERVICE_INPUT_INVALID');
  expect((await run("UPDATE concierge_knowledge SET active=false WHERE id=$1",[b.id])).rowCount).toBe(0);
 });
 it('shares only after guest consent and assignment, revokes without copies in command/audit/outbox',async()=>{
  const f=await fixture(),r=await service.request(f.a.token,randomUUID(),f.body);
  await expect(support.context(actor(6),token(6),r.orderId)).rejects.toThrow('SERVICE_FORBIDDEN');
  await service.staffAct(actor(6),token(6),r.orderId,randomUUID(),{action:'claim',expectedRevision:r.revision});
  expect((await support.context(actor(6),token(6),r.orderId)).consent).toBe(false);
  const privateText='No fragrances '+randomUUID(),key=randomUUID(),body={reservationId:f.r,expectedRevision:0,consent:true,preferences:privateText};
  const results=await Promise.all([support.savePreferences(f.a.token,key,body),support.savePreferences(f.a.token,key,body)]);expect(results.filter(x=>!x.idempotentReplay)).toHaveLength(1);
  expect((await support.context(actor(6),token(6),r.orderId)).preferences).toBe(privateText);
  expect((await support.preferences(f.a.token,f.r)).preferences).toBe(privateText);
  await expect(support.context(actor(7),token(7),r.orderId)).rejects.toThrow('SERVICE_FORBIDDEN');
  await support.savePreferences(f.a.token,randomUUID(),{reservationId:f.r,expectedRevision:1,consent:false,preferences:''});
  expect((await support.context(actor(6),token(6),r.orderId)).preferences).toBe('');
  expect((await support.preferences(f.a.token,f.r))).toMatchObject({revision:2,consent:false,preferences:''});
  const audit=await run("SELECT after_state FROM audit_log WHERE entity_id=$1",[f.r]);expect(JSON.stringify(audit.rows)).not.toContain(privateText);
  const events=await run("SELECT payload FROM outbox_events WHERE aggregate_id=$1",[f.r]);expect(JSON.stringify(events.rows)).not.toContain(privateText);
  expect(JSON.stringify(results)).not.toContain(privateText);
 });
 it('does not transfer consent when booking ownership changes and denies cross-guest access',async()=>{
  const f=await fixture(),other=await account(),r=await service.request(f.a.token,randomUUID(),f.body);
  await support.savePreferences(f.a.token,randomUUID(),{reservationId:f.r,expectedRevision:0,consent:true,preferences:'Old guest preference'});
  await expect(support.preferences(other.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await run('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[other.userId,f.g]);
  await expect(support.preferences(f.a.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  expect(await support.preferences(other.token,f.r)).toMatchObject({consent:false,preferences:''});
  expect(await support.context(actor(),token(),r.orderId)).toMatchObject({consent:false,preferences:''});
 });
 it('hides preferences after checkout but permits withdrawal, and requires live sessions',async()=>{
  const f=await fixture(),r=await service.request(f.a.token,randomUUID(),f.body);
  await support.savePreferences(f.a.token,randomUUID(),{reservationId:f.r,expectedRevision:0,consent:true,preferences:'Quiet room'});
  await run("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.r]);
  expect(await support.context(actor(),token(),r.orderId)).toMatchObject({consent:false,preferences:''});
  await expect(support.savePreferences(f.a.token,randomUUID(),{reservationId:f.r,expectedRevision:1,consent:true,preferences:'Other'})).rejects.toThrow('SERVICE_STAY_INELIGIBLE');
  await support.savePreferences(f.a.token,randomUUID(),{reservationId:f.r,expectedRevision:1,consent:false,preferences:''});
  await guest.logout(f.a.token);await expect(support.preferences(f.a.token,f.r)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
});
