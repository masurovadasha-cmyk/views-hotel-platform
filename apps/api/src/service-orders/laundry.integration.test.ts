import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {LaundryService,type LaundryReceipt} from './laundry.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new LaundryService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n===5?2:n),membershipId:id(n),requestId:randomUUID()});
const token=(n=1)=>('a'+n).repeat(32);
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
let slot=0;
async function account(){const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('service-'+randomUUID()+'@views.invalid','ru',net());return guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());}
async function fixture(price='100'){
 const a=await account(),r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Guest')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Service fixture\"}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1::uuid,$2,$3,$1::uuid::text)',[u,property,type]);
 await run(`INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot)
 VALUES($1::uuid,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')`,[r,org,property,u,g]);
 await run(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,commission_bps,active,execution_kind,duration_minutes) VALUES($1::uuid,$2,$3,$1::uuid::text,'{"ru":"Тестовая прачечная","en":"Synthetic laundry","uz":"Sinov kir yuvish"}','UZS',$4,1000,true,'laundry',40)`,[s,org,property,price]);
 const body={reservationId:r,serviceId:s,expectedRevision:1,declaredCount:4,preferences:'No perfume',pickupAt:new Date(Date.now()+(++slot)*3600000).toISOString()};return {a,r,g,s,u,body};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
const command=(i:LaundryReceipt,action:string,extra:Record<string,unknown>={})=>({action,expectedRevision:i.revision,...extra});
const quote={items:[{tag:'001',description:'White shirt',priceMinor:'9007199254740993'},{tag:'002',description:'Trousers',priceMinor:'7'}],returnBy:new Date(Date.now()+3*86400000).toISOString()};
async function staffAct(i:LaundryReceipt,action:string,extra:Record<string,unknown>={},who=1){return service.staffAct(actor(who),token(who),i.intakeId,randomUUID(),command(i,action,extra));}
async function prepared(){const f=await fixture(),requested=await service.request(f.a.token,randomUUID(),f.body),quoted=await staffAct(await staffAct(requested,'receive'),'quote',quote);return {f,requested,quoted};}
async function delivered(){const p=await prepared();let i=await service.guestAct(p.f.a.token,p.quoted.intakeId,randomUUID(),command(p.quoted,'accept',{expectedTotalMinor:p.quoted.totalMinor}));i=await staffAct(i,'wash');i=await staffAct(i,'ready');i=await staffAct(i,'deliver');return {...p,i};}
describe.sequential('laundry consent and custody / real PostgreSQL',()=>{
 it('creates a frozen shared order only after consent and charges once on guest receipt',async()=>{
  const {f,requested,quoted}=await prepared();expect((await service.catalog(f.a.token,f.r)).items.find(x=>x.id===f.s)).toMatchObject({priceMinor:'100',revision:1});expect(requested).toMatchObject({estimateMinor:'400',orderId:null});expect(quoted).toMatchObject({stage:'quoted',totalMinor:'9007199254741000'});
  expect((await run('SELECT * FROM service_orders WHERE reservation_id=$1',[f.r])).rowCount).toBe(0);
  await expect(staffAct(quoted,'wash')).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  await expect(service.guestAct(f.a.token,quoted.intakeId,randomUUID(),command(quoted,'accept',{expectedTotalMinor:'400'}))).rejects.toThrow('SERVICE_PRICE_CHANGED');
  let i=await service.guestAct(f.a.token,quoted.intakeId,randomUUID(),command(quoted,'accept',{expectedTotalMinor:quoted.totalMinor}));expect(i.orderId).toBeTruthy();
  await expect(staffAct(i,'quote',quote)).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  i=await staffAct(i,'wash');await expect(run("UPDATE service_orders SET status='completed' WHERE id=$1",[i.orderId])).rejects.toMatchObject({code:'23514'});
  i=await staffAct(i,'ready');i=await staffAct(i,'deliver');expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[i.orderId])).rowCount).toBe(0);
  const key=randomUUID(),body=command(i,'confirm_receipt');const replies=await Promise.all([service.guestAct(f.a.token,i.intakeId,key,body),service.guestAct(f.a.token,i.intakeId,key,body)]);
  expect(replies.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect(replies[0].stage).toBe('closed');
  expect((await run('SELECT amount_minor::text FROM folio_entries WHERE source_id=$1',[i.orderId])).rows).toEqual([{amount_minor:'9007199254741000'}]);
  expect((await run('SELECT status,snapshot FROM service_orders WHERE id=$1',[i.orderId])).rows[0]).toMatchObject({status:'completed',snapshot:{execution:'laundry',items:quote.items}});
  expect((await service.guestList(f.a.token,f.r)).items[0].stage).toBe('closed');
 });
 it('serializes duplicate requests and competing acceptance/requote',async()=>{
  const f=await fixture(),key=randomUUID(),rows=await Promise.all([service.request(f.a.token,key,f.body),service.request(f.a.token,key,f.body)]);expect(rows.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  await expect(service.request(f.a.token,key,{...f.body,declaredCount:5})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  const q=await staffAct(await staffAct(rows[0],'receive'),'quote',quote);
  const outcomes=await Promise.allSettled([service.guestAct(f.a.token,q.intakeId,randomUUID(),command(q,'accept',{expectedTotalMinor:q.totalMinor})),staffAct(q,'quote',{...quote,items:[{tag:'003',description:'Other item',priceMinor:'200'}]})]);
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(outcomes.find(r=>r.status==='rejected')).toMatchObject({reason:{message:'SERVICE_REVISION_CHANGED'}});
 });
 it('retains custody after rejection until unprocessed items are returned, with no charge',async()=>{
  const {f,quoted}=await prepared();await expect(service.guestAct(f.a.token,quoted.intakeId,randomUUID(),command(quoted,'cancel'))).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  const refused=await service.guestAct(f.a.token,quoted.intakeId,randomUUID(),command(quoted,'reject'));expect(refused.stage).toBe('awaiting_return');
  await expect(staffAct(refused,'wash')).rejects.toThrow('SERVICE_TRANSITION_INVALID');expect((await staffAct(refused,'return_unprocessed')).stage).toBe('cancelled');
  expect((await run('SELECT * FROM service_orders WHERE reservation_id=$1',[f.r])).rowCount).toBe(0);
 });
 it('denies foreign guest, worker, spoofed actor, direct writes and revoked session',async()=>{
  const {f,quoted}=await prepared(),other=await account();await expect(service.guestList(other.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(service.guestAct(other.token,quoted.intakeId,randomUUID(),command(quoted,'reject'))).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(staffAct(quoted,'quote',quote,2)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.staffList({...actor(),userId:id(2)},token(),property)).rejects.toThrow('STAFF_ACTOR_MISMATCH');
  await expect(service.staffList(actor(),token(),randomUUID())).rejects.toThrow('SERVICE_FORBIDDEN');
  expect((await run("UPDATE laundry_intakes SET stage='cancelled' WHERE id=$1",[quoted.intakeId])).rowCount).toBe(0);
  await guest.logout(f.a.token);await expect(service.guestAct(f.a.token,quoted.intakeId,randomUUID(),command(quoted,'reject'))).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
 it('rolls back receipt, order completion and outbox when folio is closed',async()=>{
  const {f,i}=await delivered();await run("INSERT INTO guest_folios(organization_id,property_id,reservation_id,currency,status,closed_at) VALUES($1,$2,$3,'UZS','closed',now())",[org,property,f.r]);
  await expect(service.guestAct(f.a.token,i.intakeId,randomUUID(),command(i,'confirm_receipt'))).rejects.toThrow('FOLIO_NOT_OPEN');
  expect((await service.guestList(f.a.token,f.r)).items[0]).toMatchObject({stage:'delivered',revision:i.revision});
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[i.orderId])).rowCount).toBe(0);
  expect((await run("SELECT * FROM outbox_events WHERE aggregate_id=$1 AND event_type='laundry.confirm_receipt'",[i.intakeId])).rowCount).toBe(0);
 });
 it('rejects invalid catalog/time and remains disabled outside the local pilot',async()=>{
  const f=await fixture();await expect(service.request(f.a.token,randomUUID(),{...f.body,pickupAt:'2000-01-01T00:00:00.000Z'})).rejects.toThrow('SERVICE_TIME_INVALID');
  await run('UPDATE service_catalog SET active=false WHERE id=$1',[f.s]);await expect(service.request(f.a.token,randomUUID(),f.body)).rejects.toThrow('SERVICE_UNAVAILABLE');
  vi.stubEnv('NODE_ENV','production');await expect(service.guestList(f.a.token,f.r)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
 });
});
