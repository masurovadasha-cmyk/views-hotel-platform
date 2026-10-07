'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {npmInvocation,runBundledNpm,passkeyPilotSelection,passkeyProbeResult,probeLocalPasskey}=require('../apps/api/ops/windows-rollout-runtime.cjs');
const {readPasskeySnapshot}=require('../apps/api/ops/windows-passkey-observation.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'views stage731 tests '));after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('explicit local flag only; unknown or non-start flags fail',()=>{
 assert.equal(passkeyPilotSelection('start',[]),false);assert.equal(passkeyPilotSelection('start',['--enable-local-passkey-pilot']),true);
 for(const a of [['--production'],['--enable-local-passkey-pilot','extra']])assert.throws(()=>passkeyPilotSelection('start',a));
 assert.throws(()=>passkeyPilotSelection('init',['--enable-local-passkey-pilot']));
});
test('bundled npm invocation is Node plus a separate script path, never .cmd or shell',()=>{
 const node=path.join(root,process.platform==='win32'?'node.exe':'node'),cli=path.join(root,'node_modules/npm/bin/npm-cli.js');
 fs.mkdirSync(path.dirname(cli),{recursive:true});fs.writeFileSync(node,'fixture');fs.writeFileSync(cli,'fixture');
 assert.deepEqual(npmInvocation(node,['run','build']),{exe:node,args:[cli,'run','build'],shell:false});
 for(const args of [['install'],['run','build; bad'],['run','deploy'],['--version','other']])assert.throws(()=>npmInvocation(node,args));
});
test('a runnable CLI must actually exist before service downtime',()=>assert.throws(()=>npmInvocation(path.join(root,'missing/node.exe'),['--version'])));
test('runtime proof requires enabled handler AND an intact staff-session guard',()=>{
 assert.equal(passkeyProbeResult(401,{message:'STAFF_SESSION_REQUIRED'}).enabled,true);
 for(const [status,body] of [[404,{message:'STAFF_PASSKEY_NOT_ACTIVATED'}],[401,{message:'STAFF_GATEWAY_REQUIRED'}],[200,{enabled:true}],[500,{}]])assert.throws(()=>passkeyProbeResult(status,body));
});
test('negative probe never supplies a user session or caller-controlled URL',async()=>{
 let request;const result=await probeLocalPasskey('a'.repeat(64),async(url,options)=>{request={url,options};return {status:401,json:async()=>({message:'STAFF_SESSION_REQUIRED'})};});
 assert.equal(result.sessionRequired,true);assert.equal(request.url,'http://127.0.0.1:3001/v1/staff-auth/passkey/state');
 assert.equal(request.options.headers['x-views-staff-session'],undefined);assert.equal(request.options.headers['x-organization-id'],undefined);
});
test('snapshot is read-only, schema-correct and binds evidence to its live session',async()=>{
 const calls=[],now=new Date('2026-01-01T00:01:00Z');
 const db={query:async(sql,args)=>{calls.push(sql);if(sql.includes('checked_at'))return {rows:[{checked_at:now}]};
  if(sql.includes('SELECT k.id'))return {rows:[]};if(sql.includes('SELECT a.action'))return {rows:[]};return {rows:[]};}};
 const uuid='10000000-0000-4000-8000-000000000001';const r=await readPasskeySnapshot(db,uuid,uuid,'2026-01-01T00:00:00Z');
 assert.equal(r.sessionProofObserved,false);assert.match(calls[0],/READ ONLY/);assert.equal(calls.at(-1),'COMMIT');
 const sql=calls.find(x=>x.includes('SELECT a.action'));assert.match(sql,/a\.created_at/);assert.ok(!sql.includes('occurred_at'));
 assert.match(sql,/s\.id=a\.entity_id/);assert.match(sql,/s\.idle_expires_at>/);assert.match(sql,/c\.version=s\.credential_version/);
});
test('SQL failure rolls back rather than publishing a partial snapshot',async()=>{
 const calls=[];await assert.rejects(readPasskeySnapshot({query:async sql=>{calls.push(sql);if(sql.includes('checked_at'))throw Error('DB_FAILED');return {rows:[]};}},'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z'));
 assert.equal(calls.at(-1),'ROLLBACK');
});
test('operator programs parse without executing private state helpers',()=>{
 for(const f of ['windows-local-rollout.cjs','windows-physical-passkey-proof.cjs','windows-local-rehearsal.cjs']){
  const r=spawnSync(process.execPath,['--check',path.resolve(__dirname,'../apps/api/ops',f)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }
});
