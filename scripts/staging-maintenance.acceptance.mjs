import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {configuration,classifyWorker,executeWorker,MaintenanceRunner,healthOf} from '../apps/api/ops/staging-maintenance.mjs';
const directories=[];
async function dir(){const value=await mkdtemp(path.join(tmpdir(),'views-maintenance-'));directories.push(value);return value;}
after(async()=>{for(const directory of directories)await rm(directory,{recursive:true,force:true});});
const env={VIEWS_STAGING_MAINTENANCE_ENABLED:'true',VIEWS_ENV:'staging',VIEWS_PAYME_MODE:'sandbox',VIEWS_PAYME_SANDBOX_ENABLED:'true',
  VIEWS_STAGING_COST_ACK:'NO_NEW_SPEND',VIEWS_STAGING_RELEASE_SHA:'a'.repeat(40),VIEWS_PAYME_ORGANIZATION_ID:'73000000-0000-4000-8000-000000000001'};
const good={schemaVersion:1,mode:'sandbox',enabled:true,candidates:1,expired:1,unchanged:0,busy:0,conflicts:0,failed:0,budgetExhausted:false,hasMore:false,elapsedMs:1};
async function fixture(source){const file=path.join(await dir(),'worker.cjs');await writeFile(file,source);return file;}
const goodSource='console.log('+JSON.stringify(JSON.stringify(good))+');';
test('disabled config touches no directory or worker',async()=>{
  assert.deepEqual(configuration({}),{enabled:false});let called=false;
  const r=await new MaintenanceRunner({enabled:false},{worker:async()=>{called=true;}}).runOnce();
  assert.equal(r.status,'disabled');assert.equal(called,false);
});
for(const [key,value] of [['VIEWS_ENV','production'],['VIEWS_PAYME_MODE','production'],['VIEWS_PAYME_SANDBOX_ENABLED','false'],
  ['VIEWS_STAGING_COST_ACK','yes'],['VIEWS_STAGING_RELEASE_SHA','latest'],['VIEWS_PAYME_ORGANIZATION_ID','not-a-uuid'],
  ['VIEWS_STAGING_MAINTENANCE_INTERVAL_SECONDS','1'],['VIEWS_STAGING_MAINTENANCE_TIMEOUT_SECONDS','0'],['VIEWS_STAGING_MAINTENANCE_LIMIT','101']]){
  test('activation guard rejects '+key,()=>assert.throws(()=>configuration({...env,[key]:value})));
}
test('report directory rejects relative or traversal paths',()=>{
  for(const value of ['/', '../report','/tmp/../report'])assert.throws(()=>configuration({...env,VIEWS_STAGING_REPORT_DIR:value}));
});
test('default cadence and child timeout are bounded',()=>{
  const c=configuration(env);assert.equal(c.intervalMs,300000);assert.equal(c.timeoutMs,45000);assert.equal(c.limit,50);
});
test('worker output drops credential and body fields',()=>{
  const r=classifyWorker({...good,authorization:'secret-token',body:{passport:'secret'}},0);
  assert.equal(r.status,'healthy');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('inconsistent counters cannot produce success',()=>{
  assert.throws(()=>classifyWorker({...good,candidates:2},0));assert.throws(()=>classifyWorker({...good,expired:-1},0));
});
test('worker error, disabled mode and exit mismatches cannot pass',()=>{
  assert.throws(()=>classifyWorker({enabled:false},0));assert.throws(()=>classifyWorker(good,1));
  assert.equal(classifyWorker({...good,expired:0,failed:1},1).status,'error');
  assert.equal(classifyWorker({...good,expired:0,conflicts:1},1).status,'degraded');
  assert.equal(classifyWorker({...good,hasMore:true},0).status,'degraded');
});
test('actual child executes and returns sanitized report',async()=>{
  const r=await executeWorker({workerFile:await fixture(goodSource),limit:50,timeoutMs:2000});
  assert.equal(r.status,'healthy');assert.equal(r.summary.expired,1);
});
test('actual hung child is killed at deadline',async()=>{
  const pid=path.join(await dir(),'pid');
  const file=await fixture('require("node:fs").writeFileSync('+JSON.stringify(pid)+',String(process.pid));setInterval(()=>{},100);');
  const r=await executeWorker({workerFile:file,limit:1,timeoutMs:500});
  assert.equal(r.code,'WORKER_DEADLINE');const value=Number(await readFile(pid,'utf8'));
  assert.throws(()=>process.kill(value,0),e=>e.code==='ESRCH');
});
test('SIGTERM-resistant child is force killed',async()=>{
  const file=await fixture('process.on("SIGTERM",()=>{});setInterval(()=>{},100);');
  const start=Date.now();const r=await executeWorker({workerFile:file,limit:1,timeoutMs:200});
  assert.equal(r.code,'WORKER_DEADLINE');assert.ok(Date.now()-start<4000);
});
test('shutdown cancels current child',async()=>{
  const control=new AbortController();const file=await fixture('setInterval(()=>{},100);');
  setTimeout(()=>control.abort(),100);const r=await executeWorker({workerFile:file,limit:1,timeoutMs:5000,signal:control.signal});
  assert.equal(r.status,'interrupted');assert.equal(r.code,'SHUTDOWN');
});
test('malformed and excessive output are failures without raw output',async()=>{
  const malformed=await executeWorker({workerFile:await fixture('console.log("Bearer VERY_SECRET");'),limit:1,timeoutMs:2000});
  assert.equal(malformed.status,'error');assert.ok(!JSON.stringify(malformed).includes('VERY_SECRET'));
  const large=await executeWorker({workerFile:await fixture('process.stdout.write("x".repeat(40000));setInterval(()=>{},100);'),limit:1,timeoutMs:2000});
  assert.equal(large.code,'WORKER_OUTPUT_LIMIT');
});
test('running receipt precedes dispatch; completed receipts survive restart',async()=>{
  const directory=await dir(),c=configuration({...env,VIEWS_STAGING_REPORT_DIR:directory});
  const worker=async()=>{assert.equal(JSON.parse(await readFile(path.join(directory,'latest.json'))).status,'running');return classifyWorker(good,0);};
  const first=await new MaintenanceRunner(c,{worker}).runOnce();assert.equal(first.status,'healthy');
  const second=await new MaintenanceRunner(c,{worker}).runOnce();assert.notEqual(first.runId,second.runId);
  const receipt=JSON.parse(await readFile(path.join(directory,'latest.json')));assert.equal(receipt.runId,second.runId);
  assert.equal((await stat(path.join(directory,'latest.json'))).mode&0o777,0o600);
});
test('old success is replaced before failure',async()=>{
  const directory=await dir(),c=configuration({...env,VIEWS_STAGING_REPORT_DIR:directory});
  await new MaintenanceRunner(c,{worker:async()=>classifyWorker(good,0)}).runOnce();
  const report=await new MaintenanceRunner(c,{worker:async()=>({status:'error',code:'WORKER_DEADLINE',summary:null})}).runOnce();
  assert.equal(report.status,'error');assert.equal(healthOf(JSON.parse(await readFile(path.join(directory,'latest.json'))),c).healthy,false);
});
test('one runner never overlaps cycles',async()=>{
  const c=configuration({...env,VIEWS_STAGING_REPORT_DIR:await dir()});let release;
  const runner=new MaintenanceRunner(c,{worker:()=>new Promise(resolve=>{release=()=>resolve(classifyWorker(good,0));})});
  const pending=runner.runOnce();await assert.rejects(runner.runOnce(),/ALREADY_RUNNING/);
  while(!release)await new Promise(resolve=>setTimeout(resolve,5));release();await pending;
});
test('retention is bounded',async()=>{
  const c={...configuration({...env,VIEWS_STAGING_REPORT_DIR:await dir()}),retention:2};
  const runner=new MaintenanceRunner(c,{worker:async()=>classifyWorker(good,0)});
  for(let i=0;i<4;i++)await runner.runOnce();assert.equal((await readdir(path.join(c.directory,'history'))).length,2);
});
test('health detects stale, wrong-release, missing and future receipts',()=>{
  const c=configuration(env),now=Date.now(),receipt={schemaVersion:1,release:c.release,status:'healthy',finishedAt:new Date(now).toISOString()};
  assert.equal(healthOf(receipt,c,now).healthy,true);assert.equal(healthOf(receipt,c,now+500000).code,'HEARTBEAT_STALE');
  assert.equal(healthOf({...receipt,release:'b'.repeat(40)},c,now).healthy,false);
  assert.equal(healthOf(null,c,now).healthy,false);assert.equal(healthOf(receipt,c,now-10000).healthy,false);
});
test('symlink report directory is refused before dispatch',async()=>{
  const directory=await dir(),link=path.join(await dir(),'alias');await symlink(directory,link);let called=false;
  const c=configuration({...env,VIEWS_STAGING_REPORT_DIR:link});
  await assert.rejects(new MaintenanceRunner(c,{worker:async()=>{called=true;}}).runOnce());assert.equal(called,false);
});
