'use strict';
// Disposable owner-seeded private lot holds; cancellation itself runs as views_app.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
module.exports=async function lotCancelProof(db,peer,f){
 const {org,property,user,member,item,service,version,stay,guest}=f;
 assert.equal((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const hash=randomBytes(32).toString('hex'),guestHash=randomBytes(32).toString('hex'),guestUser=randomUUID();
 await db.query("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic lot cancellation guest')",[guestUser]);
 await db.query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[guestUser,guest]);
 await db.query("INSERT INTO guest_identity_private.email_sessions(user_id,verified_email,token_hash,expires_at) VALUES($1,$1::uuid::text||'@views.invalid',$2,clock_timestamp()+interval '1 hour')",[guestUser,guestHash]);
 await db.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[member,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
 await db.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $1,m.id,c.version,m.role_id FROM organization_memberships m JOIN staff_private.credentials c ON c.membership_id=m.id WHERE m.id=$2',[hash,member]);
 const context=c=>c.query("SELECT set_config('app.organization_id',$1,false),set_config('app.user_id',$2,false),set_config('app.membership_id',$3,false)",[org,user,member]);
 await context(db);await context(peer);
 const name={en:'Synthetic lot cancellation item',ru:'Тестовый товар резерва партии',uz:'Partiya band qilish sinov mahsuloti'};
 async function fixture(stage='reserved'){
  const oid=randomUUID();
  await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key,reservation_id) VALUES($1,$2,$3,$4,$5,'UZS',1,200,0,clock_timestamp(),$6,$1::uuid::text,$7)",[oid,org,property,service,guest,{execution:'market',name,substitutions:false,deliveryMinor:'0',paymentMode:'folio_after_guest_receipt',lines:[{serviceId:service,itemId:item,name,quantity:2,priceMinor:'100',catalogRevision:1}]},stay]);
  await db.query('INSERT INTO market_orders(order_id,organization_id,property_id) VALUES($1,$2,$3)',[oid,org,property]);
  await db.query('INSERT INTO market_order_lines VALUES($1,$2,$3,$4,2)',[org,property,oid,item]);
  if(stage!=='reserved'){await db.query("UPDATE market_orders SET stage='picking' WHERE order_id=$1",[oid]);await db.query("UPDATE service_orders SET status='accepted' WHERE id=$1",[oid]);}
  if(stage==='ready'){await db.query("UPDATE market_orders SET stage='ready',checklist='{\"quantities\":true,\"expiry\":true,\"packaging\":true}' WHERE order_id=$1",[oid]);await db.query("UPDATE service_orders SET status='in_progress' WHERE id=$1",[oid]);}
  await db.query("INSERT INTO market_lot_reservations(organization_id,property_id,order_id,item_id,movement_id,lot_code,expires_on,quantity) VALUES($1,$2,$3,$4,$5,'HELD','2099-01-01',2)",[org,property,oid,item,version]);
  return {oid,key:randomUUID(),body:{action:'cancel',expectedRevision:1}};
 }
 const call=async(c,a,staff=true)=>{
  await c.query('BEGIN; SET LOCAL ROLE views_app');
  try{const value=(await c.query(`SELECT app.market_${staff?'staff':'guest'}_act($1,$2,$3,$4) value`,[staff?hash:guestHash,a.oid,a.key,a.body])).rows[0].value;await c.query('COMMIT');return value;}
  catch(e){await c.query('ROLLBACK');throw e;}
 };
 const snapshot=async a=>(await db.query(`SELECT to_jsonb(m) market,to_jsonb(o) service,
 (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM market_lot_reservations r WHERE order_id=$1) lots,
 (SELECT count(*)::int FROM service_private.commands WHERE command_key=$2) commands,
 (SELECT count(*)::int FROM audit_log WHERE entity_id=$1) audit,
 (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1) outbox,
 (SELECT count(*)::int FROM folio_entries WHERE source_id=$1) folio,
 (SELECT to_jsonb(b) FROM supply_balances b WHERE item_id=$3) stock,
 (SELECT count(*)::int FROM supply_movements WHERE item_id=$3) movements
 FROM market_orders m JOIN service_orders o ON o.id=m.order_id WHERE m.order_id=$1`,[a.oid,a.key,item])).rows[0];
 // Baseline 0133 fails here at commit with LOT_RESERVE_ACTIVE.
 for(const [staff,stage] of [[false,'reserved'],[true,'reserved'],[true,'picking'],[true,'ready']]){
  const a=await fixture(stage),before=await snapshot(a);
  const result=await call(peer,a,staff);assert.equal(result.stage,'cancelled');assert.equal(result.revision,2);
  const after=await snapshot(a);assert.ok(after.lots.every(r=>r.released_at));assert.equal(after.commands,1);assert.equal(after.audit,1);assert.equal(after.outbox,1);assert.equal(after.folio,0);assert.deepEqual(after.stock,before.stock);assert.equal(after.movements,before.movements);
  assert.equal((await call(peer,a,staff)).idempotentReplay,true);assert.deepEqual(await snapshot(a),after);
  await assert.rejects(call(peer,{...a,body:{...a.body,expectedRevision:2}},staff),/SERVICE_COMMAND_CONFLICT/);assert.deepEqual(await snapshot(a),after);
 }
 // A rolled-back cancellation restores both logical reserves and its receipt/event effects.
 const rollback=await fixture(),original=await snapshot(rollback);
 await db.query('BEGIN');await db.query('SELECT app.market_guest_act($1,$2,$3,$4)',[guestHash,rollback.oid,rollback.key,rollback.body]);
 assert.ok((await snapshot(rollback)).lots.every(r=>r.released_at));await db.query('ROLLBACK');assert.deepEqual(await snapshot(rollback),original);
 await call(peer,rollback,false);
 // A guest cannot cancel a picking order or another guest's reservation.
 const restricted=await fixture('picking'),restrictedBefore=await snapshot(restricted);
 await assert.rejects(call(peer,restricted,false),/SERVICE_TRANSITION_INVALID/);assert.deepEqual(await snapshot(restricted),restrictedBefore);await call(peer,restricted);
 const foreign=await fixture();await db.query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[guest]);const foreignBefore=await snapshot(foreign);
 await assert.rejects(call(peer,foreign,false),/SERVICE_STAY_NOT_FOUND/);assert.deepEqual(await snapshot(foreign),foreignBefore);await db.query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[guestUser,guest]);
 await peer.query("SELECT set_config('app.organization_id','10000000-0000-4000-8000-000000000001',false)");await assert.rejects(call(peer,foreign),/SERVICE_SESSION_INVALID|SERVICE_FORBIDDEN/);await context(peer);await call(peer,foreign);
 // Observe waits, then revoke before releasing the lock; no lot release may escape rollback.
 for(const staff of [false,true])for(const lock of ['command','lot']){
  const a=await fixture(),before=await snapshot(a);await db.query('BEGIN');
  if(lock==='command')await db.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::uuid::text||':'||$2::uuid::text,0))",[staff?user:guestUser,a.key]);
  else await db.query('SELECT id FROM market_lot_reservations WHERE order_id=$1 FOR UPDATE',[a.oid]);
  const pending=call(peer,a,staff).then(value=>({value}),error=>({error}));let waiting=false;
  for(let n=0;n<300;n++){waiting=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) waiting',[db.processID,peer.processID])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(waiting,`observed ${lock} wait`);
  await db.query(`UPDATE ${staff?'staff_private.sessions':'guest_identity_private.email_sessions'} SET revoked_at=clock_timestamp() WHERE token_hash=$1`,[staff?hash:guestHash]);await db.query('COMMIT');
  assert.match((await pending).error?.message||'',/SERVICE_SESSION_INVALID/);assert.deepEqual(await snapshot(a),before);
  await db.query(`UPDATE ${staff?'staff_private.sessions':'guest_identity_private.email_sessions'} SET revoked_at=NULL WHERE token_hash=$1`,[staff?hash:guestHash]);await call(peer,a,staff);
  const after=await snapshot(a);await db.query(`UPDATE ${staff?'staff_private.sessions':'guest_identity_private.email_sessions'} SET revoked_at=clock_timestamp() WHERE token_hash=$1`,[staff?hash:guestHash]);await assert.rejects(call(peer,a,staff),/SERVICE_SESSION_INVALID/);assert.deepEqual(await snapshot(a),after);await db.query(`UPDATE ${staff?'staff_private.sessions':'guest_identity_private.email_sessions'} SET revoked_at=NULL WHERE token_hash=$1`,[staff?hash:guestHash]);
 }
 // Role/property revocation during the new lot-row UPDATE wait also rolls release back.
 for(const revoke of ['role','scope']){
  const a=await fixture(),before=await snapshot(a),role=(await db.query('SELECT role_id FROM organization_memberships WHERE id=$1',[member])).rows[0].role_id;
  await db.query('BEGIN');await db.query('SELECT id FROM market_lot_reservations WHERE order_id=$1 FOR UPDATE',[a.oid]);
  const pending=call(peer,a).then(value=>({value}),error=>({error}));let waiting=false;
  for(let n=0;n<300;n++){waiting=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) waiting',[db.processID,peer.processID])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,'observed lot update wait before '+revoke);
  if(revoke==='role')await db.query("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='procurement') WHERE id=$1",[member]);
  else await db.query('DELETE FROM membership_property_scopes WHERE membership_id=$1 AND property_id=$2',[member,property]);
  await db.query('COMMIT');assert.match((await pending).error?.message||'',/SERVICE_SESSION_INVALID|SERVICE_FORBIDDEN/);assert.deepEqual(await snapshot(a),before);
  if(revoke==='role')await db.query('UPDATE organization_memberships SET role_id=$1 WHERE id=$2',[role,member]);
  else await db.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[member,property]);
  await db.query('UPDATE staff_private.sessions SET revoked_at=NULL WHERE token_hash=$1',[hash]);
  await call(peer,a);
 }
 // Current guest ownership is checked again after command serialization, including cached replay.
 for(const cached of [false,true]){
  const a=await fixture();if(cached)await call(peer,a,false);const before=await snapshot(a);
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::uuid::text||':'||$2::uuid::text,0))",[guestUser,a.key]);
  const pending=call(peer,a,false).then(value=>({value}),error=>({error}));let waiting=false;
  for(let n=0;n<300;n++){waiting=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) waiting',[db.processID,peer.processID])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,'observed guest ownership wait');
  await db.query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[guest]);await db.query('COMMIT');
  assert.match((await pending).error?.message||'',/SERVICE_STAY_NOT_FOUND/);assert.deepEqual(await snapshot(a),before);
  await db.query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[guestUser,guest]);if(!cached)await call(peer,a,false);
 }
 // Handover stays gated for private lot holds; concurrent cancellation cannot issue stock.
 const racing=await fixture('ready'),raceBefore=await snapshot(racing);
 const raced=await Promise.allSettled([call(db,racing),call(peer,{...racing,key:randomUUID(),body:{action:'handover',expectedRevision:1}})]);
 assert.equal(raced[0].status,'fulfilled');assert.equal(raced[1].status,'rejected');assert.match(raced[1].reason.message,/LOT_RESERVE_ACTIVE|LOT_RESERVE_UNAVAILABLE|SERVICE_STOCK_RESERVED|SERVICE_REVISION_CHANGED|SERVICE_TRANSITION_INVALID/);
 const raceAfter=await snapshot(racing);assert.equal(raceAfter.market.stage,'cancelled');assert.deepEqual(raceAfter.stock,raceBefore.stock);assert.equal(raceAfter.movements,raceBefore.movements);assert.equal(raceAfter.folio,0);assert.ok(raceAfter.lots.every(r=>r.released_at));
 assert.equal((await db.query("SELECT has_function_privilege('views_app','service_private.market_lot_command(text,uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query('DELETE FROM staff_private.sessions WHERE token_hash=$1',[hash]);await db.query('DELETE FROM staff_private.credentials WHERE membership_id=$1',[member]);
 console.log('Lot cancellation M1: guest/staff stages, replay, rollback, scope, fresh/cached revocation and cancellation/handover race PASS; physical stock/folio unchanged; lot activation disabled.');
};
