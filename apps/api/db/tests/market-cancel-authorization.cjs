'use strict';
// Disposable administrative revocation proof. Never export the admin connection to runtime tests.
const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
module.exports=async function({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',item=randomUUID();
 const q=(sql,args=[])=>admin.query(sql,args);
 // Own complete product fixture: no dependency on another test suite's stock or activation.
 const name={en:'Synthetic cancellation proof item',ru:'Тестовый товар отмены',uz:'Bekor qilish sinov mahsuloti'};
 await q("INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) VALUES($1,$2,$3,upper($1::uuid::text),$4,'piece')",[item,org,property,name.en]);
 await q('INSERT INTO supply_balances(organization_id,property_id,item_id,quantity) VALUES($1,$2,$3,100)',[org,property,item]);
 await q("INSERT INTO service_catalog(id,organization_id,property_id,code,name,currency,price_minor,active,execution_kind) VALUES($1,$2,$3,$1::uuid::text,$4,'UZS',100,false,'market')",[item,org,property,name]);
 await q("INSERT INTO market_products(service_id,organization_id,property_id,currency,item_id) VALUES($1,$2,$3,'UZS',$1)",[item,org,property]);
 async function fixture(){
  const who=randomUUID(),oid=randomUUID(),r=randomUUID(),g=randomUUID(),u=randomUUID(),t=randomUUID(),key=randomUUID(),hash=createHash('sha256').update(randomBytes(32)).digest('hex');
  await q("INSERT INTO users(id,email,display_name) VALUES($1,$1::uuid::text||'@views.invalid','Synthetic cancel actor')",[who]);
  await q("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$1,id,'active' FROM roles WHERE code='warehouse'",[who,org]);
  await q('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[who,property]);
  await q("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) SELECT $1,password_hash,'local_fixture' FROM staff_private.credentials WHERE membership_id='76900000-0000-4000-8000-000000000001'",[who]);
  await q('INSERT INTO staff_private.sessions(token_hash,membership_id,credential_version,role_id) SELECT $2,id,1,role_id FROM organization_memberships WHERE id=$1',[who,hash]);
  await q("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Cancellation')",[g,org]);
  await q("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[t,property]);
  await q('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[u,property,t]);
  await q("INSERT INTO reservations(id,organization_id,property_id,unit_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,$1::uuid::text,'checked_in',now()-interval '1 day',now()+interval '5 days','UZS',0,'{}')",[r,org,property,u,g]);
  await q("INSERT INTO service_orders(id,organization_id,property_id,service_id,reservation_id,guest_profile_id,currency,quantity,total_minor,commission_minor,requested_for,snapshot,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,'UZS',1,100,0,now(),jsonb_build_object('execution','market','name',$7::jsonb,'substitutions',false,'deliveryMinor','0','paymentMode','folio_after_guest_receipt','lines',jsonb_build_array(jsonb_build_object('serviceId',$4::uuid::text,'itemId',$4::uuid::text,'name',$7::jsonb,'quantity',1,'priceMinor','100','catalogRevision',1))),$1::uuid::text)",[oid,org,property,item,r,g,name]);
  await q('INSERT INTO market_orders(order_id,organization_id,property_id) VALUES($1,$2,$3)',[oid,org,property]);
  await q('INSERT INTO market_order_lines(order_id,organization_id,property_id,item_id,quantity) VALUES($1,$2,$3,$4,1)',[oid,org,property,item]);
  // Validate the receipt consumed by the staff browser, not just SQL write acceptance.
  const receipt=(await q('SELECT service_private.market_receipt($1) value',[oid])).rows[0].value;
  assert.equal(receipt.currency,'UZS');assert.equal(receipt.totalMinor,'100');
  assert.deepEqual(receipt.lines,[{serviceId:item,itemId:item,name,quantity:1,priceMinor:'100',catalogRevision:1}]);
  return {who,oid,r,key,hash,body:{action:'cancel',expectedRevision:1}};
 }
 async function snapshot(f){return (await q(`SELECT to_jsonb(m) market,to_jsonb(o) orders,
  (SELECT count(*)::int FROM audit_log WHERE entity_id=o.id) audits,
  (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=o.id) events,
  (SELECT count(*)::int FROM service_private.commands WHERE actor_user_id=$2) commands,
  (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM folio_entries e WHERE source_id=o.id) entries,
  (SELECT to_jsonb(b) FROM supply_balances b WHERE item_id=$3) balance,
  (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM supply_movements v WHERE reference='V Market '||o.id) movements
  FROM market_orders m JOIN service_orders o ON o.id=m.order_id WHERE o.id=$1`,[f.oid,f.who,item])).rows[0];}
 // Even the owner cannot use the new guard exception for an unrelated service order.
 const control=await fixture();await q('BEGIN');
 try{
  const id=randomUUID();
  await q("INSERT INTO service_orders SELECT (jsonb_populate_record(NULL::service_orders,to_jsonb(o)||jsonb_build_object('id',$2::text,'idempotency_key',$2::text,'snapshot',jsonb_build_object('execution','cleaning')))).* FROM service_orders o WHERE o.id=$1",[control.oid,id]);
  await q("UPDATE service_orders SET status='accepted' WHERE id=$1",[id]);
  await q("UPDATE service_orders SET status='in_progress' WHERE id=$1",[id]);
  await assert.rejects(q("UPDATE service_orders SET status='cancelled' WHERE id=$1",[id]),{message:'SERVICE_ORDER_TRANSITION_INVALID'});
 }finally{await q('ROLLBACK');}
 const cases=[];
 for(const cached of [false,true])for(const revocation of ['session','role','scope','membership'])cases.push({cached,revocation,lock:'command'});
 for(const lock of ['item','order'])for(const revocation of ['session','role','scope'])cases.push({cached:false,revocation,lock});
 for(const {cached,revocation,lock} of cases){
  const f=await fixture(),locker=new Client({connectionString:runtimeUrl}),caller=new Client({connectionString:runtimeUrl});let pending;
  try{
   for(const c of [locker,caller]){await c.connect();assert.deepEqual((await c.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{role:'views_app',rolsuper:false,rolbypassrls:false});await c.query("SET statement_timeout='5s'");}
   await caller.query("SELECT set_config('app.organization_id',$1,false),set_config('app.user_id',$2,false),set_config('app.membership_id',$2,false)",[org,f.who]);
   const call=()=>caller.query('SELECT app.market_staff_act($1,$2,$3,$4) value',[f.hash,f.oid,f.key,f.body]);
   if(cached)assert.equal((await call()).rows[0].value.stage,'cancelled');
   const before=await snapshot(f);
   await locker.query('BEGIN');
   if(lock==='command')await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('service:'||$1::uuid::text||':'||$2::text,0))",[f.who,f.key]);
   else{
    await locker.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$2,true)",[org,lock==='item'?'76900000-0000-4000-8000-000000000001':'76800000-0000-4000-8000-000000000001']);
    if(lock==='item')await locker.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'issue',-1,'Synthetic cancellation wait',$4,$4)",[org,property,item,'76900000-0000-4000-8000-000000000001']);
    else assert.equal((await locker.query('SELECT id FROM service_orders WHERE id=$1 FOR UPDATE',[f.oid])).rowCount,1);
   }
   const pid=(await caller.query('SELECT pg_backend_pid() pid')).rows[0].pid,blocker=(await locker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=call().then(r=>({value:r.rows[0].value}),error=>({error}));
   let waiting=false;const deadline=Date.now()+3000;while(Date.now()<deadline){waiting=(await q('SELECT $2=ANY(pg_blocking_pids($1)) waiting',[pid,blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,`observed ${lock} wait`);
   if(revocation==='session')await q('UPDATE staff_private.sessions SET revoked_at=now() WHERE token_hash=$1',[f.hash]);
   if(revocation==='role')await q("UPDATE organization_memberships SET role_id=(SELECT id FROM roles WHERE code='procurement') WHERE id=$1",[f.who]);
   if(revocation==='membership')await q("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[f.who]);
   if(revocation==='scope')await q('DELETE FROM membership_property_scopes WHERE membership_id=$1',[f.who]);
   await locker.query('ROLLBACK');const result=await pending;
   assert.equal(result.error?.message,revocation==='scope'?'SERVICE_FORBIDDEN':'SERVICE_SESSION_INVALID',`${cached}/${revocation}/${lock}`);
   assert.equal(result.error?.code,revocation==='scope'?'42501':'28000');assert.ok(!('value' in result));assert.deepEqual(await snapshot(f),before);
  }finally{await locker.query('ROLLBACK').catch(()=>{});if(pending)await pending;await caller.end();await locker.end();}
 }
 console.log(`Market cancellation: ${cases.length} staff session/role/membership/property revocation races PASS; unchanged reserve, stock, money, audit and outbox.`);
};
