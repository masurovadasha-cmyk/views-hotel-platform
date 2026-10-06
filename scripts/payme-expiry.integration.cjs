'use strict';
// Reuse the real HTTP lifecycle fixture, but execute the compiled maintenance
// worker against the restricted DB role. No provider network call is allowed.
module.exports=async function({check,seed,create,rpc,result,error,query,snapshot,failpoint,clearFailpoint,ORG,OTHER}){
  const assert=require('node:assert/strict');
  const {spawnSync}=require('node:child_process');
  const {Pool}=require('pg');
  const {DatabaseService}=require(require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','database/database.service'));
  const {PaymeMerchantApiService}=require(require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','payments/payme-merchant-api.service'));
  const {PaymeExpiryWorkerService}=require(require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','payments/payme-expiry-worker.service'));
  const db=new DatabaseService();
  const neverSend={processVerifiedInTransaction(){throw Error('EXPIRY_MUST_NOT_CREATE_FINANCIAL_EVENT');}};
  const worker=new PaymeExpiryWorkerService(db,new PaymeMerchantApiService(db,neverSend));
  const admin=new Pool({connectionString:process.env.PAYME_PROOF_ADMIN_DATABASE_URL,max:2});
  const overdue=async()=>{
    const f=await seed();await create(f);
    await query('UPDATE payme_merchant_transactions SET payme_time_ms=$2 WHERE payment_intent_id=$1',[f.payment,Date.now()-43_201_000]);
    return f;
  };
  const run=()=>worker.runCycle(100);
  const assertExpired=async f=>{
    const s=await snapshot(f);assert.equal(s.transaction.state,-1);assert.equal(s.transaction.reason,4);
    assert.equal(s.payment.captured_minor,'0');assert.equal(s.financial,0);assert.equal(s.inbox,0);
    assert.equal(s.journals,0);assert.equal(s.inventory,0);assert.equal(s.reservation,'cancelled');
  };
  try{
    await check('expiry_batch_limit_future_paid_and_foreign_tenant_protection',async()=>{
      const due=[await overdue(),await overdue()];
      const future=await seed();await create(future);
      const paid=await seed();await create(paid);result(await rpc('PerformTransaction',{id:paid.tx}));
      const foreign=await seed(OTHER);
      await query(`INSERT INTO payme_merchant_transactions(organization_id,payment_intent_id,payme_transaction_id,payme_time_ms,amount_minor,account,create_time_ms,state)
        VALUES($1,$2,$3,$4,500000,$5::jsonb,$6,1)`,[OTHER,foreign.payment,foreign.tx,Date.now()-43_201_000,JSON.stringify({payment_intent_id:foreign.payment}),Date.now()]);
      const first=await worker.runCycle(1);assert.equal(first.expired,1);assert.equal(first.candidates,1);assert.equal(first.hasMore,true);
      const second=await run();assert.equal(second.expired,1);assert.equal(second.failed,0);
      for(const f of due)await assertExpired(f);
      assert.equal((await snapshot(future)).transaction.state,1);
      assert.equal((await snapshot(paid)).transaction.state,2);
      assert.equal((await snapshot(foreign)).transaction.state,1);
    });
    await check('expiry_repeated_cycle_emits_no_duplicate_events',async()=>{
      const before=(await query("SELECT count(*)::int AS n FROM outbox_events WHERE organization_id=$1 AND event_type='booking.cancelled'",[ORG])).rows[0].n;
      const report=await run();assert.equal(report.expired,0);assert.equal(report.failed,0);
      assert.equal((await query("SELECT count(*)::int AS n FROM outbox_events WHERE organization_id=$1 AND event_type='booking.cancelled'",[ORG])).rows[0].n,before);
    });
    await check('parallel_expiry_workers_commit_each_timeout_once',async()=>{
      const fixtures=[];for(let i=0;i<4;i++)fixtures.push(await overdue());
      const reports=await Promise.all(Array.from({length:6},()=>run()));
      assert.equal(reports.reduce((sum,r)=>sum+r.expired,0),4);
      assert.equal(reports.reduce((sum,r)=>sum+r.failed,0),0);
      for(const f of fixtures)await assertExpired(f);
    });
    for(const kind of ['advisory','intent','reservation']){
      await check('expiry_skips_busy_'+kind+'_and_recovers_after_release',async()=>{
        const f=await overdue(),c=await admin.connect();
        try{
          await c.query('BEGIN');
          if(kind==='advisory')await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['payme:'+ORG+':'+f.tx]);
          else if(kind==='intent')await c.query('SELECT id FROM payment_intents WHERE id=$1 FOR UPDATE',[f.payment]);
          else await c.query('SELECT id FROM reservations WHERE id=$1 FOR UPDATE',[f.reservation]);
          const start=Date.now(),report=await run();
          assert.equal(report.expired,0);assert.equal(report.busy,1);assert.equal(report.failed,0);
          assert.ok(Date.now()-start<2000,'worker waited on a live payment lock');
        }finally{await c.query('ROLLBACK');c.release();}
        assert.equal((await run()).expired,1);await assertExpired(f);
      });
    }
    await check('expiry_failure_rolls_back_provider_booking_inventory_and_outbox',async()=>{
      const f=await overdue();await failpoint(f,-1);
      try{const report=await run();assert.equal(report.failed,1);assert.equal(report.expired,0);}
      finally{await clearFailpoint();}
      const before=await snapshot(f);assert.equal(before.transaction.state,1);assert.equal(before.reservation,'hold');assert.equal(before.inventory,1);
      assert.equal((await run()).expired,1);await assertExpired(f);
    });
    await check('expiry_refuses_inconsistent_captured_amount',async()=>{
      const f=await overdue();
      await query("UPDATE payment_intents SET status='captured',captured_minor=100 WHERE id=$1",[f.payment]);
      const report=await run();assert.equal(report.conflicts,1);assert.equal(report.expired,0);
      assert.equal((await snapshot(f)).transaction.state,1);
      error(await rpc('CheckTransaction',{id:f.tx}),-31008);
      await query("UPDATE payment_intents SET status='pending_provider',captured_minor=0 WHERE id=$1",[f.payment]);
      assert.equal((await run()).expired,1);await assertExpired(f);
    });
    await check('expiry_and_late_Perform_race_never_captures',async()=>{
      const f=await overdue();
      const [,response]=await Promise.all([run(),rpc('PerformTransaction',{id:f.tx})]);
      error(response,-31008);await assertExpired(f);
    });
    await check('expiry_disabled_and_cli_arguments_fail_closed',async()=>{
      const before=process.env.VIEWS_PAYME_SANDBOX_ENABLED;
      try{
        process.env.VIEWS_PAYME_SANDBOX_ENABLED='false';
        const report=await run();assert.equal(report.enabled,false);assert.equal(report.candidates,0);
        const cli=spawnSync(process.execPath,[require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','payments/run-payme-expiry.js'),'--ack=STAGING_EXPIRY_ONLY'],{encoding:'utf8',timeout:10000});
        assert.equal(cli.status,0);assert.equal(JSON.parse(cli.stdout).enabled,false);
      }finally{process.env.VIEWS_PAYME_SANDBOX_ENABLED=before;}
      const bad=spawnSync(process.execPath,[require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','payments/run-payme-expiry.js')],{encoding:'utf8',timeout:10000});
      assert.equal(bad.status,2);assert.equal(JSON.parse(bad.stderr).error,'PAYME_EXPIRY_RUN_FAILED');
      const valid=spawnSync(process.execPath,[require('node:path').join(process.env.VIEWS_API_DIR||'/app','dist','payments/run-payme-expiry.js'),'--ack=STAGING_EXPIRY_ONLY','--limit=1'],{encoding:'utf8',timeout:15000});
      assert.equal(valid.status,0,valid.stderr);const report=JSON.parse(valid.stdout);
      assert.equal(report.enabled,true);assert.equal(report.expired,0);
    });
  }finally{await db.onModuleDestroy();await admin.end();}
};
