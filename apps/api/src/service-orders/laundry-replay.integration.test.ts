import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {LaundryService} from './laundry.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async message=>{messages.push(message);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new LaundryService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',manager='76800000-0000-4000-8000-000000000001';
const run=(sql:string,args:unknown[]=[])=>db.withActor({organizationId:org,userId:manager,membershipId:manager,requestId:randomUUID()},c=>c.query(sql,args));
const roleSql='SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user';
const runtimeRole={role:'views_app',rolsuper:false,rolbypassrls:false},catalogIds:string[]=[];
async function fixture(cached:boolean){
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('laundry-replay-'+randomUUID()+'@views.invalid','ru',net());
 const a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID(),key=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Laundry replay')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,org,property,u,g]);
 await run("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1,$2,$3,$1::uuid::text,'{}','UZS',100,true,'laundry',40)",[s,org,property]);
 catalogIds.push(s);
 const intake=await service.request(a.token,randomUUID(),{reservationId:r,serviceId:s,expectedRevision:1,declaredCount:2,preferences:'No perfume',pickupAt:new Date(Date.now()+86400000).toISOString()});
 const body={action:'cancel',expectedRevision:intake.revision},receipt=cached?await service.guestAct(a.token,intake.intakeId,key,body):null;
 return {a,r,g,s,key,body,intake,receipt};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const snapshot=async(f:Fixture)=>(await run(`SELECT to_jsonb(i) AS intake,
 (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM service_orders o WHERE o.reservation_id=i.reservation_id) orders,
 (SELECT count(*) FROM audit_log WHERE entity_id=i.id)::int audits,
 (SELECT count(*) FROM outbox_events WHERE aggregate_id=i.id)::int events,
 (SELECT count(*) FROM folio_entries f JOIN guest_folios g ON g.id=f.folio_id WHERE g.reservation_id=i.reservation_id)::int charges
 FROM laundry_intakes i WHERE i.id=$1`,[f.intake.intakeId])).rows[0];
async function blockedCancel(f:Fixture,revoke:()=>Promise<unknown>,lock:'command'|'stay'|'profile'='command',staffToken?:string){
 const locker=new Client({connectionString:process.env.DATABASE_URL}),caller=new Client({connectionString:process.env.DATABASE_URL});
 let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
 try{
  await locker.connect();await caller.connect();
  for(const client of [locker,caller]){expect((await client.query(roleSql)).rows[0]).toEqual(runtimeRole);await client.query("SET statement_timeout='4s'");}
  await locker.query('BEGIN');
  if(lock==='command')await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::text||':'||$2::text,0))",[staffToken?'76800000-0000-4000-8000-000000000002':f.a.userId,f.key]);
  else{
   await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,manager]);
   expect((await locker.query(lock==='stay'?'SELECT id FROM reservations WHERE id=$1 FOR UPDATE':'SELECT id FROM guest_profiles WHERE id=$1 FOR UPDATE',[lock==='stay'?f.r:f.g])).rowCount).toBe(1);
  }
  if(staffToken)await caller.query("SELECT set_config('app.organization_id',$1,false),set_config('app.user_id',$2,false),set_config('app.membership_id',$3,false)",[org,'76800000-0000-4000-8000-000000000002','76800000-0000-4000-8000-000000000005']);
  const pid=(await caller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  pending=caller.query(staffToken?'SELECT app.laundry_staff_act($1,$2,$3,$4) AS value':'SELECT app.laundry_guest_act($1,$2,$3,$4) AS value',[createHash('sha256').update(staffToken??f.a.token).digest('hex'),f.intake.intakeId,f.key,f.body])
   .then(result=>({value:result.rows[0].value}),error=>({error}));
  const deadline=Date.now()+2000;let waiting=false;
  while(Date.now()<deadline){
   waiting=(await locker.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted AND ($3<>'command' OR locktype='advisory')) AND $2=ANY(pg_blocking_pids($1)) AS waiting",[pid,blocker,lock])).rows[0].waiting;
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
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
describe.sequential('laundry fulfilment reauthorizes after waiting for command and stay locks',()=>{
 it.each([[true,'logout'],[true,'unlink'],[true,'reassign'],[false,'logout'],[false,'unlink'],[false,'reassign']] as const)('cached=%s rejects %s during command lock wait without writes',async(cached,revocation)=>{
  const f=await fixture(cached),before=await snapshot(f);
  const result=await blockedCancel(f,async()=>{
   if(revocation==='logout')return guest.logout(f.a.token);
   if(revocation==='unlink')return run('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.g]);
   const replacement=randomUUID();await run("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Replacement')",[replacement,org]);
   return run('UPDATE reservations SET primary_guest_id=$2 WHERE id=$1',[f.r,replacement]);
  });
  expect(result).toMatchObject({error:revocation==='logout'?{code:'28000',message:'SERVICE_SESSION_INVALID'}:{code:'P0002',message:'SERVICE_STAY_NOT_FOUND'}});
  expect(result).not.toHaveProperty('value');expect(await snapshot(f)).toEqual(before);
 });
 it.each([[true,'stay'],[false,'stay'],[true,'profile'],[false,'profile']] as const)('cached=%s rechecks session after waiting for the %s row lock',async(cached,lock)=>{
  const f=await fixture(cached),before=await snapshot(f);
  expect(await blockedCancel(f,()=>guest.logout(f.a.token),lock)).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('returns the original cancellation receipt after checkout and catalog changes without writes',async()=>{
  const f=await fixture(true);
  await run("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.r]);
  await run('UPDATE service_catalog SET price_minor=200,active=false WHERE id=$1',[f.s]);
  const before=await snapshot(f);
  expect(before.intake.stage).toBe('cancelled');
  expect(await blockedCancel(f,async()=>{})).toEqual({value:{...f.receipt,idempotentReplay:true}});
  expect(await snapshot(f)).toEqual(before);
 });
 it('keeps same-key changed-payload conflict atomic',async()=>{
  const f=await fixture(true),before=await snapshot(f);
  await expect(service.guestAct(f.a.token,f.intake.intakeId,f.key,{...f.body,expectedRevision:2})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  expect(await snapshot(f)).toEqual(before);
 });
 it('rejects cached staff receipt after its unique session is revoked during the command lock wait',async()=>{
  const token=randomBytes(32).toString('hex'),membershipId='76800000-0000-4000-8000-000000000005',userId='76800000-0000-4000-8000-000000000002';
  expect((await db.query('SELECT app.staff_auth_start($1,1,$2) AS ok',[membershipId,createHash('sha256').update(token).digest('hex')])).rows[0].ok).toBe(true);
  try{
   const f=await fixture(false);f.body={action:'receive',expectedRevision:f.intake.revision};
   f.receipt=await service.staffAct({organizationId:org,userId,membershipId,requestId:randomUUID()},token,f.intake.intakeId,f.key,f.body);
   const before=await snapshot(f);
   expect(await blockedCancel(f,()=>staff.logout(token,false),'command',token)).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});
   expect(await snapshot(f)).toEqual(before);
  }finally{await staff.logout(token,false);}
 });
});
