'use strict';
// Disposable hosted CI only. Does not use the user's VIEWS-Staging state,
// password files, running DB, registered keys or Windows Hello profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process'),{randomUUID,randomBytes}=require('node:crypto');
const API=path.resolve(__dirname,'../apps/api'),REPO=path.resolve(__dirname,'..');
const {Client}=require(path.join(API,'node_modules/pg'));
const {runBundledNpm,passkeyPilotSelection,probeLocalPasskey}=require(path.join(API,'ops/windows-rollout-runtime.cjs'));
const {readPasskeySnapshot}=require(path.join(API,'ops/windows-passkey-observation.cjs'));
const {backupRestoreProof}=require(path.join(API,'ops/windows-rollout-database.cjs'));
const {assessPasskeyEvidence}=require('./windows-local-rollout-safety.cjs');
const assert=require('node:assert/strict');
const checks=[];let cluster,owner,child,started=false,pgBin,connection;
function command(exe,args,{cwd=REPO,env=process.env,log}={}){
 let fd;if(log)fd=fs.openSync(log,'a');let r;
 try{r=spawnSync(exe,args,{cwd,env,encoding:'utf8',windowsHide:true,shell:false,timeout:180000,maxBuffer:8*1024*1024,...(fd!==undefined?{stdio:['ignore',fd,fd]}:{})});}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 if(r.error||r.status!==0)throw Error('CI_COMMAND_FAILED:'+path.basename(exe)+':'+(r.status??r.error?.code));
 return r.stdout||'';
}
async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
const ext=process.platform==='win32'?'.exe':'';
const pg=name=>path.join(pgBin,name+ext);
async function stopCore(){
 if(!child)return;const c=child;child=null;
 c.kill('SIGTERM');await Promise.race([new Promise(r=>c.once('exit',r)),new Promise(r=>setTimeout(()=>{c.kill('SIGKILL');r();},3000))]);
}
async function startCore(enabled,key,org){
 await stopCore();
 const env={...process.env,NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_ENV:'local-rehearsal',TRUSTED_PROXY_MODE:'direct',PORT:'3001',
  DATABASE_URL:'postgresql://views_app:fixture-runtime@127.0.0.1:55432/views_local',GUEST_AUTH_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),
  VIEWS_INTERNAL_API_KEY:key,VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:'{"local-workspace":"internal_key_only"}',
  VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({'local-workspace':[key]}),VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:'{"local-workspace":["127.0.0.1/32"]}',
  VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:'{}',VIEWS_TRUSTED_PROXY_CIDRS_JSON:'',VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:'',
  VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org,VIEWS_PAYME_MODE:'sandbox',VIEWS_PAYME_SANDBOX_ENABLED:'false',
  VIEWS_STAGING_MAINTENANCE_ENABLED:'false',VIEWS_STAFF_PASSKEY_PILOT_ENABLED:enabled?'true':'false'};
 child=spawn(process.execPath,[path.join(API,'dist/main.js')],{cwd:API,env,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){
  try{const r=await fetch('http://127.0.0.1:3001/readiness',{signal:AbortSignal.timeout(600)});if(r.ok&&(await r.json()).database==='ok')return;}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('CI_CORE_NOT_READY');
}
(async()=>{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.VIEWS_ROLLOUT_CI_ACK!=='DISPOSABLE_STAGE731_ONLY'||!process.env.RUNNER_TEMP)
  throw Error('DISPOSABLE_HOSTED_CI_REQUIRED');
 const sourceCommit=process.env.GITHUB_SHA,report={schemaVersion:1,stage:'7.31',result:'fail',sourceCommit,platform:process.platform,node:process.version,
  checks,userComputerModified:false,userDatabaseModified:false,physicalWebAuthnVerified:false,fixtureSessionEvidenceOnly:true,productionEnabled:false};
 let stage='preflight';
 try{
  pgBin=process.env.VIEWS_TEST_PG_BIN;
  if(!pgBin||!path.isAbsolute(pgBin))throw Error('CI_POSTGRES_BIN_REQUIRED');
  for(const f of ['initdb','pg_ctl','pg_dump','pg_restore'])assert.ok(fs.existsSync(pg(f)),'CI_PG_TOOL_MISSING:'+f);
  report.postgresTool=command(pg('pg_dump'),['--version']).trim();
  if(process.platform==='win32'){
   await check('real_Windows_Node_npm_cli_and_space_in_path',async()=>{
    report.npm=runBundledNpm(process.execPath,['--version'],{cwd:REPO}).trim();
    const fixture=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'views npm space '));
    try{fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'views-fixture',version:'1.0.0',scripts:{build:'node build.cjs'}}));
     fs.writeFileSync(path.join(fixture,'build.cjs'),"require('fs').writeFileSync('built.txt','fixture build executed');");
     runBundledNpm(process.execPath,['run','build'],{cwd:fixture});assert.equal(fs.readFileSync(path.join(fixture,'built.txt'),'utf8'),'fixture build executed');
    }finally{fs.rmSync(fixture,{recursive:true,force:true});}
   });
   await check('real_Windows_web_and_Core_builds_using_bundled_npm',async()=>{
    for(const cwd of [REPO,API])runBundledNpm(process.execPath,['run','build'],{cwd});
   });
  }
  stage='database';cluster=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'views-stage731-pg-'));
  await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('CI_PORT_ALREADY_IN_USE')));s.listen(55432,'127.0.0.1',()=>s.close(resolve));});
  command(pg('initdb'),['-D',path.join(cluster,'data'),'-U','views_stage731_owner','--encoding=UTF8','--locale=C','--auth=trust']);
  // Debian packages default to a shared system socket directory. Keep this
  // disposable cluster's socket inside its own directory; no sudo/chmod needed.
  if(process.platform!=='win32'){
   const escaped=cluster.replace(/'/g,"''");
   fs.appendFileSync(path.join(cluster,'data','postgresql.conf'),"\nunix_socket_directories = '"+escaped+"'\n");
  }
  try{
   command(pg('pg_ctl'),['start','-D',path.join(cluster,'data'),'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p 55432','-w','-t','30'],{log:path.join(cluster,'ctl.log')});
   started=true;
  }catch(e){
   // At this point there are no test credentials, users or application queries
   // in PostgreSQL. Retain startup diagnostics only, never a private dump.
   const out=path.join(REPO,'rollout-evidence');fs.mkdirSync(out,{recursive:true});
   for(const name of ['ctl.log','server.log']){const f=path.join(cluster,name);if(fs.existsSync(f))fs.copyFileSync(f,path.join(out,'startup-'+name));}
   throw e;
  }
  connection={host:'127.0.0.1',port:55432,database:'views_local',user:'views_stage731_owner',connectionTimeoutMillis:5000};
  const admin=new Client({...connection,database:'postgres'});await admin.connect();await admin.query('CREATE DATABASE views_local');await admin.end();
  owner=new Client(connection);await owner.connect();
  await owner.query(fs.readFileSync(path.join(REPO,'infra/postgres/init/001_extensions.sql'),'utf8'));
  const migrationNames=fs.readdirSync(path.join(API,'db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  for(const f of migrationNames)await owner.query(fs.readFileSync(path.join(API,'db/migrations',f),'utf8'));
  report.migrationsApplied=migrationNames.length;
  await owner.query("CREATE ROLE views_app LOGIN PASSWORD 'fixture-runtime' NOSUPERUSER NOBYPASSRLS; GRANT CONNECT ON DATABASE views_local TO views_app; GRANT USAGE ON SCHEMA public,app TO views_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO views_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_app;");
  const org=randomUUID(),user=randomUUID(),member=randomUUID(),session=randomUUID(),otherSession=randomUUID();
  await owner.query(`INSERT INTO public.organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
   VALUES($1,'host','DISPOSABLE ROLLOUT CI','{"en":"TEST ONLY"}','UZ','UZS','Asia/Tashkent')`,[org]);
  await owner.query("INSERT INTO public.users(id,email,display_name,status) VALUES($1,'stage731@views.invalid','CI fixture','active')",[user]);
  await owner.query("INSERT INTO public.organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$3,id,'active' FROM public.roles WHERE code='front_desk'",[member,org,user]);
  const hash='scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64);
  await owner.query("INSERT INTO staff_private.credentials(membership_id,password_hash,verification_channel) VALUES($1,$2,'local_fixture')",[member,hash]);
  for(const s of [session,otherSession])await owner.query(`INSERT INTO staff_private.sessions(id,token_hash,membership_id,credential_version,role_id)
   SELECT $1,$2,$3,1,role_id FROM public.organization_memberships WHERE id=$3`,[s,randomBytes(32).toString('hex'),member]);
  let baseline;
  await check('real_schema_read_only_snapshot_uses_created_at',async()=>{
   baseline=await readPasskeySnapshot(owner,org,member,new Date().toISOString());assert.equal(baseline.passkeyCount,0);
  });
  const startedAt=baseline.checkedAt;
  await owner.query("INSERT INTO staff_private.passkeys(id,membership_id,public_key,counter) VALUES('ci-key-1',$1,$2,0)",[member,Buffer.alloc(64,1)]);
  await owner.query("UPDATE staff_private.sessions SET passkey_verified_until=now()+interval '5 minutes' WHERE id=$1",[session]);
  const audit=randomUUID();
  await owner.query(`INSERT INTO public.audit_log(id,organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id)
   VALUES($1,$2,$3,$4,'staff.passkey_registered','staff_session',$5)`,[audit,org,user,member,session]);
  const before={...baseline,sourceCommit,membershipId:member,startedAt};
  const read=async()=>({sourceCommit,membershipId:member,...await readPasskeySnapshot(owner,org,member,startedAt),externalEmailSent:false,productionEnabled:false});
  await check('matching_live_session_and_registration_event_are_observed',async()=>assert.equal(assessPasskeyEvidence(before,await read()).ok,true));
  await check('unrelated_session_cannot_supply_the_missing_assurance',async()=>{
   await owner.query('UPDATE public.audit_log SET entity_id=$2 WHERE id=$1',[audit,otherSession]);assert.equal((await read()).sessionProofObserved,false);
   await owner.query('UPDATE public.audit_log SET entity_id=$2 WHERE id=$1',[audit,session]);
  });
  await check('revoked_and_idle_expired_and_password_version_drift_are_rejected',async()=>{
   for(const update of ["revoked_at=now()","idle_expires_at=now()-interval '1 second'","credential_version=99"]){
    await owner.query('UPDATE staff_private.sessions SET '+update+' WHERE id=$1',[session]);assert.equal((await read()).sessionProofObserved,false);
    await owner.query("UPDATE staff_private.sessions SET revoked_at=NULL,idle_expires_at=now()+interval '30 minutes',credential_version=1 WHERE id=$1",[session]);
   }
  });
  await check('stale_audit_and_expired_passkey_proof_are_rejected',async()=>{
   await owner.query("UPDATE public.audit_log SET created_at=now()-interval '1 day' WHERE id=$1",[audit]);assert.equal((await read()).sessionProofObserved,false);
   await owner.query('UPDATE public.audit_log SET created_at=now() WHERE id=$1',[audit]);
   await owner.query("UPDATE staff_private.sessions SET passkey_verified_until=now()-interval '1 second' WHERE id=$1",[session]);assert.equal((await read()).sessionProofObserved,false);
   await owner.query("UPDATE staff_private.sessions SET passkey_verified_until=now()+interval '5 minutes' WHERE id=$1",[session]);
  });
  await check('foreign_tenant_and_same_count_key_replacement_do_not_pass',async()=>{
   const foreign=await readPasskeySnapshot(owner,randomUUID(),member,startedAt);assert.equal(foreign.passkeyCount,0);assert.equal(foreign.sessionProofObserved,false);
   const existing=await read();const b={...existing,startedAt:existing.checkedAt};
   await owner.query("UPDATE staff_private.passkeys SET id='ci-key-2' WHERE membership_id=$1",[member]);
   await owner.query("UPDATE public.audit_log SET action='staff.passkey_verified',created_at=now() WHERE id=$1",[audit]);
   assert.equal(assessPasskeyEvidence(b,await read()).ok,false);
  });
  await check('actual_full_backup_restore_matches_public_and_private_row_content',async()=>{
   report.restore=await backupRestoreProof({Client,connection,pgBin,directory:cluster});
   assert.ok(report.restore.tableCount>=69);assert.ok(report.restore.privateTableCount>=7);assert.equal(report.restore.contentDigestMatch,true);
  });
  stage='live-negative-probe';const serviceKey=randomBytes(32).toString('hex');
  await check('actual_Core_default_off_is_not_confused_with_readiness',async()=>{
   await startCore(passkeyPilotSelection('start',[]),serviceKey,org);await assert.rejects(probeLocalPasskey(serviceKey),/NOT_VERIFIED/);
  });
  await check('explicit_local_pilot_still_requires_a_staff_session',async()=>{
   await startCore(passkeyPilotSelection('start',['--enable-local-passkey-pilot']),serviceKey,org);
   report.negativeProbe=await probeLocalPasskey(serviceKey);assert.equal(report.negativeProbe.sessionRequired,true);
  });
  report.result='pass';report.checkCount=checks.length;report.completedAt=new Date().toISOString();
 }catch(e){report.failure={stage,code:e.code||'ASSERTION',message:String(e.message).slice(0,180)};process.exitCode=1;}
 finally{
  await stopCore();if(owner)await owner.end().catch(()=>{});
  if(started)try{command(pg('pg_ctl'),['stop','-D',path.join(cluster,'data'),'-m','fast','-w'],{log:path.join(cluster,'ctl-stop.log')});}catch{report.cleanupFailed=true;report.result='fail';process.exitCode=1;}
  if(cluster&&!report.cleanupFailed)fs.rmSync(cluster,{recursive:true,force:true});
 }
 const out=path.join(REPO,'rollout-evidence');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'integration-'+process.platform+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
})().catch(e=>{console.error('CI_ROLLOUT_SETUP_FAILED:'+e.message);process.exitCode=1;});
