import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {ServiceOrderService,type ServiceReceipt} from './service-order.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async message=>{messages.push(message);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),service=new ServiceOrderService(db,guest,new StaffAuthService(db));
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n),membershipId:id(n),requestId:randomUUID()});
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
const roleSql='SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user';
const runtimeRole={role:'views_app',rolsuper:false,rolbypassrls:false},catalogIds:string[]=[];
let slot=0;
const act=(o:ServiceReceipt,action:string,fields:Record<string,unknown>={},who=1)=>service.act(actor(who),('a'+who).repeat(32),o.orderId,randomUUID(),{action,expectedRevision:o.revision,...fields});
async function fixture(cached:boolean){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('feedback-replay-'+randomUUID()+'@views.invalid','ru',net());
 const a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID(),key=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Feedback')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')",[r,org,property,u,g]);
 await run("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{}','UZS',100,true,'cleaning',40)",[s,org,property]);
 catalogIds.push(s);
 let order=await service.request(a.token,randomUUID(),{reservationId:r,serviceId:s,expectedRevision:1,expectedPriceMinor:'100',requestedFor:new Date(Date.now()+30*86400000+(++slot)*3600000).toISOString()});
 order=await act(order,'assign',{assigneeId:id(2)});order=await act(order,'start',{},2);
 order=await act(order,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Synthetic work completed'},2);
 order=await act(order,'approve',{note:'Independent inspection passed'});
 const body={rating:4,comment:'Synthetic service feedback'},receipt=cached?await service.feedback(a.token,order.orderId,key,body):null;
 return {a,r,g,s,key,body,receipt,orderId:order.orderId};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const snapshot=async(f:Fixture)=>(await run(`SELECT
 (SELECT to_jsonb(o) FROM service_orders o WHERE o.id=$1) orders,
 (SELECT to_jsonb(t) FROM service_cleaning_tasks t WHERE t.order_id=$1) tasks,
 (SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM service_order_feedback f WHERE f.order_id=$1) feedback,
 (SELECT count(*) FROM audit_log WHERE organization_id=$2 AND entity_id=$1)::int audits,
 (SELECT count(*) FROM outbox_events WHERE organization_id=$2 AND aggregate_id=$1)::int events,
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM folio_entries f WHERE f.source_id=$1) charges`,[f.orderId,org])).rows[0];
async function blockedFeedback(f:Fixture,revoke:()=>Promise<unknown>,lock:'command'|'order'='command'){
 const locker=new Client({connectionString:process.env.DATABASE_URL}),caller=new Client({connectionString:process.env.DATABASE_URL});
 let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
 try{
  await locker.connect();await caller.connect();
  for(const client of [locker,caller]){expect((await client.query(roleSql)).rows[0]).toEqual(runtimeRole);await client.query("SET statement_timeout='4s'");}
  await locker.query('BEGIN');
  if(lock==='command')await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::text||':'||$2::text,0))",[f.a.userId,f.key]);
  else{await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,id(1)]);expect((await locker.query('SELECT id FROM service_orders WHERE id=$1 FOR UPDATE',[f.orderId])).rowCount).toBe(1);}
  const pid=(await caller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  pending=caller.query('SELECT app.guest_service_feedback($1,$2,$3,$4) AS value',[createHash('sha256').update(f.a.token).digest('hex'),f.orderId,f.key,f.body]).then(result=>({value:result.rows[0].value}),error=>({error}));
  const deadline=Date.now()+2000;let waiting=false;
  while(Date.now()<deadline){waiting=(await locker.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted AND ($3<>'command' OR locktype='advisory')) AND $2=ANY(pg_blocking_pids($1)) AS waiting",[pid,blocker,lock])).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}
  expect(waiting,`caller must reach the ${lock} lock before revocation`).toBe(true);
  await revoke();await locker.query('COMMIT');return await pending;
 }finally{
  await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;
  await caller.end();await locker.end();
 }
}
beforeAll(async()=>{
 expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');
 expect((await db.query(roleSql)).rows[0]).toEqual(runtimeRole);
});
beforeEach(()=>{for(const [key,value] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(key,value);});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{try{
 if((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker==='VIEWS_DISPOSABLE_CORE_TEST')await run('UPDATE service_catalog SET active=false WHERE organization_id=$1 AND property_id=$2 AND id=ANY($3::uuid[]) AND active',[org,property,catalogIds]);
}finally{await db.onModuleDestroy();}});
describe.sequential('cleaning feedback reauthorizes after waiting for command and order locks',()=>{
 it.each([[true,'logout'],[true,'unlink'],[true,'reassign'],[false,'logout'],[false,'unlink'],[false,'reassign']] as const)('cached=%s rejects %s during command lock wait without writes',async(cached,revocation)=>{
  const f=await fixture(cached),before=await snapshot(f);
  const result=await blockedFeedback(f,async()=>{
   if(revocation==='logout')return guest.logout(f.a.token);
   if(revocation==='unlink')return run('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.g]);
   const replacement=randomUUID();await run("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Replacement')",[replacement,org]);
   return run('UPDATE reservations SET primary_guest_id=$2 WHERE id=$1',[f.r,replacement]);
  });
  expect(result).toMatchObject({error:revocation==='logout'?{code:'28000',message:'SERVICE_SESSION_INVALID'}:{code:'P0002',message:'SERVICE_STAY_NOT_FOUND'}});
  expect(result).not.toHaveProperty('value');expect(await snapshot(f)).toEqual(before);
 });
 it.each([true,false])('cached=%s rechecks session after waiting for the order row lock',async cached=>{
  const f=await fixture(cached),before=await snapshot(f);
  expect(await blockedFeedback(f,()=>guest.logout(f.a.token),'order')).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('returns the original historical feedback receipt after checkout and catalog changes without writes',async()=>{
  const f=await fixture(true);
  await run("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.r]);
  await run('UPDATE service_catalog SET price_minor=200,active=false WHERE id=$1',[f.s]);
  const before=await snapshot(f);
  expect(await blockedFeedback(f,async()=>{})).toEqual({value:{...f.receipt,idempotentReplay:true}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('keeps same-key changed-payload conflict atomic',async()=>{
  const f=await fixture(true),before=await snapshot(f);
  await expect(service.feedback(f.a.token,f.orderId,f.key,{...f.body,rating:5})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  expect(await snapshot(f)).toEqual(before);
 });
});
