'use strict';
// Runs INSIDE a disposable Core container. The server itself keeps views_app.
// This test process alone receives the fixture DB owner credential for seeding
// and fault injection. No Payme site or real merchant credential is used.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
if(process.env.NODE_ENV!=='test'||process.env.VIEWS_PAYME_PROOF_ACK!=='DISPOSABLE_DATABASE_ONLY')throw Error('DISPOSABLE_PROOF_REQUIRED');
const admin=new Pool({connectionString:process.env.PAYME_PROOF_ADMIN_DATABASE_URL,max:4});
const runtime=new Pool({connectionString:process.env.DATABASE_URL,max:4});
const ORG='73000000-0000-4000-8000-000000000001',OTHER=randomUUID();
const auth='Basic '+Buffer.from('views-payme-test:fixture-test-key-0123456789abcdef').toString('base64');
const URL='http://127.0.0.1:3001/v1/payments/payme/merchant';
const checks=[];let rpcId=0;let httpCalls=0;let fixtureIndex=0;
const query=(sql,params=[])=>admin.query(sql,params);
async function check(name,fn){await fn();checks.push(name);process.stderr.write('PASS '+name+'\n');}
async function raw(body,type='text/json',authorization=auth){
  const response=await fetch(URL,{method:'POST',headers:{'content-type':type,authorization},body,signal:AbortSignal.timeout(15000)});
  httpCalls++;assert.equal(response.status,200);return response.json();
}
async function rpc(method,params={},extra={}){
  const id=++rpcId;const response=await raw(JSON.stringify({id,method,params}),extra.type||'text/json',extra.auth||auth);
  if(extra.auth===undefined)assert.equal(response.id,id);
  return response;
}
function result(response){assert.equal(response.error,undefined,JSON.stringify(response));assert.ok(response.result);return response.result;}
function error(response,code){assert.equal(response.error?.code,code,JSON.stringify(response));assert.equal(response.result,undefined);}
async function inOrg(org,fn){
  const c=await runtime.connect();
  try{await c.query('BEGIN');await c.query("SELECT set_config('app.organization_id',$1,true)",[org]);const v=await fn(c);await c.query('COMMIT');return v;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function seed(org=ORG){
  const property=randomUUID(),unitType=randomUUID(),unit=randomUUID(),rate=randomUUID(),quote=randomUUID(),reservation=randomUUID(),payment=randomUUID();
  const c=await admin.connect();
  try{
    await c.query('BEGIN');
    await c.query(`INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{"en":"TEST ONLY"}','UZ','Tashkent','Asia/Tashkent')`,[property,org]);
    await c.query(`INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{"en":"TEST"}',2)`,[unitType,property]);
    await c.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[unit,property,unitType,'TEST-'+(++fixtureIndex)]);
    await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,$3,'{"en":"TEST"}','UZS',500000)`,[rate,property,unitType]);
    await c.query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,
      accommodation_minor,discount_minor,charges_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '1 day',now()+interval '2 days','{}','UZS',500000,0,0,500000,'{}','{}',repeat('a',64),now()+interval '2 hours')`,[quote,org,property,unit,rate]);
    await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,check_in_at,check_out_at,currency,
      accommodation_minor,total_minor,cancellation_policy_snapshot,hold_expires_at,quote_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,'hold',now()+interval '1 day',now()+interval '2 days','UZS',500000,500000,'{}',now()+interval '2 hours',$7::jsonb)`,
      [reservation,org,property,unit,rate,'TEST-'+reservation,JSON.stringify({quoteId:quote})]);
    await c.query(`INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period,expires_at)
      VALUES($1,$2,$3,'payment_hold',$4,tstzrange(now()+interval '1 day',now()+interval '2 days','[)'),now()+interval '2 hours')`,[org,property,unit,reservation]);
    await c.query(`INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,status,amount_minor,currency,idempotency_key,expires_at)
      VALUES($1,$2,$3,$4,'payme','requires_payment',500000,'UZS',$5,now()+interval '2 hours')`,[payment,org,reservation,quote,'test-'+payment]);
    await c.query('COMMIT');return {payment,reservation,tx:randomUUID().replace(/-/g,'').slice(0,24),time:Date.now(),org};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
function createParams(f){return {id:f.tx,time:f.time,amount:500000,account:{payment_intent_id:f.payment}};}
async function create(f){return result(await rpc('CreateTransaction',createParams(f)));}
async function snapshot(f){
  const p=(await query(`SELECT status,captured_minor::text,refunded_minor::text FROM payment_intents WHERE id=$1`,[f.payment])).rows[0];
  const t=(await query('SELECT state,reason,perform_time_ms::text,cancel_time_ms::text FROM payme_merchant_transactions WHERE payment_intent_id=$1',[f.payment])).rows[0];
  const r=(await query('SELECT status FROM reservations WHERE id=$1',[f.reservation])).rows[0];
  const counts=(await query(`SELECT
    (SELECT count(*)::int FROM provider_transactions WHERE payment_intent_id=$1) AS financial,
    (SELECT count(*)::int FROM payment_webhook_inbox WHERE payment_intent_id=$1) AS inbox,
    (SELECT count(*)::int FROM ledger_journals WHERE reference_type='payment_intent' AND reference_id=$1 AND status='posted') AS journals,
    (SELECT count(*)::int FROM inventory_periods WHERE reservation_id=$2) AS inventory`,[f.payment,f.reservation])).rows[0];
  return {payment:p,transaction:t,reservation:r.status,...counts};
}
async function failpoint(f,state){
  assert.match(f.payment,/^[0-9a-f-]{36}$/);
  await query(`CREATE OR REPLACE FUNCTION app.payme_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$
    BEGIN IF NEW.payment_intent_id='${f.payment}'::uuid AND NEW.state=${state} THEN RAISE EXCEPTION 'FIXTURE_STATE_WRITE_FAILURE'; END IF; RETURN NEW; END $fault$;
    CREATE TRIGGER payme_fixture_fault BEFORE UPDATE ON payme_merchant_transactions FOR EACH ROW EXECUTE FUNCTION app.payme_fixture_fault();`);
}
async function clearFailpoint(){await query('DROP TRIGGER IF EXISTS payme_fixture_fault ON payme_merchant_transactions; DROP FUNCTION IF EXISTS app.payme_fixture_fault();');}
async function auditProof(){
  const request=randomUUID();
  await inOrg(ORG,async c=>{
    await c.query("SELECT app.begin_provider_egress_attempt('fixture','audit',$1,100)",[request]);
    const v=(await c.query("SELECT app.complete_provider_egress_attempt('fixture','audit',$1,'failed','unknown',NULL,'EGRESS_TRANSPORT_FAILED',40) AS ok",[request])).rows[0];
    assert.equal(v.ok,true);
  });
  await assert.rejects(inOrg(ORG,c=>c.query("SELECT app.begin_provider_egress_attempt('fixture','audit',$1,100)",[request])),e=>e.code==='P0001'&&e.message.includes('PROVIDER_EGRESS_REQUEST_REPLAY'));
  await assert.rejects(inOrg(ORG,c=>c.query(`INSERT INTO provider_egress_attempts(organization_id,provider_id,operation_id,request_id,deadline_ms) VALUES($1,'fixture','fake',$2,100)`,[ORG,randomUUID()])),e=>e.code==='42501');
  await inOrg(OTHER,async c=>{
    assert.equal((await c.query('SELECT count(*)::int AS n FROM provider_egress_attempts')).rows[0].n,0);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM provider_egress_reconciliation_queue')).rows[0].n,0);
  });
  const stale=randomUUID();
  await inOrg(ORG,c=>c.query("SELECT app.begin_provider_egress_attempt('fixture','audit',$1,100)",[stale]));
  await query("UPDATE provider_egress_attempts SET started_at=now()-interval '2 minutes' WHERE request_id=$1",[stale]);
  await inOrg(ORG,async c=>assert.equal((await c.query('SELECT app.queue_stale_provider_egress_attempts(10) AS n')).rows[0].n,1));
  const worker=randomUUID();
  await inOrg(ORG,async c=>{
    const jobs=(await c.query('SELECT * FROM app.claim_provider_egress_reconciliation($1,2)',[worker])).rows;
    assert.equal(jobs.length,2);
    assert.equal((await c.query("SELECT app.finish_provider_egress_reconciliation($1,$2,true,'PROVIDER_NOT_APPLIED',60) AS status",[jobs[0].queue_id,worker])).rows[0].status,'resolved');
    assert.equal((await c.query("SELECT app.finish_provider_egress_reconciliation($1,$2,false,'PROVIDER_STATUS_UNAVAILABLE',60) AS status",[jobs[1].queue_id,worker])).rows[0].status,'pending');
  });
  const counts=(await query(`SELECT
    (SELECT count(*)::int FROM provider_egress_attempts WHERE organization_id=$1) AS attempts,
    (SELECT count(*)::int FROM provider_egress_reconciliation_queue WHERE organization_id=$1) AS reconciliation,
    (SELECT count(*)::int FROM outbox_events WHERE organization_id=$1 AND event_type='provider.egress.reconciliation_required') AS required,
    (SELECT count(*)::int FROM outbox_events WHERE organization_id=$1 AND event_type='provider.egress.reconciliation_resolved') AS resolved,
    (SELECT count(*)::int FROM outbox_events WHERE organization_id=$1 AND event_type LIKE 'provider.egress.%'
      AND payload ?| ARRAY['body','query','authorization','credential','token']) AS unsafe`,[ORG])).rows[0];
  assert.deepEqual(counts,{attempts:2,reconciliation:2,required:2,resolved:1,unsafe:0});return counts;
}
(async()=>{
  let report={schemaVersion:2,stage:process.env.VIEWS_PAYME_EXPIRY_PROOF==='true'?'7.21':'7.20',result:'fail',sourceCommit:process.env.VIEWS_PROOF_SOURCE_SHA||null,
    checks,httpCalls:0,officialSandboxEndpointInvoked:false,officialSandboxCredentialsUsed:false,productionActivated:false};
  try{
    for(const org of [ORG,OTHER])await query(`INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
      VALUES($1,'host','DISPOSABLE FIXTURE','{"en":"TEST ONLY"}','UZ','UZS','Asia/Tashkent')`,[org]);
    await check('runtime_identity_and_RLS',async()=>{
      const role=(await runtime.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.deepEqual(role,{name:'views_app',rolsuper:false,rolbypassrls:false});
      const tables=(await query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('payme_merchant_transactions','provider_egress_attempts')")).rows;
      assert.equal(tables.length,2);assert.ok(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
    });
    const f=await seed(),foreign=await seed(OTHER);
    await check('raw_JSON_and_JSON_RPC_errors',async()=>{
      error(await raw('{'),-32700);error(await raw('{','application/json'),-32700);
      for(const payload of ['null','[]','{}','{"id":"1","method":"GetStatement","params":{}}'])error(await raw(payload),-32600);
      error(await raw('x'.repeat(70000)),-32600);error(await rpc('UnknownMethod'),-32601);
      error(await rpc('CheckPerformTransaction',{amount:500000,account:{payment_intent_id:f.payment}},{auth:'Basic '+Buffer.from('views-payme-test:wrong').toString('base64')}),-32504);
      error(await raw(JSON.stringify({id:1,method:'GetStatement',params:{}}),'text/json',auth+'!'),-32504);
    });
    await check('account_amount_and_foreign_tenant_denial',async()=>{
      assert.equal(result(await rpc('CheckPerformTransaction',{amount:500000,account:{payment_intent_id:f.payment}})).allow,true);
      error(await rpc('CheckPerformTransaction',{amount:500001,account:{payment_intent_id:f.payment}}),-31001);
      error(await rpc('CheckPerformTransaction',{amount:500000,account:{payment_intent_id:foreign.payment}}),-31050);
      error(await rpc('CreateTransaction',{...createParams(f),amount:'500000'}),-32600);
    });
    await check('parallel_Create_exactly_one_and_stable_result',async()=>{
      const replies=await Promise.all(Array.from({length:12},()=>rpc('CreateTransaction',createParams(f))));
      const first=result(replies[0]);assert.equal(first.state,1);replies.forEach(r=>assert.deepEqual(result(r),first));
      assert.equal((await query('SELECT count(*)::int AS n FROM payme_merchant_transactions WHERE payment_intent_id=$1',[f.payment])).rows[0].n,1);
      const expiry=(await query('SELECT hold_expires_at FROM reservations WHERE id=$1',[f.reservation])).rows[0].hold_expires_at;
      assert.equal(expiry.getTime(),f.time+43_200_000);
    });
    await check('replay_payload_conflict_and_second_transaction_denied',async()=>{
      error(await rpc('CreateTransaction',{...createParams(f),id:'b'.repeat(24)}),-31008);
      error(await rpc('CreateTransaction',{...createParams(f),time:f.time+1}),-31008);
      error(await rpc('CreateTransaction',{...createParams(f),amount:500001}),-31001);
    });
    await check('parallel_Perform_single_capture_and_booking_confirmation',async()=>{
      const replies=await Promise.all(Array.from({length:10},()=>rpc('PerformTransaction',{id:f.tx})));
      const first=result(replies[0]);assert.equal(first.state,2);replies.forEach(r=>assert.deepEqual(result(r),first));
      const s=await snapshot(f);assert.equal(s.transaction.state,2);assert.equal(s.payment.status,'captured');
      assert.equal(s.payment.captured_minor,'500000');assert.equal(s.reservation,'confirmed');
      assert.equal(s.financial,1);assert.equal(s.inbox,1);assert.equal(s.journals,1);assert.equal(s.inventory,1);
    });
    await check('inclusive_GetStatement_and_empty_range',async()=>{
      const rows=result(await rpc('GetStatement',{from:f.time,to:f.time})).transactions;
      assert.equal(rows.length,1);assert.equal(rows[0].id,f.tx);assert.equal(rows[0].state,2);
      assert.deepEqual(result(await rpc('GetStatement',{from:Date.now()+10000,to:Date.now()+20000})).transactions,[]);
    });
    await check('parallel_Cancel_single_refund_and_inventory_release',async()=>{
      const replies=await Promise.all(Array.from({length:10},()=>rpc('CancelTransaction',{id:f.tx,reason:5})));
      const first=result(replies[0]);assert.equal(first.state,-2);replies.forEach(r=>assert.deepEqual(result(r),first));
      assert.deepEqual(result(await rpc('CancelTransaction',{id:f.tx,reason:10})),first);
      const s=await snapshot(f);assert.equal(s.payment.status,'refunded');assert.equal(s.payment.refunded_minor,'500000');
      assert.equal(s.reservation,'cancelled');assert.equal(s.financial,2);assert.equal(s.inbox,2);assert.equal(s.journals,2);assert.equal(s.inventory,0);
      assert.equal(result(await rpc('CheckTransaction',{id:f.tx})).reason,5);
      error(await rpc('PerformTransaction',{id:f.tx}),-31008);
    });
    await check('cancel_unperformed_has_no_financial_posting',async()=>{
      const u=await seed();await create(u);
      assert.equal(result(await rpc('CancelTransaction',{id:u.tx,reason:3})).state,-1);
      const s=await snapshot(u);assert.equal(s.financial,0);assert.equal(s.inbox,0);assert.equal(s.journals,0);assert.equal(s.inventory,0);
    });
    await check('timeout_persists_reason_4_even_when_Perform_returns_error',async()=>{
      const u=await seed();await create(u);
      await query('UPDATE payme_merchant_transactions SET payme_time_ms=$2 WHERE payment_intent_id=$1',[u.payment,Date.now()-43_200_001]);
      error(await rpc('PerformTransaction',{id:u.tx}),-31008);
      const s=await snapshot(u);assert.equal(s.transaction.state,-1);assert.equal(s.transaction.reason,4);assert.equal(s.financial,0);assert.equal(s.inventory,0);
      assert.equal(result(await rpc('CheckTransaction',{id:u.tx})).reason,4);
    });
    await check('capture_failpoint_rolls_back_money_inbox_booking_and_provider_state',async()=>{
      const u=await seed();await create(u);await failpoint(u,2);
      try{error(await rpc('PerformTransaction',{id:u.tx}),-32400);}
      finally{await clearFailpoint();}
      const s=await snapshot(u);assert.equal(s.transaction.state,1);assert.equal(s.payment.captured_minor,'0');assert.equal(s.financial,0);assert.equal(s.inbox,0);assert.equal(s.journals,0);assert.equal(s.reservation,'hold');
      assert.equal(result(await rpc('PerformTransaction',{id:u.tx})).state,2);
      await failpoint(u,-2);
      try{error(await rpc('CancelTransaction',{id:u.tx,reason:5}),-32400);}
      finally{await clearFailpoint();}
      const before=await snapshot(u);assert.equal(before.transaction.state,2);assert.equal(before.payment.refunded_minor,'0');assert.equal(before.financial,1);assert.equal(before.inbox,1);assert.equal(before.journals,1);assert.equal(before.reservation,'confirmed');
      assert.equal(result(await rpc('CancelTransaction',{id:u.tx,reason:5})).state,-2);
    });
    await check('concurrent_Perform_and_Cancel_leave_only_legal_financial_state',async()=>{
      const u=await seed();await create(u);
      const responses=await Promise.all([rpc('PerformTransaction',{id:u.tx}),rpc('CancelTransaction',{id:u.tx,reason:5})]);
      const s=await snapshot(u);assert.ok([-1,-2].includes(s.transaction.state));assert.equal(s.reservation,'cancelled');assert.equal(s.inventory,0);
      if(s.transaction.state===-1){assert.equal(s.financial,0);assert.equal(s.payment.captured_minor,'0');}
      else{assert.equal(s.financial,2);assert.equal(s.payment.captured_minor,s.payment.refunded_minor);}
      responses.forEach(r=>{if(r.error)assert.equal(r.error.code,-31008);});
    });
    await check('checked_in_service_cannot_be_cancelled',async()=>{
      const u=await seed();await create(u);result(await rpc('PerformTransaction',{id:u.tx}));
      await query("UPDATE reservations SET status='checked_in' WHERE id=$1",[u.reservation]);
      error(await rpc('CancelTransaction',{id:u.tx,reason:5}),-31007);
      assert.equal((await snapshot(u)).transaction.state,2);
    });
    await check('tenant_binding_foreign_key_and_actual_RLS_visibility',async()=>{
      await assert.rejects(query(`INSERT INTO payme_merchant_transactions(organization_id,payment_intent_id,payme_transaction_id,payme_time_ms,amount_minor,account,create_time_ms,state)
        VALUES($1,$2,$3,$4,500000,$5::jsonb,$4,1)`,[ORG,foreign.payment,'f'.repeat(24),Date.now(),JSON.stringify({payment_intent_id:foreign.payment})]),e=>e.code==='23503');
      await inOrg(OTHER,async c=>assert.equal((await c.query('SELECT count(*)::int AS n FROM payme_merchant_transactions')).rows[0].n,0));
    });
    await check('every_posted_journal_balances',async()=>{
      const bad=(await query(`SELECT j.id FROM ledger_journals j JOIN ledger_entries e ON e.journal_id=j.id WHERE j.organization_id=$1 AND j.status='posted'
        GROUP BY j.id HAVING sum(CASE WHEN e.side='debit' THEN e.amount_minor ELSE -e.amount_minor END)<>0`,[ORG])).rows;
      assert.deepEqual(bad,[]);
    });
    if(process.env.VIEWS_PAYME_EXPIRY_PROOF==='true'){
      await require('./payme-expiry.integration.cjs')({check,seed,create,rpc,result,error,query,snapshot,failpoint,clearFailpoint,ORG,OTHER});
    }
    let auditCounts;
    await check('durable_audit_SQL_really_executes_replay_RLS_stale_and_outbox_checks',async()=>{auditCounts=await auditProof();});
    report={...report,result:'pass',httpCalls,checkCount:checks.length,auditCounts,
      mainPayment:await snapshot(f),expiryWorkerVerified:process.env.VIEWS_PAYME_EXPIRY_PROOF==='true',parallelReplayVerified:true,atomicFailureRollbackVerified:true,
      timeoutVerified:true,tenantIsolationVerified:true,allPostedJournalsBalanced:true,
      limitations:['Real HTTP against local fixture Core, not external Payme sandbox certification','Two fixture tenant organizations only','No production credentials, charges or deployment']};
  }catch(e){report={...report,httpCalls,checkCount:checks.length,error:{code:e.code||'TEST_ASSERTION',message:String(e.message)}};process.exitCode=1;}
  finally{await admin.end();await runtime.end();}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
