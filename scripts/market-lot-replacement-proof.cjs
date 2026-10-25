'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
// Private lot fixtures only. Public commands run under the restricted runtime role.
module.exports=async function lotReplacementProof(db,peer,f){
 const {org,property,item,version,stay,guest}=f,who=randomUUID(),hash=randomBytes(32).toString('hex'),service=randomUUID();
 assert.equal((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 await db.query("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic lot replacement guest')",[who]);
 await db.query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[who,guest]);
 await db.query("INSERT INTO guest_identity_private.email_sessions(user_id,verified_email,token_hash,expires_at) VALUES($1,$1::uuid::text||'@views.invalid',$2,clock_timestamp()+interval '1 hour')",[who,hash]);
 const name={en:'Synthetic lot replacement item',ru:'Тестовый товар замены партии',uz:'Partiyani almashtirish sinov mahsuloti'};
 await db.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,$4,'UZS',100,true,'market')",[service,org,property,name]);
 await db.query("INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) VALUES($1,$2,$3,'UZS',$4)",[service,org,property,item]);
 const foreignService=randomUUID(),foreignOrg='10000000-0000-4000-8000-000000000001',foreignProperty='10000000-0000-4000-8000-000000000002';
 await db.query("INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) VALUES($1,$2,$3,upper($1::uuid::text),'Synthetic foreign replacement item','piece')",[foreignService,foreignOrg,foreignProperty]);
 await db.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,$4,'UZS',100,true,'market')",[foreignService,foreignOrg,foreignProperty,name]);
 await db.query("INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) VALUES($1,$2,$3,'UZS',$1)",[foreignService,foreignOrg,foreignProperty]);
 const lines=[{serviceId:service,quantity:2,expectedRevision:1}];
 async function runtime(c,sql,args){await c.query('BEGIN; SET LOCAL ROLE views_app');try{const value=(await c.query(sql,args)).rows[0].value;await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}}
 const call=(c,a)=>runtime(c,'SELECT app.market_guest_act($1,$2,$3,$4) value',[hash,a.oid,a.key,a.body]);
 async function fixture(){
  const order=await runtime(peer,'SELECT app.market_request($1,$2,$3) value',[hash,randomUUID(),{reservationId:stay,lines,expectedTotalMinor:'200'}]);
  await db.query("INSERT INTO market_lot_reservations(organization_id,property_id,order_id,item_id,movement_id,lot_code,expires_on,quantity) VALUES($1,$2,$3,$4,$5,'HELD','2099-01-01',2)",[org,property,order.orderId,item,version]);
  return {oid:order.orderId,key:randomUUID(),body:{action:'replace_order',expectedRevision:order.revision,lines,expectedTotalMinor:'200'}};
 }
 const cancel=oid=>call(peer,{oid,key:randomUUID(),body:{action:'cancel',expectedRevision:1}});
 const snapshot=async a=>(await db.query(`SELECT to_jsonb(m) market,to_jsonb(o) service,
 (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM market_lot_reservations r WHERE order_id=$1) lots,
 (SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY order_id),'[]') FROM market_orders n WHERE replaces_order_id=$1) successors,
 (SELECT count(*)::int FROM service_private.commands WHERE actor_user_id=$2) commands,
 (SELECT count(*)::int FROM audit_log WHERE entity_id=$1) audit,
 (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1) outbox,
 (SELECT count(*)::int FROM folio_entries WHERE source_id IN(SELECT order_id FROM market_orders WHERE order_id=$1 OR replaces_order_id=$1)) folio,
 (SELECT to_jsonb(b) FROM supply_balances b WHERE item_id=$3) stock,
 (SELECT count(*)::int FROM supply_movements WHERE item_id=$3) movements,
 (SELECT coalesce(sum(l.quantity),0)::int FROM market_order_lines l JOIN market_orders n USING(order_id) WHERE l.item_id=$3 AND n.stage IN('reserved','picking','ready')) reserved
 FROM market_orders m JOIN service_orders o ON o.id=m.order_id WHERE m.order_id=$1`,[a.oid,who,item])).rows[0];
 // Baseline: deferred terminal guard rejects replacement with LOT_RESERVE_ACTIVE.
 const a=await fixture();a.body={...a.body,lines:[{...lines[0],quantity:1}],expectedTotalMinor:'100'};
 const before=await snapshot(a),result=await call(peer,a),after=await snapshot(a);
 assert.equal(result.stage,'reserved');assert.equal(result.replacesOrderId,a.oid);assert.equal(result.totalMinor,'100');assert.equal(after.market.stage,'cancelled');assert.ok(after.lots.every(r=>r.released_at));assert.equal(after.successors.length,1);assert.equal(after.successors[0].order_id,result.orderId);assert.deepEqual(after.stock,before.stock);assert.equal(after.movements,before.movements);assert.equal(after.folio,0);assert.equal(after.reserved,before.reserved-1);assert.equal(after.commands,before.commands+2);assert.equal(after.audit,before.audit+1);assert.equal(after.outbox,before.outbox+1);
 assert.equal((await db.query('SELECT count(*)::int n FROM market_lot_reservations WHERE order_id=$1',[result.orderId])).rows[0].n,0,'successor must not silently inherit lot selections');
 const replay=await Promise.all([call(db,a),call(peer,a)]);assert.ok(replay.every(r=>r.idempotentReplay&&r.orderId===result.orderId));assert.deepEqual(await snapshot(a),after);
 await assert.rejects(call(peer,{...a,body:{...a.body,expectedTotalMinor:'99'}}),/SERVICE_COMMAND_CONFLICT/);assert.deepEqual(await snapshot(a),after);await cancel(result.orderId);
 // Both a nested business rejection and an explicit transaction rollback restore old holds.
 const bad=await fixture(),badBefore=await snapshot(bad);await assert.rejects(call(peer,{...bad,body:{...bad.body,expectedTotalMinor:'1'}}),/SERVICE_PRICE_CHANGED|SERVICE_TOTAL_CHANGED/);assert.deepEqual(await snapshot(bad),badBefore);
 await db.query('BEGIN');const provisional=(await db.query('SELECT app.market_guest_act($1,$2,$3,$4) value',[hash,bad.oid,bad.key,bad.body])).rows[0].value;assert.notEqual(provisional.orderId,bad.oid);assert.ok((await snapshot(bad)).lots.every(r=>r.released_at));await db.query('ROLLBACK');assert.deepEqual(await snapshot(bad),badBefore);await cancel(bad.oid);
 // A requested catalog outside the order's property cannot release or replace the old order.
 const foreign=await fixture(),foreignBefore=await snapshot(foreign);await assert.rejects(call(peer,{...foreign,body:{...foreign.body,lines:[{...lines[0],serviceId:foreignService}]}}),/SERVICE_UNAVAILABLE/);assert.deepEqual(await snapshot(foreign),foreignBefore);await cancel(foreign.oid);
 // Fresh/cached current access after observed command, item and newly introduced lot waits.
 for(const [cached,lock,revocation] of [[false,'command','session'],[true,'command','session'],[false,'item','session'],[false,'lot','session'],[false,'command','ownership'],[true,'command','ownership']]){
  const x=await fixture(),receipt=cached?await call(peer,x):null,beforeWait=await snapshot(x);await db.query('BEGIN');
  if(lock==='command')await db.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::uuid::text||':'||$2::uuid::text,0))",[who,x.key]);
  if(lock==='item')await db.query('SELECT id FROM supply_items WHERE id=$1 FOR UPDATE',[item]);
  if(lock==='lot')await db.query('SELECT id FROM market_lot_reservations WHERE order_id=$1 FOR UPDATE',[x.oid]);
  const pending=call(peer,x).then(value=>({value}),error=>({error}));let waiting=false;
  for(let n=0;n<300;n++){waiting=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) waiting',[db.processID,peer.processID])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,`observed ${lock} wait`);
  if(revocation==='session')await db.query('UPDATE guest_identity_private.email_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]);else await db.query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[guest]);
  await db.query('COMMIT');assert.match((await pending).error?.message||'',/SERVICE_SESSION_INVALID|SERVICE_STAY_NOT_FOUND/);assert.deepEqual(await snapshot(x),beforeWait);
  await db.query('UPDATE guest_identity_private.email_sessions SET revoked_at=NULL WHERE token_hash=$1',[hash]);await db.query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[who,guest]);await cancel(receipt?receipt.orderId:x.oid);
 }
 // Two competing replacement keys cannot produce two successors; cancel/replacement is atomic too.
 for(const competing of ['replace_order','cancel']){
  const x=await fixture(),stock=await snapshot(x),raced=await Promise.allSettled([call(db,x),call(peer,{...x,key:randomUUID(),body:competing==='cancel'?{action:'cancel',expectedRevision:1}:x.body})]);
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.match(raced.find(r=>r.status==='rejected').reason.message,/SERVICE_REVISION_CHANGED|SERVICE_TRANSITION_INVALID/);
  const state=await snapshot(x);assert.equal(state.market.stage,'cancelled');assert.ok(state.lots.every(r=>r.released_at));assert.ok(state.successors.length<=1);assert.deepEqual(state.stock,stock.stock);assert.equal(state.movements,stock.movements);assert.equal(state.folio,0);
  if(state.successors.length)await cancel(state.successors[0].order_id);
 }
 assert.equal((await db.query("SELECT has_function_privilege('views_app','service_private.market_lot_command(text,uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query('UPDATE service_catalog SET active=false WHERE id=ANY($1::uuid[])',[[service,foreignService]]);
 console.log('Lot replacement M2: atomic successor/release, replay/conflict, nested failure/rollback, current authorization after waits and competing replace/cancel PASS; no physical issue/folio or runtime lot activation.');
};
