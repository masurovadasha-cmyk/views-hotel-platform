'use strict';
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
module.exports=async function lotHandoverProof(db,peer,f){
 const {org,property,user,member,stay,guest}=f,hash=randomBytes(32).toString('hex');
 assert.equal((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 await db.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[member,'scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64)]);
 await db.query('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $1,m.id,c.version,m.role_id FROM organization_memberships m JOIN staff_private.credentials c ON c.membership_id=m.id WHERE m.id=$2',[hash,member]);
 for(const c of [db,peer])await c.query("SELECT set_config('app.organization_id',$1,false),set_config('app.user_id',$2,false),set_config('app.membership_id',$3,false)",[org,user,member]);
 const name={en:'Synthetic private lot handover',ru:'Тестовая выдача партии',uz:'Partiyani topshirish sinovi'};
 async function fixture({held=true,two=false,partial=false,expires='2099-01-01'}={}){
  const oid=randomUUID(),lines=[],selections=[],items=[];
  for(let n=0;n<(two?2:1);n++){
   const item=String(n)+randomUUID().slice(1),snapshot=randomUUID(),expiry=Array.isArray(expires)?expires[n]:expires;items.push(item);
   await db.query("INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) VALUES($1,$2,$3,upper($1::uuid::text),'Synthetic lot handover item','piece')",[item,org,property]);
   await db.query("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,execution_kind) VALUES($1,$2,$3,$1::uuid::text,$4,'UZS',100,'market')",[item,org,property,name]);
   await db.query("INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) VALUES($1,$2,$3,'UZS',$1)",[item,org,property]);
   await db.query('INSERT INTO supply_balances(organization_id,property_id,item_id,quantity) VALUES($1,$2,$3,8)',[org,property,item]);
   await db.query('BEGIN');
   await db.query("INSERT INTO supply_stocktakes(id,organization_id,property_id,item_id,expected_quantity,counted_quantity,expected_revision,reason,actor_user_id,actor_membership_id,lot_counts) VALUES($1,$2,$3,$4,8,8,0,'Synthetic handover count',$5,$6,$7)",[snapshot,org,property,item,user,member,JSON.stringify([{lotCode:'HELD',expiresOn:expiry,quantity:'5'},{lotCode:'OTHER',expiresOn:expiry,quantity:'3'}])]);
   const movement=(await db.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id,stocktake_id) VALUES($1,$2,$3,'adjustment',0,'Synthetic handover count',$4,$5,$6) RETURNING id",[org,property,item,user,member,snapshot])).rows[0].id;
   await db.query('COMMIT');
   lines.push({serviceId:item,itemId:item,name,quantity:2,priceMinor:'100',catalogRevision:1});selections.push({serviceId:item,lotAllocation:{snapshotId:snapshot,movementId:movement,lotCode:'HELD',expiresOn:expiry}});
  }
  await db.query("INSERT INTO service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,'UZS',1,$7,0,clock_timestamp(),$8,$1::uuid::text)",[oid,org,property,items[0],stay,guest,200*items.length,{execution:'market',name,lines,paymentMode:'folio_after_guest_receipt',deliveryMinor:'0',substitutions:false}]);
  await db.query('INSERT INTO market_orders(order_id,organization_id,property_id) VALUES($1,$2,$3)',[oid,org,property]);
  for(let n=0;n<items.length;n++){
   await db.query('INSERT INTO market_order_lines VALUES($1,$2,$3,$4,2)',[org,property,oid,items[n]]);
   if(held&&(!partial||n===0))await db.query('INSERT INTO market_lot_reservations(organization_id,property_id,order_id,item_id,movement_id,lot_code,expires_on,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,2)',[org,property,oid,items[n],selections[n].lotAllocation.movementId,'HELD',selections[n].lotAllocation.expiresOn]);
  }
  await db.query("UPDATE market_orders SET stage='picking' WHERE order_id=$1",[oid]);await db.query("UPDATE service_orders SET status='accepted' WHERE id=$1",[oid]);await db.query("UPDATE market_orders SET stage='ready',checklist='{\"quantities\":true,\"expiry\":true,\"packaging\":true}' WHERE order_id=$1",[oid]);await db.query("UPDATE service_orders SET status='in_progress' WHERE id=$1",[oid]);
  return {oid,items,key:randomUUID(),body:{action:'handover',expectedRevision:1,lotSelections:selections}};
 }
 async function call(c,a){await c.query('BEGIN; SET LOCAL ROLE views_app');try{const result=(await c.query('SELECT app.market_staff_act($1,$2,$3,$4) value',[hash,a.oid,a.key,a.body])).rows[0].value;await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}}
 const state=async a=>(await db.query(`SELECT to_jsonb(m) market,
 (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM market_lot_reservations r WHERE order_id=$1) holds,
 (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY item_id),'[]') FROM supply_balances b WHERE item_id=ANY($2::uuid[])) stock,
 (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY id),'[]') FROM supply_movements v WHERE reference='V Market '||$1::text) issues,
 (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY movement_id),'[]') FROM supply_lot_ledger h WHERE item_id=ANY($2::uuid[])) ledger,
 (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY item_id),'[]') FROM supply_lot_projections p WHERE item_id=ANY($2::uuid[])) projection,
 (SELECT count(*)::int FROM folio_entries WHERE source_id=$1) folio,
 (SELECT count(*)::int FROM service_private.commands WHERE command_key=$3) commands,
 (SELECT count(*)::int FROM audit_log WHERE entity_id=$1) audit,
 (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1) outbox
 FROM market_orders m WHERE order_id=$1`,[a.oid,a.items,a.key])).rows[0];
 // Baseline fails because the issue would consume stock still protected by its own lot hold.
 const a=await fixture({two:true}),before=await state(a);assert.equal((await call(peer,a)).stage,'handed_over');const after=await state(a);
 assert.equal(after.holds.length,2);assert.ok(after.holds.every(r=>r.released_at));assert.equal(after.issues.length,2);assert.ok(after.issues.every(r=>r.quantity===-2||r.quantity==='-2'));assert.ok(after.stock.every(b=>b.quantity===6||b.quantity==='6'));assert.equal(after.folio,0);assert.equal(after.commands,1);assert.equal(after.audit,1);assert.equal(after.outbox,1);
 for(const issue of after.issues){assert.deepEqual(issue.lot_allocation,a.body.lotSelections.find(s=>s.serviceId===issue.item_id).lotAllocation);
  const balances=(await db.query('SELECT lot_code,quantity_after::text quantity FROM supply_lot_ledger_lines WHERE movement_id=$1 ORDER BY lot_code',[issue.id])).rows;assert.deepEqual(balances,[{lot_code:'HELD',quantity:'3'},{lot_code:'OTHER',quantity:'3'}]);
  assert.equal(after.projection.find(p=>p.item_id===issue.item_id).last_movement_id,issue.id);assert.equal(String(after.ledger.find(h=>h.movement_id===issue.id).total_quantity),'6');
 }
 const receipts=await Promise.all([call(db,a),call(peer,a)]);assert.ok(receipts.every(r=>r.idempotentReplay));assert.deepEqual(await state(a),after);
 await assert.rejects(call(peer,{...a,body:{...a.body,expectedRevision:2}}),/SERVICE_COMMAND_CONFLICT/);assert.deepEqual(await state(a),after);
 // Explicit rollback restores the physical ledger and active holds together.
 const rollback=await fixture(),rb=await state(rollback);await db.query('BEGIN');await db.query('SELECT app.market_staff_act($1,$2,$3,$4)',[hash,rollback.oid,rollback.key,rollback.body]);await db.query('ROLLBACK');assert.deepEqual(await state(rollback),rb);
 for(const change of ['missing','lot','date','movement','snapshot','quantity','service','duplicate']){
  const x=await fixture({two:true}),original=await state(x),body=structuredClone(x.body),allocation=body.lotSelections[0].lotAllocation;
  if(change==='missing')delete body.lotSelections;if(change==='lot')allocation.lotCode='OTHER';if(change==='date')allocation.expiresOn='2098-01-01';if(change==='movement')allocation.movementId=body.lotSelections[1].lotAllocation.movementId;if(change==='snapshot')allocation.snapshotId=body.lotSelections[1].lotAllocation.snapshotId;if(change==='quantity')allocation.quantity=1;if(change==='service')body.lotSelections[0].serviceId=randomUUID();if(change==='duplicate')body.lotSelections[1]=body.lotSelections[0];
  await assert.rejects(call(peer,{...x,body}),/LOT_RESERVE_MISMATCH|SERVICE_INPUT_INVALID|SERVICE_REVISION_CHANGED/);assert.deepEqual(await state(x),original);
 }
 // A partially held order cannot silently fall back to manual allocation for other lines.
 const partial=await fixture({two:true,partial:true}),ps=await state(partial);await assert.rejects(call(peer,partial),/LOT_RESERVE_MISMATCH/);assert.deepEqual(await state(partial),ps);
 await assert.rejects(db.query('UPDATE market_lot_reservations SET quantity=1 WHERE order_id=$1',[partial.oid]),/LOT_RESERVE_IMMUTABLE/);assert.deepEqual(await state(partial),ps);
 // Another legitimate movement makes the held ledger version stale; no implicit refresh.
 const stale=await fixture(),allocation=stale.body.lotSelections[0].lotAllocation;
 await db.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id,lot_allocation) VALUES($1,$2,$3,'issue',-1,'Synthetic other lot issue',$4,$5,$6)",[org,property,stale.items[0],user,member,{...allocation,lotCode:'OTHER'}]);
 const ss=await state(stale);await assert.rejects(call(peer,stale),/SERVICE_REVISION_CHANGED/);assert.deepEqual(await state(stale),ss);
 // Advance only this disposable fixture's timezone boundary, not the machine clock.
 // The second sorted item expires: first issue must roll back along with both releases.
 const zone=(await db.query('SELECT timezone FROM properties WHERE id=$1',[property])).rows[0].timezone;
 try{
  await db.query("UPDATE properties SET timezone='Etc/GMT+12' WHERE id=$1",[property]);
  const expiry=(await db.query("SELECT (clock_timestamp() AT TIME ZONE 'Etc/GMT+12')::date::text expiry")).rows[0].expiry;
  const expired=await fixture({two:true,expires:['2099-01-01',expiry]});
  await db.query("UPDATE properties SET timezone='Pacific/Kiritimati' WHERE id=$1",[property]);
  const es=await state(expired);await assert.rejects(call(peer,expired),/SERVICE_STOCK_UNAVAILABLE/);assert.deepEqual(await state(expired),es);
 }finally{await db.query('UPDATE properties SET timezone=$1 WHERE id=$2',[zone,property]);}
 // Legacy manual provenance without private holds remains supported.
 const legacy=await fixture({held:false});assert.equal((await call(peer,legacy)).stage,'handed_over');assert.equal((await state(legacy)).issues.length,1);
 const snapshotLegacy=await fixture({held:false});delete snapshotLegacy.body.lotSelections[0].lotAllocation.movementId;assert.equal((await call(peer,snapshotLegacy)).stage,'handed_over');
 for(const [cached,lock,revoke] of [[false,'command','session'],[true,'command','session'],[true,'command','role'],[true,'command','scope'],[false,'item','session'],[false,'lot','session'],[false,'lot','role'],[false,'lot','scope']]){
  const x=await fixture();if(cached)await call(peer,x);const original=await state(x),role=(await db.query('SELECT role_id FROM organization_memberships WHERE id=$1',[member])).rows[0].role_id;
  await db.query('BEGIN');if(lock==='command')await db.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::uuid::text||':'||$2::uuid::text,0))",[user,x.key]);if(lock==='item')await db.query('SELECT id FROM supply_items WHERE id=$1 FOR UPDATE',[x.items[0]]);if(lock==='lot')await db.query('SELECT id FROM market_lot_reservations WHERE order_id=$1 FOR UPDATE',[x.oid]);
  const pending=call(peer,x).then(value=>({value}),error=>({error}));let waiting=false;
  for(let n=0;n<300;n++){waiting=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) waiting',[db.processID,peer.processID])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,`observed ${lock} wait`);
  if(revoke==='session')await db.query('UPDATE staff_private.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]);if(revoke==='role')await db.query("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='procurement') WHERE id=$1",[member]);if(revoke==='scope')await db.query('DELETE FROM membership_property_scopes WHERE membership_id=$1 AND property_id=$2',[member,property]);await db.query('COMMIT');
  assert.match((await pending).error?.message||'',/SERVICE_SESSION_INVALID|SERVICE_FORBIDDEN/);assert.deepEqual(await state(x),original);
  if(revoke==='role')await db.query('UPDATE organization_memberships SET role_id=$1 WHERE id=$2',[role,member]);if(revoke==='scope')await db.query('INSERT INTO membership_property_scopes VALUES($1,$2)',[member,property]);await db.query('UPDATE staff_private.sessions SET revoked_at=NULL WHERE token_hash=$1',[hash]);
 }
 for(const competing of ['handover','cancel']){
  const x=await fixture(),raced=await Promise.allSettled([call(db,x),call(peer,{...x,key:randomUUID(),body:competing==='cancel'?{action:'cancel',expectedRevision:1}:x.body})]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.match(raced.find(r=>r.status==='rejected').reason.message,/SERVICE_REVISION_CHANGED|SERVICE_TRANSITION_INVALID/);
  const result=await state(x);assert.ok(result.holds.every(r=>r.released_at));assert.equal(result.issues.length,result.market.stage==='handed_over'?1:0);assert.equal(result.folio,0);
 }
 assert.equal((await db.query("SELECT has_function_privilege('views_app','service_private.market_lot_command(text,uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query('DELETE FROM staff_private.sessions WHERE token_hash=$1',[hash]);await db.query('DELETE FROM staff_private.credentials WHERE membership_id=$1',[member]);
 console.log('Lot handover M3: exact provenance, release/issue/replay, rollback/mismatch, current authorization after waits, legacy manual path and handover/cancel races PASS; reserve activation disabled.');
};
