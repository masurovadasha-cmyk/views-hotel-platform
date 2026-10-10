import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {ServiceOrderService,type ServiceReceipt} from './service-order.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new ServiceOrderService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const id=(n:number)=>'76800000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(n=1)=>({organizationId:org,userId:id(n===5?2:n),membershipId:id(n),requestId:randomUUID()});
const token=(n=1)=>('a'+n).repeat(32);
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
let slot=0;
async function account(){const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('service-'+randomUUID()+'@views.invalid','ru',net());return guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());}
async function fixture(price='9007199254740993'){
 const a=await account(),r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),s=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Guest')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Service fixture\"}',2)",[type,property]);
 await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1::uuid,$2,$3,$1::uuid::text)',[u,property,type]);
 await run(`INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot)
 VALUES($1::uuid,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '365 days','UZS',0,'{}')`,[r,org,property,u,g]);
 await run(`INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,commission_bps,active,execution_kind,duration_minutes) VALUES($1::uuid,$2,$3,$1::uuid::text,'{"ru":"Тестовая уборка","en":"Synthetic cleaning","uz":"Sinov tozalash"}','UZS',$4,1000,true,'cleaning',40)`,[s,org,property,price]);
 const body={reservationId:r,serviceId:s,expectedRevision:1,expectedPriceMinor:price,requestedFor:new Date(Date.now()+(++slot)*3600000).toISOString()};return {a,r,g,s,u,body};
}
async function request(f:Awaited<ReturnType<typeof fixture>>,key=randomUUID()){return service.request(f.a.token,key,f.body);}
async function act(o:ServiceReceipt,action:string,fields:Record<string,unknown>={},who=1,key=randomUUID()){return service.act(actor(who),token(who),o.orderId,key,{action,expectedRevision:o.revision,...fields});}
async function inspection(f:Awaited<ReturnType<typeof fixture>>){let o=await request(f);o=await act(o,'assign',{assigneeId:id(2)});o=await act(o,'start',{},2);return act(o,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Synthetic checklist inspected visually'},2);}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('single Core service order / inspected cleaning',()=>{
 it('guest cancels an assigned order once, without a charge, and releases the employee slot',async()=>{
  const f=await fixture(),o=await act(await request(f),'assign',{assigneeId:id(2)}),key=randomUUID();
  const change={action:'cancel',expectedRevision:o.revision};
  const results=await Promise.all([service.change(f.a.token,o.orderId,key,change),service.change(f.a.token,o.orderId,key,change)]);
  expect(results.filter(x=>!x.idempotentReplay)).toHaveLength(1);expect(results[0]).toMatchObject({stage:'cancelled',revision:3});
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
  expect((await run("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='service.guest_cancel'",[o.orderId])).rows[0].n).toBe(1);
  await expect(act(results[0],'start',{},2)).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  const next=await fixture();next.body.requestedFor=f.body.requestedFor;
  expect((await act(await request(next),'assign',{assigneeId:id(2)})).stage).toBe('assigned');
 });
 it('reschedules using frozen duration and price and updates both queues, preserving the original request',async()=>{
  const f=await fixture('76543'),o=await act(await request(f),'assign',{assigneeId:id(2)});
  await run('UPDATE service_catalog SET price_minor=99999,duration_minutes=90 WHERE id=$1',[f.s]);
  const time=new Date(Date.parse(f.body.requestedFor)+600000).toISOString(),key=randomUUID();
  const body={action:'reschedule',expectedRevision:o.revision,requestedFor:time};
  const changed=await service.change(f.a.token,o.orderId,key,body);
  expect(changed).toMatchObject({revision:3,stage:'assigned',totalMinor:'76543'});
  expect(await service.change(f.a.token,o.orderId,key,body)).toMatchObject({idempotentReplay:true});
  for(const page of [await service.orders(f.a.token,f.r),await service.queue(actor(),token(),property)]){
   const row=page.items.find(x=>x.orderId===o.orderId)!;expect(new Date(row.requestedFor as string).toISOString()).toBe(time);
  }
  const stored=(await run('SELECT o.requested_for,extract(epoch FROM upper(t.scheduled_period)-lower(t.scheduled_period))::int seconds FROM service_orders o JOIN service_cleaning_tasks t ON t.order_id=o.id WHERE o.id=$1',[o.orderId])).rows[0];
  expect(new Date(stored.requested_for).toISOString()).toBe(f.body.requestedFor);expect(stored.seconds).toBe(2400);
  await expect(service.change(f.a.token,o.orderId,key,{...body,requestedFor:f.body.requestedFor})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
 });
 it('rejects foreign ownership, stale revision, out-of-stay time and overlapping worker changes atomically',async()=>{
  const f=await fixture(),g=await fixture(),o=await act(await request(f),'assign',{assigneeId:id(3)}),other=await act(await request(g),'assign',{assigneeId:id(3)});
  await expect(service.change(g.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:2})).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await expect(service.change(f.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:1})).rejects.toThrow('SERVICE_REVISION_CHANGED');
  for(const time of ['2000-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z'])await expect(service.change(f.a.token,o.orderId,randomUUID(),{action:'reschedule',expectedRevision:2,requestedFor:time})).rejects.toThrow('SERVICE_TIME_INVALID');
  await expect(service.change(f.a.token,o.orderId,randomUUID(),{action:'reschedule',expectedRevision:2,requestedFor:g.body.requestedFor})).rejects.toThrow('SERVICE_ASSIGNEE_BUSY');
  expect((await service.orders(f.a.token,f.r)).items[0]).toMatchObject({revision:2,stage:'assigned'});
  expect((await run("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type LIKE 'service.guest_%'",[o.orderId])).rows[0].n).toBe(0);
  await guest.logout(f.a.token);await expect(service.change(f.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:2})).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  expect(other.stage).toBe('assigned');
 });
 it('serializes a guest cancellation racing with a worker start',async()=>{
  const f=await fixture(),o=await act(await request(f),'assign',{assigneeId:id(2)});
  const results=await Promise.allSettled([service.change(f.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:o.revision}),act(o,'start',{},2)]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.find(x=>x.status==='rejected')).toMatchObject({reason:{message:'SERVICE_REVISION_CHANGED'}});
  const current=(await service.orders(f.a.token,f.r)).items[0];expect(['working','cancelled']).toContain(current.stage);
  if(current.stage==='working')await expect(service.change(f.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:current.revision})).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
 });
 it('executes guest request, worker checklist, independent inspection and one exact frozen folio charge',async()=>{
  const f=await fixture(),catalog=await service.catalog(f.a.token,f.r);expect(catalog.items.some(x=>x.id===f.s&&x.priceMinor===f.body.expectedPriceMinor)).toBe(true);
  let o=await request(f);await run("UPDATE service_catalog SET price_minor=100,name='{\"en\":\"Changed later\"}' WHERE id=$1",[f.s]);
  o=await act(o,'assign',{assigneeId:id(2)});o=await act(o,'start',{},2);o=await act(o,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Ready'},2);
  expect((await run("SELECT * FROM folio_entries WHERE source_id=$1",[o.orderId])).rowCount).toBe(0);
  const key=randomUUID(),done=await act(o,'approve',{note:'Independent inspection passed'},1,key);
  expect(done).toMatchObject({stage:'done',status:'completed',revision:5});expect(await act(o,'approve',{note:'Independent inspection passed'},1,key)).toEqual({...done,idempotentReplay:true});
  const rows=(await run('SELECT amount_minor::text,label,source_type FROM folio_entries WHERE source_id=$1',[o.orderId])).rows;expect(rows).toEqual([{amount_minor:f.body.expectedPriceMinor,label:{ru:'Тестовая уборка',en:'Synthetic cleaning',uz:'Sinov tozalash'},source_type:'service_order'}]);
  const orders=await service.orders(f.a.token,f.r);expect(orders.items[0]).toMatchObject({stage:'done',totalMinor:f.body.expectedPriceMinor});expect(JSON.stringify(orders)).not.toMatch(/completionNote|membership|inspectionNote|guest_profile/);
  expect((await run('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1',[o.orderId])).rows[0].n).toBe(5);
  expect((await run('SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1',[o.orderId])).rows[0].n).toBe(5);
 });
 it('serializes duplicate requests and approval races, and detects changed payload',async()=>{
  const f=await fixture('12345'),key=randomUUID(),receipts=await Promise.all(Array.from({length:4},()=>request(f,key)));expect(receipts.filter(x=>!x.idempotentReplay)).toHaveLength(1);expect(new Set(receipts.map(x=>x.orderId)).size).toBe(1);
  await expect(service.request(f.a.token,key,{...f.body,expectedPriceMinor:'12346'})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');
  let o=receipts[0];o=await act(o,'assign',{assigneeId:id(2)});o=await act(o,'start',{},2);o=await act(o,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Ready'},2);
  const results=await Promise.allSettled([act(o,'approve',{note:'One'}),act(o,'approve',{note:'Two'})]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect((await run('SELECT count(*)::int n FROM folio_entries WHERE source_id=$1',[o.orderId])).rows[0].n).toBe(1);
 });
 it('rejects stale prices and bad time, foreign guests, unlinked account and cross-property catalogue',async()=>{
  const f=await fixture('100'),stranger=await account();await expect(service.request(stranger.token,randomUUID(),f.body)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  await run('UPDATE service_catalog SET price_minor=101 WHERE id=$1',[f.s]);await expect(request(f)).rejects.toThrow('SERVICE_PRICE_CHANGED');
  await expect(service.request(f.a.token,randomUUID(),{...f.body,expectedRevision:2,expectedPriceMinor:'101',requestedFor:'2000-01-01T00:00:00.000Z'})).rejects.toThrow('SERVICE_TIME_INVALID');
  const foreign=randomUUID();await run("INSERT INTO properties(id,organization_id,name,city,address,country_code,timezone) SELECT $1,organization_id,'{\"en\":\"Other\"}',city,address,country_code,timezone FROM properties WHERE id=$2",[foreign,property]);
  const other=randomUUID();await run("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind,duration_minutes) VALUES($1::uuid,$2,$3,$1::uuid::text,'{}','UZS',100,true,'cleaning',40)",[other,org,foreign]);
  await expect(service.request(f.a.token,randomUUID(),{...f.body,serviceId:other})).rejects.toThrow('SERVICE_UNAVAILABLE');
  await run('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.g]);await expect(service.catalog(f.a.token,f.r)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
 });
 it('rejects worker/reader escalation, spoofed actors and self-inspection through another membership',async()=>{
  const f=await fixture(),o=await inspection(f);
  const assignees=(await service.assignees(actor(),token(),property)).items.map((x:{id:string})=>x.id);expect(assignees).toEqual(expect.arrayContaining([id(2),id(3)]));expect(assignees).not.toContain(id(1));expect(assignees).not.toContain(id(4));
  await expect(service.assignees(actor(2),token(2),property)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.assignees(actor(),token(),'00000000-0000-0000-0000-000000000002')).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.queue(actor(4),token(4),property)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.queue({...actor(),userId:id(2)},token(),property)).rejects.toThrow('STAFF_ACTOR_MISMATCH');
  await expect(act(o,'approve',{note:'Self'},2)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(act(o,'approve',{note:'Same person other role'},5)).rejects.toThrow('SERVICE_SELF_INSPECTION_FORBIDDEN');
  expect((await service.queue(actor(3),token(3),property)).items.some(x=>x.orderId===o.orderId)).toBe(false);
  await expect(act(o,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Not mine'},3)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.queue({...actor(),organizationId:'00000000-0000-0000-0000-000000000001'},token(),property)).rejects.toThrow('STAFF_ACTOR_MISMATCH');
 });
 it('sends failed inspection back for rework without charging; only a new submission permits acceptance',async()=>{
  const f=await fixture(),o=await inspection(f);let retry=await act(o,'reject',{note:'Floor needs rework'});expect(retry.stage).toBe('rework');
  await expect(act(retry,'approve',{note:'Cannot skip rework'})).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  retry=await act(retry,'start',{},2);retry=await act(retry,'submit',{checklist:{linen:true,bathroom:true,floor:true},note:'Reworked'},2);
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);expect((await act(retry,'approve',{note:'Passed'})).stage).toBe('done');
 });
 it('cancels before execution and rejects completion without inspection, invalid assignee and direct sidecar writes',async()=>{
  const f=await fixture(),o=await request(f);
  await expect(act(o,'assign',{assigneeId:id(4)})).rejects.toThrow('SERVICE_ASSIGNEE_INVALID');
  await expect(act(o,'approve',{note:'No work'})).rejects.toThrow('SERVICE_TRANSITION_INVALID');
  expect((await run("UPDATE service_cleaning_tasks SET stage='done' WHERE order_id=$1",[o.orderId])).rowCount).toBe(0);
  await expect(run('SELECT app.staff_cleaning_act($1,$2,$3,$4)',[createHash('sha256').update(token()).digest('hex'),o.orderId,randomUUID(),{action:null,expectedRevision:1}])).rejects.toMatchObject({code:'22023'});
  const assigned=await act(o,'assign',{assigneeId:id(2)}),started=await act(assigned,'start',{},2);
  await expect(run("UPDATE service_orders SET status='completed' WHERE id=$1",[started.orderId])).rejects.toMatchObject({code:'23514'});
  const cancellable=await request(await fixture());
  expect((await act(cancellable,'cancel',{note:'Guest requested cancellation before work'})).stage).toBe('cancelled');
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
  await expect(db.query('SELECT * FROM service_private.commands')).rejects.toMatchObject({code:'42501'});
 });
 it('reserves a staff time window and serializes two competing assignments',async()=>{
  const f=await fixture(),g=await fixture();g.body.requestedFor=f.body.requestedFor;const one=await request(f),two=await request(g);
  const results=await Promise.allSettled([act(one,'assign',{assigneeId:id(3)}),act(two,'assign',{assigneeId:id(3)})]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(results.find(x=>x.status==='rejected')).toMatchObject({reason:{message:'SERVICE_ASSIGNEE_BUSY'}});
 });
 it('rolls back approval, task and outbox if the folio is closed',async()=>{
  const f=await fixture(),o=await inspection(f);await run("INSERT INTO guest_folios(organization_id,property_id,reservation_id,currency,status,closed_at) VALUES($1,$2,$3,'UZS','closed',now())",[org,property,f.r]);
  await expect(act(o,'approve',{note:'Cannot charge closed folio'})).rejects.toThrow('FOLIO_NOT_OPEN');
  expect((await service.orders(f.a.token,f.r)).items[0]).toMatchObject({stage:'inspection',revision:o.revision});
  expect((await run('SELECT * FROM folio_entries WHERE source_id=$1',[o.orderId])).rowCount).toBe(0);
  expect((await run("SELECT * FROM outbox_events WHERE aggregate_id=$1 AND event_type='service.approve'",[o.orderId])).rowCount).toBe(0);
 });
 it('rejects revoked sessions at SQL boundary and remains off in production',async()=>{
  const f=await fixture();await guest.logout(f.a.token);await expect(request(f)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  await expect(db.query('SELECT app.guest_cleaning_catalog($1,$2,NULL)',[createHash('sha256').update(f.a.token).digest('hex'),f.r])).rejects.toMatchObject({code:'28000'});
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','false');await expect(service.queue(actor(),token(),property)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(service.queue(actor(),token(),property)).rejects.toThrow('SERVICE_ORDERS_DISABLED');
 });
});
