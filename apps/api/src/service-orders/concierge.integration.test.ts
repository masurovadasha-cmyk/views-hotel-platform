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
const command=(r:ConciergeReceipt,action:string,extra:Record<string,unknown>={})=>({action,expectedRevision:r.revision,...extra});
const act=(r:ConciergeReceipt,action:string,extra:Record<string,unknown>={},n=6)=>service.staffAct(actor(n),token(n),r.orderId,randomUUID(),command(r,action,extra));
describe('Concierge / scoped shared order engine',()=>{
 it('creates exactly one request, claims, exchanges messages, answers and closes without a charge',async()=>{
  const f=await fixture(),key=randomUUID(),rows=await Promise.all([service.request(f.a.token,key,f.body),service.request(f.a.token,key,f.body)]);
  expect(rows.filter(r=>!r.idempotentReplay)).toHaveLength(1);let r=rows[0];
  expect(r.messages[0].text).toBe('Italian food please');
  await expect(service.request(f.a.token,key,{...f.body,partySize:3})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  r=await act(r,'claim');await expect(run("UPDATE service_orders SET status='in_progress' WHERE id=$1",[r.orderId])).rejects.toMatchObject({code:'23514'});r=await act(r,'message',{message:'Checking restaurant availability'});
  r=await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'message',{message:'Outdoor seating preferred'}));
  const replyKey=randomUUID(),reply=command(r,'answer',{message:'Please review the restaurant options'});
  const answers=await Promise.all([service.staffAct(actor(6),token(6),r.orderId,replyKey,reply),service.staffAct(actor(6),token(6),r.orderId,replyKey,reply)]);
  expect(answers.filter(r=>!r.idempotentReplay)).toHaveLength(1);r=answers[0];expect(r.messages).toHaveLength(4);
  r=await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'message',{message:'Another question'}));expect(r.stage).toBe('working');
  r=await act(r,'answer',{message:'Final answer'});r=await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'close'));expect(r.stage).toBe('closed');
  expect((await run('SELECT status,total_minor::text FROM service_orders WHERE id=$1',[r.orderId])).rows[0]).toEqual({status:'completed',total_minor:'0'});
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[r.orderId])).rowCount).toBe(0);
  await expect(act(r,'message',{message:'Too late'})).rejects.toThrow('SERVICE_TRANSITION_INVALID');
 });
 it('projects answer deadlines on scoped lists without mutating command receipts or resetting release deadlines',async()=>{
  const f=await fixture(),key=randomUUID();let r=await service.request(f.a.token,key,f.body);
  const initialDue=r.responseDueAt;expect(r.sla).toBeUndefined();
  const guestRow=(await service.guestList(f.a.token,f.r)).items[0];
  expect(guestRow.sla).toMatchObject({policy:'concierge-response-15m-v1',hypothesis:true,responseDueAt:initialDue,state:'pending',overdueSeconds:0,answeredLate:null});
  r=await act(r,'claim');r=await act(r,'release');expect(r.responseDueAt).toBe(initialDue);
  r=await act(r,'claim');r=await act(r,'message',{message:'Investigating'});expect(r.responseDueAt).toBe(initialDue);
  r=await act(r,'answer',{message:'Resolved'});
  expect((await service.guestList(f.a.token,f.r)).items[0].sla).toMatchObject({state:'answered',overdueSeconds:0,answeredLate:false});
  r=await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'message',{message:'Follow-up question'}));
  expect(r.answeredAt).toBeNull();expect(Date.parse(r.responseDueAt)).toBeGreaterThan(Date.parse(initialDue));
  expect((await service.guestList(f.a.token,f.r)).items[0].sla).toMatchObject({state:'pending',answeredLate:null,responseDueAt:r.responseDueAt});
  const replay=await service.request(f.a.token,key,f.body);expect(replay.sla).toBeUndefined();expect(replay.responseDueAt).toBe(initialDue);expect(replay.idempotentReplay).toBe(true);
  await service.request(f.a.token,randomUUID(),f.body);
  const rows=(await service.guestList(f.a.token,f.r)).items;expect(rows).toHaveLength(2);expect(new Set(rows.map(row=>row.sla!.evaluatedAt)).size).toBe(1);
  const queue=(await service.staffList(actor(6),token(6),property)).items;expect(queue.length).toBeGreaterThan(0);expect(queue.every(row=>row.sla?.policy==='concierge-response-15m-v1')).toBe(true);
 });
 it('serializes competing staff claims and prevents reading or answering another employee assignment',async()=>{
  const f=await fixture(),r=await service.request(f.a.token,randomUUID(),f.body);
  const claims=await Promise.allSettled([act(r,'claim',{},6),act(r,'claim',{},7)]);expect(claims.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const winner=claims[0].status==='fulfilled'?6:7,loser=winner===6?7:6,next=(claims.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<ConciergeReceipt>).value;
  expect((await service.staffList(actor(loser),token(loser),property)).items.some(x=>x.orderId===r.orderId)).toBe(false);
  await expect(act(next,'answer',{message:'Wrong assignee'},loser)).rejects.toThrow('SERVICE_FORBIDDEN');
  const released=await act(next,'release',{},winner);expect(released.stage).toBe('requested');expect((await act(released,'claim',{},loser)).stage).toBe('working');
 });
 it('rejects foreign ownership, actor spoofing, unrelated roles, scope and direct writes',async()=>{
  const f=await fixture(),r=await service.request(f.a.token,randomUUID(),f.body),other=await account();
  await expect(service.guestList(other.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(service.guestAct(other.token,r.orderId,randomUUID(),command(r,'cancel'))).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(act(r,'claim',{},2)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.staffList({...actor(6),userId:id(7)},token(6),property)).rejects.toThrow('STAFF_ACTOR_MISMATCH');
  await expect(service.staffList(actor(6),token(6),randomUUID())).rejects.toThrow('SERVICE_FORBIDDEN');
  expect((await run("UPDATE concierge_requests SET stage='cancelled' WHERE order_id=$1",[r.orderId])).rowCount).toBe(0);
  await guest.logout(f.a.token);await expect(service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'cancel'))).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
 it('requires property opt-in, valid stay time, exact fields and local pilot',async()=>{
  const f=await fixture();await expect(service.request(f.a.token,randomUUID(),{...f.body,requestedFor:'2000-01-01T00:00:00.000Z'})).rejects.toThrow('SERVICE_TIME_INVALID');
  await expect(service.request(f.a.token,randomUUID(),{...f.body,partySize:0})).rejects.toThrow('SERVICE_INPUT_INVALID');
  await expect(service.request(f.a.token,randomUUID(),{...f.body,actorId:id(6)})).rejects.toThrow('SERVICE_INPUT_INVALID');
  await run("UPDATE service_catalog SET active=false WHERE execution_kind='concierge'");await expect(service.request(f.a.token,randomUUID(),f.body)).rejects.toThrow('SERVICE_UNAVAILABLE');
  vi.stubEnv('NODE_ENV','production');await expect(service.guestList(f.a.token,f.r)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
 });
 it('allows guest cancellation without closing another live request or posting money',async()=>{
  const f=await fixture(),r=await act(await service.request(f.a.token,randomUUID(),f.body),'claim');
  const cancelled=await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'cancel'));expect(cancelled.stage).toBe('cancelled');
  expect((await service.guestList(f.a.token,f.r)).items[0].stage).toBe('cancelled');
  await expect(act(cancelled,'answer',{message:'Too late'})).rejects.toThrow('SERVICE_TRANSITION_INVALID');
 });
 it('bounds UTF-8 history and pages without hiding messages or blocking closure',async()=>{
  const f=await fixture();let r=await act(await service.request(f.a.token,randomUUID(),f.body),'claim');
  for(let i=0;i<10;i++)r=await act(r,'message',{message:'漢'.repeat(500)});
  await expect(act(r,'message',{message:'漢'.repeat(500)})).rejects.toThrow('SERVICE_MESSAGE_LIMIT');
  r=await act(r,'answer',{message:'Done'});await service.guestAct(f.a.token,r.orderId,randomUUID(),command(r,'close'));
  await service.request(f.a.token,randomUUID(),f.body);await service.request(f.a.token,randomUUID(),f.body);
  const first=await service.guestList(f.a.token,f.r);expect(first.items).toHaveLength(2);expect(first.nextCursor).toBeTruthy();
  expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(131072);
  const second=await service.guestList(f.a.token,f.r,first.nextCursor);expect(second.items).toHaveLength(1);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(x=>x.orderId)).size).toBe(3);
 });

});
