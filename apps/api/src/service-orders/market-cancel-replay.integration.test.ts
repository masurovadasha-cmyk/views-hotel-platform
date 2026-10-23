import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from '../guest-identity/guest-email.registry';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {MarketService} from './market.service';
import {SupplyStocktakeService} from '../supply/supply-stocktake.service';
const db=new DatabaseService(),mail=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
mail.register({send:async m=>{messages.push(m);return {accepted:true};}});
const guest=new GuestEmailService(db,mail,new SecurityRateLimitService(db)),staff=new StaffAuthService(db),service=new MarketService(db,guest,staff);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',manager='76800000-0000-4000-8000-000000000001',warehouse='76900000-0000-4000-8000-000000000001';
// Dedicated synthetic product outside the other suites' fixture ranges.
const item='76910000-0000-4000-8000-000000000047',total='9007199254740993';let stocked=false;
const actor=(id=manager)=>({organizationId:org,userId:id,membershipId:id,requestId:randomUUID()});
const run=(sql:string,args:unknown[]=[])=>db.withActor(actor(),c=>c.query(sql,args));
const stock=(sql:string,args:unknown[]=[])=>db.withActor(actor(warehouse),c=>c.query(sql,args));
const roleSql='SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user',runtimeRole={role:'views_app',rolsuper:false,rolbypassrls:false};
async function fixture(cached=false){
 if(!stocked){const b=(await stock('SELECT quantity::text,revision::text FROM supply_balances WHERE item_id=$1',[item])).rows[0];await new SupplyStocktakeService(db).confirm(actor(warehouse),randomUUID(),{propertyId:property,itemId:item,countedQuantity:'100',expectedQuantity:b.quantity,expectedRevision:b.revision,reason:'Synthetic cancel race stock'});stocked=true;}
 const net=()=>randomBytes(32).toString('hex'),link=await guest.requestLink('market-replay-'+randomUUID()+'@views.invalid','ru',net()),a=await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,net());
 const r=randomUUID(),g=randomUUID(),u=randomUUID(),type=randomUUID(),key=randomUUID();
 await run("INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Market replay')",[g,a.userId,org]);
 await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,property,type]);
 await run("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,org,property,u,g]);
 const revision=(await run('UPDATE service_catalog SET active=true,price_minor=$2 WHERE id=$1 RETURNING revision',[item,total])).rows[0].revision;
 let o=await service.request(a.token,randomUUID(),{reservationId:r,lines:[{serviceId:item,quantity:1,expectedRevision:revision}],expectedTotalMinor:total});
 const body={action:'cancel',expectedRevision:o.revision},receipt=cached?await service.guestAct(a.token,o.orderId,key,body):null;
 return {a,r,g,key,body,o,receipt};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function snapshot(f:Fixture){return {...(await run(`SELECT to_jsonb(m) market,to_jsonb(o) orders,
 (SELECT coalesce(jsonb_agg(to_jsonb(successor) ORDER BY successor.order_id),'[]') FROM market_orders successor WHERE successor.replaces_order_id=o.id) successors,
 (SELECT count(*)::int FROM audit_log WHERE entity_id=o.id) audits,(SELECT count(*)::int FROM outbox_events WHERE aggregate_id=o.id) events,
 (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM folio_entries e WHERE source_id=o.id) entries
 FROM market_orders m JOIN service_orders o ON o.id=m.order_id WHERE o.id=$1`,[f.o.orderId])).rows[0],stock:(await stock("SELECT to_jsonb(b) balance,(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM supply_movements v WHERE reference=$2) movements FROM supply_balances b WHERE item_id=$1",[item,'V Market '+f.o.orderId])).rows[0]};}
type Lock='command'|'stay'|'profile'|'item'|'order';
async function blocked(f:Fixture,lock:Lock,revoke:()=>Promise<unknown>){
 const locker=new Client({connectionString:process.env.DATABASE_URL}),caller=new Client({connectionString:process.env.DATABASE_URL});let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
 try{
  await locker.connect();await caller.connect();for(const c of [locker,caller]){expect((await c.query(roleSql)).rows[0]).toEqual(runtimeRole);await c.query("SET statement_timeout='4s'");}
  await locker.query('BEGIN');
  if(lock==='command')await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::text||':'||$2::text,0))",[f.a.userId,f.key]);
  else{const user=lock==='item'?warehouse:manager;await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,user]);
   const queries={stay:['reservations','id',f.r],profile:['guest_profiles','id',f.g],item:['supply_items','id',item],order:['service_orders','id',f.o.orderId]} as const,[table,column,id]=queries[lock];
   // Runtime cannot UPDATE immutable items; use the real stock trigger, then roll back its synthetic issue.
   if(lock==='item')await locker.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'issue',-1,'Synthetic cancel lock',$4,$4)",[org,property,item,warehouse]);
   else expect((await locker.query(`SELECT ${column} FROM ${table} WHERE ${column}=$1 FOR UPDATE`,[id])).rowCount).toBe(1);
  }
  const pid=(await caller.query('SELECT pg_backend_pid() pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  pending=caller.query('SELECT app.market_guest_act($1,$2,$3,$4) value',[createHash('sha256').update(f.a.token).digest('hex'),f.o.orderId,f.key,f.body]).then(r=>({value:r.rows[0].value}),error=>({error}));
  let waiting=false;const deadline=Date.now()+2000;while(Date.now()<deadline){waiting=(await locker.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AND $2=ANY(pg_blocking_pids($1)) waiting',[pid,blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
  expect(waiting,`caller must wait for ${lock}`).toBe(true);await revoke();await locker.query(lock==='item'?'ROLLBACK':'COMMIT');return await pending;
 }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;await caller.end();await locker.end();}
}
beforeAll(async()=>{expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');expect((await db.query(roleSql)).rows[0]).toEqual(runtimeRole);});
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_SERVICE_ORDER_PILOT_ENABLED:'true',VIEWS_MARKET_PILOT_ENABLED:'true',VIEWS_SUPPLY_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'de'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>{try{await run('UPDATE service_catalog SET active=false,price_minor=100 WHERE id=$1',[item]);}finally{await db.onModuleDestroy();}});
describe.sequential('market cancel authorization after waits',()=>{
 it.each([[true,'logout'],[true,'unlink'],[true,'reassign'],[false,'logout'],[false,'unlink'],[false,'reassign']] as const)('cached=%s rejects %s after command wait',async(cached,revocation)=>{
  const f=await fixture(cached),before=await snapshot(f),result=await blocked(f,'command',async()=>{
   if(revocation==='logout')return guest.logout(f.a.token);if(revocation==='unlink')return run('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.g]);
   const cancel=randomUUID();await run("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Replacement')",[cancel,org]);return run('UPDATE reservations SET primary_guest_id=$2 WHERE id=$1',[f.r,cancel]);
  });
  expect(result).toMatchObject({error:revocation==='logout'?{code:'28000',message:'SERVICE_SESSION_INVALID'}:{code:'P0002',message:'SERVICE_STAY_NOT_FOUND'}});expect(result).not.toHaveProperty('value');expect(await snapshot(f)).toEqual(before);
 });
 it.each([[false,'stay'],[true,'stay'],[false,'profile'],[true,'profile'],[false,'item'],[false,'order']] as const)('cached=%s rejects logout after %s wait',async(cached,lock)=>{
  const f=await fixture(cached),before=await snapshot(f);expect(await blocked(f,lock,()=>guest.logout(f.a.token))).toMatchObject({error:{code:'28000',message:'SERVICE_SESSION_INVALID'}});expect(await snapshot(f)).toEqual(before);
 });
 it('allows warehouse cancellation after ready without issuing stock or charging',async()=>{
  const f=await fixture();let o=f.o;
  for(const action of ['pick','ready'])o=await service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action,expectedRevision:o.revision,...(action==='ready'?{checklist:{quantities:true,expiry:true,packaging:true}}:{})});
  const before=await snapshot(f),receipt=await service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action:'cancel',expectedRevision:o.revision});
  expect(receipt.stage).toBe('cancelled');const after=await snapshot(f);expect(after.stock).toEqual(before.stock);expect(after.entries).toEqual(before.entries);expect(after.orders.status).toBe('cancelled');
 });
 it.each(['reserved','picking','ready'] as const)('staff cancel %s releases reserve exactly once and shares the guest history',async(stage)=>{
  const f=await fixture();let o=f.o;
  for(const action of stage==='reserved'?[]:stage==='picking'?['pick']:['pick','ready'])o=await service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action,expectedRevision:o.revision,...(action==='ready'?{checklist:{quantities:true,expiry:true,packaging:true}}:{})});
  const before=await snapshot(f),body={action:'cancel',expectedRevision:o.revision};
  const available=()=>service.catalog(f.a.token,f.r).then(x=>{const row=x.items.find(i=>i.id===item);expect(row).toHaveProperty('availableQuantity');return BigInt((row as unknown as {availableQuantity:string}).availableQuantity);});const held=await available();
  const receipts=await Promise.all([0,1].map(()=>service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,f.key,body)));
  expect(receipts.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect(receipts[0].stage).toBe('cancelled');expect(await available()).toBe(held+1n);
  const after=await snapshot(f);expect(after.stock).toEqual(before.stock);expect(after.entries).toEqual(before.entries);expect(after.audits-before.audits).toBe(1);expect(after.events-before.events).toBe(1);
  expect((await service.guestList(f.a.token,f.r)).items).toContainEqual(expect.objectContaining({orderId:o.orderId,stage:'cancelled'}));
  expect((await service.staffList(actor(warehouse),'b1'.repeat(32),property)).items).toContainEqual(expect.objectContaining({orderId:o.orderId,stage:'cancelled'}));
  await expect(service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,f.key,{...body,expectedRevision:999})).rejects.toThrow('SERVICE_COMMAND_CONFLICT');expect(await snapshot(f)).toEqual(after);
 });
 it('denies a foreign guest, wrong staff role, mismatched tenant and direct mutation',async()=>{
  const f=await fixture(),foreign=await fixture(),before=await snapshot(f);
  await expect(service.guestAct(foreign.a.token,f.o.orderId,randomUUID(),f.body)).rejects.toThrow('SERVICE_STAY_NOT_FOUND');
  const procurement='76900000-0000-4000-8000-000000000002';
  await expect(service.staffAct(actor(procurement),'b2'.repeat(32),f.o.orderId,randomUUID(),f.body)).rejects.toThrow('SERVICE_FORBIDDEN');
  await expect(service.staffAct({...actor(warehouse),organizationId:randomUUID()},'b1'.repeat(32),f.o.orderId,randomUUID(),f.body)).rejects.toThrow('STAFF_ACTOR_MISMATCH');
  expect((await stock("UPDATE market_orders SET stage='cancelled' WHERE order_id=$1",[f.o.orderId])).rowCount).toBe(0);expect(await snapshot(f)).toEqual(before);
 });
 it.each(['picking','ready'] as const)('guest cannot cancel %s',async(stage)=>{
  const f=await fixture();let o=await service.staffAct(actor(warehouse),'b1'.repeat(32),f.o.orderId,randomUUID(),{action:'pick',expectedRevision:f.o.revision});
  if(stage==='ready')o=await service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action:'ready',expectedRevision:o.revision,checklist:{quantities:true,expiry:true,packaging:true}});
  const before=await snapshot(f);await expect(service.guestAct(f.a.token,o.orderId,randomUUID(),{action:'cancel',expectedRevision:o.revision})).rejects.toThrow('SERVICE_TRANSITION_INVALID');expect(await snapshot(f)).toEqual(before);
 });
 it('serializes cancellation against handover with one stock outcome',async()=>{
  const f=await fixture();let o=f.o;for(const action of ['pick','ready'])o=await service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action,expectedRevision:o.revision,...(action==='ready'?{checklist:{quantities:true,expiry:true,packaging:true}}:{})});
  const before=await snapshot(f),results=await Promise.allSettled(['cancel','handover'].map(action=>service.staffAct(actor(warehouse),'b1'.repeat(32),o.orderId,randomUUID(),{action,expectedRevision:o.revision})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const after=await snapshot(f);expect(after.entries).toEqual(before.entries);
  if(after.market.stage==='cancelled'){expect(after.stock).toEqual(before.stock);expect(after.orders.status).toBe('cancelled');}
  else{expect(after.market.stage).toBe('handed_over');expect(BigInt(after.stock.balance.quantity)).toBe(BigInt(before.stock.balance.quantity)-1n);expect(after.stock.movements).toHaveLength(1);}
  expect(after.audits-before.audits).toBe(1);expect(after.events-before.events).toBe(1);
 });
 it('keeps the private cancellation function inaccessible to the runtime',async()=>{
  expect((await db.query("SELECT has_function_privilege(current_user,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='service_private' AND p.proname='market_cancel'")).rows).toEqual([{allowed:false}]);
 });

});
