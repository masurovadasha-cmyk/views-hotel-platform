import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {ServiceOrderService} from './service-order.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async message=>{messages.push(message);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),service=new ServiceOrderService(db,guest,new StaffAuthService(db));
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',manager='76800000-0000-4000-8000-000000000001';
const run=(sql:string,args:unknown[]=[])=>db.withActor({organizationId:org,userId:manager,membershipId:manager,requestId:randomUUID()},c=>c.query(sql,args));
const roleSql='SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user';
const runtimeRole={role:'views_app',rolsuper:false,rolbypassrls:false},catalogIds:string[]=[];
async function fixture(cached:boolean){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('request-replay-'+randomUUID()+'@views.invalid','ru',net());
 const a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID(),key=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Replay')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,org,property,u,g]);
 await run("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{}','UZS',100,true,'cleaning',40)",[s,org,property]);
 catalogIds.push(s);
 const body={reservationId:r,serviceId:s,expectedRevision:1,expectedPriceMinor:'100',requestedFor:new Date(Date.now()+86400000).toISOString()};
 const receipt=cached?await service.request(a.token,key,body):null;
 return {a,r,g,s,key,body,receipt};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const snapshot=async(f:Fixture)=>(await run(`SELECT
 (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM service_orders o WHERE o.reservation_id=$1) orders,
 (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.order_id),'[]') FROM service_cleaning_tasks t JOIN service_orders o ON o.id=t.order_id WHERE o.reservation_id=$1) tasks,
 (SELECT count(*) FROM audit_log WHERE organization_id=$2 AND actor_user_id=$3)::int audits,
 (SELECT count(*) FROM outbox_events e JOIN service_orders o ON o.id=e.aggregate_id WHERE o.reservation_id=$1)::int events,
 (SELECT count(*) FROM outbox_events WHERE organization_id=$2 AND idempotency_key='service-command:'||$3::text||':'||$4::text)::int command_events,
 (SELECT count(*) FROM folio_entries f JOIN service_orders o ON o.id=f.source_id WHERE o.reservation_id=$1)::int charges`,[f.r,org,f.a.userId,f.key])).rows[0];
async function blockedRequest(f:Fixture,revoke:()=>Promise<unknown>,lock:'command'|'stay'|'catalog'='command'){
 const locker=new Client({connectionString:process.env.DATABASE_URL}),caller=new Client({connectionString:process.env.DATABASE_URL});
 let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
 try{
  await locker.connect();await caller.connect();
  for(const client of [locker,caller]){expect((await client.query(roleSql)).rows[0]).toEqual(runtimeRole);await client.query("SET statement_timeout='4s'");}
  await locker.query('BEGIN');
  if(lock==='command')await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::text||':'||$2::text,0))",[f.a.userId,f.key]);
  else{await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,manager]);expect((await locker.query(lock==='stay'?'SELECT id FROM reservations WHERE id=$1 FOR UPDATE':'SELECT id FROM service_catalog WHERE id=$1 FOR UPDATE',[lock==='stay'?f.r:f.s])).rowCount).toBe(1);}
  const pid=(await caller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  pending=caller.query('SELECT app.guest_cleaning_request($1,$2,$3) AS value',[createHash('sha256').update(f.a.token).digest('hex'),f.key,f.body]).then(result=>({value:result.rows[0].value}),error=>({error}));
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
describe.sequential('cleaning creation reauthorizes after waiting for its idempotency lock',()=>{
 it.each([[true,'logout'],[true,'unlink'],[true,'reassign'],[false,'logout'],[false,'unlink'],[false,'reassign']] as const)('cached=%s rejects %s during lock wait without writes',async(cached,revocation)=>{
  const f=await fixture(cached),before=await snapshot(f);
  const result=await blockedRequest(f,async()=>{
   if(revocation==='logout')return guest.logout(f.a.token);
   if(revocation==='unlink')return run('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.g]);
   const replacement=randomUUID();await run("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Replacement')",[replacement,org]);
   return run('UPDATE reservations SET primary_guest_id=$2 WHERE id=$1',[f.r,replacement]);
  });
  expect(result).toMatchObject({error:revocation==='logout'?{code:'28000',message:'SERVICE_SESSION_INVALID'}:{code:'P0002',message:'SERVICE_STAY_NOT_FOUND'}});
  expect(result).not.toHaveProperty('value');expect(await snapshot(f)).toEqual(before);
 });
 it('also rechecks a cached receipt session after waiting for the reservation row lock',async()=>{
  const f=await fixture(true),before=await snapshot(f);
  expect(await blockedRequest(f,()=>guest.logout(f.a.token),'stay')).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('rechecks a fresh request session after waiting for the catalog row lock',async()=>{
  const f=await fixture(false),before=await snapshot(f);
  expect(await blockedRequest(f,()=>guest.logout(f.a.token),'catalog')).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});
  expect(await snapshot(f)).toEqual(before);
 });
 it.each(['checkout','repriced','unavailable'] as const)('returns the original receipt after %s without writes',async change=>{
  const f=await fixture(true);
  if(change==='checkout'){
   await service.change(f.a.token,f.receipt!.orderId,randomUUID(),{action:'cancel',expectedRevision:f.receipt!.revision});
   await run("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.r]);
  }else if(change==='repriced')await run('UPDATE service_catalog SET price_minor=200 WHERE id=$1',[f.s]);
  else await run('UPDATE service_catalog SET active=false WHERE id=$1',[f.s]);
  const before=await snapshot(f);
  expect(await blockedRequest(f,async()=>{})).toEqual({value:{...f.receipt,idempotentReplay:true}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('keeps same-key changed-payload conflict atomic',async()=>{
  const f=await fixture(true),before=await snapshot(f);
  await expect(service.request(f.a.token,f.key,{...f.body,expectedPriceMinor:'200'})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  expect(await snapshot(f)).toEqual(before);
 });
});
