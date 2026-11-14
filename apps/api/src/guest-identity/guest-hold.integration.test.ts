import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {GuestIdentityService} from './guest-identity.service';
import {GuestSmsRegistry,type GuestSmsMessage} from './guest-sms.registry';
import {GuestQuoteService} from './guest-quote.service';
import {GuestSmsTripsService} from './guest-sms-trips.service';
import {GuestHoldService} from './guest-hold.service';
const db=new DatabaseService(),sms=new GuestSmsRegistry(),messages:GuestSmsMessage[]=[];
sms.register({send:async message=>{messages.push(message);}});
const auth=new GuestIdentityService(db,sms,new SecurityRateLimitService(db));
const offers=new GuestQuoteService(db,new StaffAuthService(db),auth),holds=new GuestHoldService(db,auth),trips=new GuestSmsTripsService(db,auth);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',member='73100000-0000-4000-8000-000000000001';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const query=(sql:string,args:unknown[]=[])=>db.withOrganization(org,client=>client.query(sql,args));
let staffToken:string;
async function account(){
 const network=()=>randomBytes(32).toString('hex'),phone='+998'+String(BigInt('0x'+randomBytes(6).toString('hex'))%1000000000n).padStart(9,'0');
 const challenge=await auth.requestCode(phone,'ru',network()),message=messages.find(m=>m.idempotencyKey===challenge.challengeId)!;
 const session=await auth.verifyCode(challenge.challengeId,message.code,network()),profile=randomUUID();
 await query("INSERT INTO guest_profiles(id,organization_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Hold')",[profile,org,session.userId]);
 return {...session,profile};
}
async function unit(){
 const type=randomUUID(),unitId=randomUUID(),rateId=randomUUID();
 await query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)",[unitId,property,type,'hold-'+unitId]);
 await query("INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,$3,'{}','UZS',100)",[rateId,property,type]);
 return {unitId,rateId};
}
async function quote(profile:string,inventory=unit(),ttl=600){
 const {unitId,rateId}=await inventory,id=randomUUID();
 await query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at)
 VALUES($1,$2,$3,$4,$5,'2037-10-01T14:00:00+05','2037-10-03T12:00:00+05','{"guests":2}','UZS',9007199254740993,9007199254740993,'{"version":1}','{"synthetic":true}','synthetic',clock_timestamp()+make_interval(secs=>$6))`,[id,org,property,unitId,rateId,ttl]);
 await query("INSERT INTO booking_quote_lines(quote_id,line_type,code,label,amount_minor,currency,metadata) VALUES($1,'accommodation','ROOM','{}',9007199254740993,'UZS','{\"synthetic\":true}')",[id]);
 await offers.issue(staffToken,id,profile);return id;
}
beforeAll(async()=>{
 expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');
 staffToken=randomBytes(32).toString('hex');expect((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[member,hash(staffToken)])).rows[0].ok).toBe(true);
});
beforeEach(()=>{for(const [key,value] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_GUEST_HOLDS_PILOT_ENABLED:'true',VIEWS_GUEST_QUOTES_PILOT_ENABLED:'true',VIEWS_GUEST_TRIPS_PILOT_ENABLED:'true',VIEWS_GUEST_SMS_PILOT_ENABLED:'true',VIEWS_GUEST_SMS_OTP_KEY:'ab'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(key,value);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('SMS-owned holds / disposable PostgreSQL',()=>{
 it('creates an owned hold visible in trips with exact price, copied lines and inventory',async()=>{
  const a=await account(),id=await quote(a.profile),result=await holds.create(a.token,id,randomUUID());
  expect(result).toMatchObject({status:'hold',totalMinor:'9007199254740993',currency:'UZS',idempotentReplay:false});
  expect(Date.parse(result.holdExpiresAt)-Date.now()).toBeGreaterThan(590000);
  expect((await trips.detail(a.token,result.reservationId)).trip).toMatchObject({status:'hold',totalMinor:result.totalMinor});
  const r=(await query('SELECT primary_guest_id,quote_snapshot,cancellation_policy_snapshot FROM reservations WHERE id=$1',[result.reservationId])).rows[0];
  expect(r.primary_guest_id).toBe(a.profile);expect(r.cancellation_policy_snapshot).toEqual({version:1});expect(r.quote_snapshot.quoteId).toBe(id);
  expect((await query('SELECT amount_minor::text amount FROM reservation_price_lines WHERE reservation_id=$1',[result.reservationId])).rows).toEqual([{amount:'9007199254740993'}]);
  expect((await query('SELECT kind FROM inventory_periods WHERE reservation_id=$1',[result.reservationId])).rows).toEqual([{kind:'payment_hold'}]);
 });
 it('serializes same-key retries and emits exactly one audit, state event and outbox',async()=>{
  const a=await account(),id=await quote(a.profile),key=randomUUID(),results=await Promise.all(Array.from({length:4},()=>holds.create(a.token,id,key)));
  expect(new Set(results.map(r=>r.reservationId)).size).toBe(1);expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  const reservation=results[0].reservationId;
  for(const sql of ["SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1","SELECT count(*)::int n FROM booking_state_events WHERE reservation_id=$1 AND event_type='booking.hold_created'","SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='booking.hold_created'","SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest_hold.created'"])expect((await query(sql,[reservation])).rows[0].n).toBe(1);
  await expect(holds.create(a.token,await quote(a.profile),key)).rejects.toMatchObject({status:409});
 });
 it('denies foreign ownership and a revoked session before cached replay',async()=>{
  const a=await account(),b=await account(),id=await quote(a.profile),key=randomUUID();
  await expect(holds.create(b.token,id,key)).rejects.toMatchObject({status:404});
  const result=await holds.create(a.token,id,key);await auth.logout(a.token);
  await expect(holds.create(a.token,id,key)).rejects.toMatchObject({status:401});
  await expect(db.query('SELECT app.create_guest_hold($1,$2,$3,600)',[hash(a.token),id,key])).rejects.toMatchObject({code:'28000'});
  expect((await query('SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1',[result.reservationId])).rows[0].n).toBe(1);
 });
 it('denies an unlinked profile on both fresh commands and cached replay',async()=>{
  const a=await account(),id=await quote(a.profile),key=randomUUID();await holds.create(a.token,id,key);
  await query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[a.profile]);
  await expect(holds.create(a.token,id,key)).rejects.toMatchObject({status:404});await expect(holds.create(a.token,id,randomUUID())).rejects.toMatchObject({status:404});
 });
 it('allows one winner for competing quotes and rolls back the losing reservation',async()=>{
  const a=await account(),inventory=unit(),ids=await Promise.all([quote(a.profile,inventory),quote(a.profile,inventory)]);
  const outcomes=await Promise.allSettled(ids.map(id=>holds.create(a.token,id,randomUUID())));
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({status:409});
  expect((await query('SELECT count(*)::int n FROM reservations WHERE quote_snapshot->>\'quoteId\'=ANY($1::text[])',[ids])).rows[0].n).toBe(1);
 });
 it('six concurrent requests on three units produce exactly three holds',async()=>{
  const a=await account(),ids:string[]=[];
  for(let i=0;i<3;i++){const inventory=unit();ids.push(...await Promise.all([quote(a.profile,inventory),quote(a.profile,inventory)]));}
  const outcomes=await Promise.allSettled(ids.map(id=>holds.create(a.token,id,randomUUID())));
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(3);expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(3);
  const rows=(await query('SELECT r.unit_id,count(*)::int n FROM reservations r JOIN inventory_periods i ON i.reservation_id=r.id WHERE r.quote_snapshot->>\'quoteId\'=ANY($1::text[]) GROUP BY r.unit_id',[ids])).rows;
  expect(rows).toHaveLength(3);expect(rows.every(r=>r.n===1)).toBe(true);
 });
 it('rejects an expired assigned quote without any reservation',async()=>{
  const a=await account(),id=await quote(a.profile,unit(),1);await new Promise(resolve=>setTimeout(resolve,1100));
  await expect(holds.create(a.token,id,randomUUID())).rejects.toThrow();
  expect((await query('SELECT count(*)::int n FROM reservations WHERE quote_snapshot->>\'quoteId\'=$1',[id])).rows[0].n).toBe(0);
 });
});

it('rejects logout while waiting for quote lock on fresh and cached requests',async()=>{
 for(const cached of [false,true]){
  const a=await account(),id=await quote(a.profile),key=randomUUID();
  if(cached)await holds.create(a.token,id,key);
  let unlock!:()=>void,locked!:()=>void;
  const gate=new Promise<void>(resolve=>{unlock=resolve;}),ready=new Promise<void>(resolve=>{locked=resolve;});
  const blocker=db.withOrganization(org,async c=>{await c.query('SELECT id FROM booking_quotes WHERE id=$1 FOR UPDATE',[id]);locked();await gate;});
  await ready;
  const pending=db.query('SELECT app.create_guest_hold($1,$2,$3,600)',[hash(a.token),id,key]).then(()=>({code:'unexpected-success'}),e=>({code:e.code}));
  try{
   let waiting=false;
   for(let i=0;i<100&&!waiting;i++){
    waiting=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND usename=current_user AND query LIKE 'SELECT app.create_guest_hold%' AND wait_event_type='Lock') ok")).rows[0].ok;
    if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting).toBe(true);await auth.logout(a.token);
  }finally{unlock();await blocker;}
  expect(await pending).toEqual({code:'28000'});
  expect((await query("SELECT count(*)::int n FROM reservations WHERE quote_snapshot->>'quoteId'=$1",[id])).rows[0].n).toBe(cached?1:0);
 }
});
