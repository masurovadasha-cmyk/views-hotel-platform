'use strict';
// Native hosted Windows rehearsal ONLY, in a new, disposable LOCALAPPDATA.
// It uses the real operator command without bypassing any of its source gates.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process'),{randomBytes,randomUUID,createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const REPO=path.resolve(__dirname,'..'),API=path.join(REPO,'apps/api');
const {Client}=require(path.join(API,'node_modules/pg'));
const {runBundledNpm,probeLocalPasskey}=require(path.join(API,'ops/windows-rollout-runtime.cjs'));
const ORG='74240000-0000-4000-8000-000000000001',MEMBER='74240000-0000-4000-8000-000000000004';
const digest=x=>createHash('sha256').update(x).digest('hex');
let parent,root,node,pg,env,db,initialCore,pgStarted=false,current='host-gate';
const checks=[],privateValues=[];let requests=0;
const report={schemaVersion:1,kind:'windows-rollout-e2e',sourceCommit:process.env.GITHUB_SHA,result:'fail',checks,
 userHostModified:false,externalEmailsSent:0,realPayments:false,physicalPasskeyTested:false,
 initialApplicationIsCurrentSource:true,initialDatabaseMigrationCount:40};
function exec(exe,args,{cwd=REPO,environment=env,expect=0,log}={}){
 let fd;if(log)fd=fs.openSync(log,'a');let r;
 try{r=spawnSync(exe,args,{cwd,env:environment||process.env,windowsHide:true,shell:false,encoding:'utf8',timeout:420000,maxBuffer:8*1024*1024,...(fd===undefined?{}:{stdio:['ignore',fd,fd]})});}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 if(r.error||r.status!==expect){const e=Error('E2E_COMMAND_FAILED:'+path.basename(exe)+':'+(r.status??r.error?.code));e.detail=((r.stderr||'')+'\n'+(r.stdout||'')).slice(-1200);throw e;}
 return r.stdout||'';
}
const ops=(name,args=[],extra={})=>exec(node,[path.join(API,'ops',name),...args],extra);
const pgExe=name=>path.join(pg,name+'.exe');
async function check(name,fn){current=name;await fn();checks.push(name);console.log('PASS '+name);}
async function isOpen(port){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.setTimeout(400);s.once('connect',()=>{s.destroy();resolve(true);});s.once('timeout',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(false));});}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:3001/readiness',{signal:AbortSignal.timeout(600)});if(r.ok&&(await r.json()).database==='ok')return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('E2E_CORE_NOT_READY');}
function call(route,body,session={}){return new Promise((resolve,reject)=>{
 const h={'X-Views-Local-Workspace':'1','Connection':'close'};
 if(body!==undefined){h.Origin='http://127.0.0.1:4173';h['Content-Type']='application/json';}
 if(session.cookie)h.Cookie=session.cookie;if(session.csrf)h['X-CSRF-Token']=session.csrf;if(session.key)h['Idempotency-Key']=session.key;
 const q=http.request({host:'127.0.0.1',port:4173,path:'/local-api/'+route,method:body===undefined?'GET':'POST',headers:h},r=>{
  let text='';r.on('data',c=>{text+=c;});r.on('end',()=>{requests++;try{resolve({status:r.statusCode,body:JSON.parse(text),cookie:r.headers['set-cookie']?.[0]});}catch{reject(Error('E2E_NON_JSON'));}});
 });q.setTimeout(15000,()=>q.destroy(Error('E2E_HTTP_TIMEOUT')));q.on('error',reject);q.end(body===undefined?undefined:JSON.stringify(body));
});}
const ok=(r,code=200)=>assert.equal(r.status,code,'HTTP '+r.status+' '+String(r.body?.error||''));
function stateFile(file){return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
function sourceClean(){assert.equal(exec('git',['status','--porcelain']).trim(),'','SOURCE_DIRTY');}
function phase(){const r=stateFile('evidence/stage731-local-rollout.json');assert.equal(r.result,'pass');assert.equal(r.sourceCommit,report.sourceCommit);assert.equal(r.phase,'local-staging-ready');assert.equal(r.backup.sameExportedSnapshot,true);assert.equal(r.backup.contentDigestMatch,true);assert.equal(r.passkeyPilot.sessionRequired,true);return r;}
async function prepare(){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.VIEWS_ROLLOUT_E2E_ACK!=='DISPOSABLE_WINDOWS_E2E_ONLY'||!path.isAbsolute(process.env.RUNNER_TEMP||''))throw Error('HOSTED_WINDOWS_E2E_REQUIRED');
 assert.equal(exec('git',['rev-parse','HEAD']).trim(),report.sourceCommit);
 assert.equal(exec('git',['branch','--show-current']).trim(),'stage7/windows-passkey-rollout-v1');sourceClean();
 for(const port of [3001,4173,55432])assert.equal(await isOpen(port),false,'UNEXPECTED_EXISTING_LISTENER');
 parent=fs.mkdtempSync(path.join(fs.realpathSync(process.env.RUNNER_TEMP),'views-e2e-'));
 // Only this child environment points at the newly generated fixture directory.
 // No existing LOCALAPPDATA/VIEWS-Staging is read, modified or copied.
 env={...process.env,LOCALAPPDATA:path.join(parent,'test appdata'),VIEWS_STAFF_PASSKEY_PILOT_ENABLED:'false'};
 root=path.join(env.LOCALAPPDATA,'VIEWS-Staging');
 for(const p of ['private','evidence','backups','logs','tools'])fs.mkdirSync(path.join(root,p),{recursive:true});
 const nodeRoot=path.join(root,'tools','node-v22.23.3-win-x64');
 fs.cpSync(path.dirname(process.execPath),nodeRoot,{recursive:true});node=path.join(nodeRoot,'node.exe');
 const installedPg=process.env.PGBIN;if(!installedPg||!path.isAbsolute(installedPg)||!fs.existsSync(path.join(installedPg,'pg_ctl.exe')))throw Error('RUNNER_POSTGRES_REQUIRED');
 const pgRoot=path.join(root,'tools','postgresql-16.15','pgsql');
 for(const name of ['bin','lib','share']){const from=path.join(path.dirname(installedPg),name);if(fs.existsSync(from))fs.cpSync(from,path.join(pgRoot,name),{recursive:true});}
 pg=path.join(pgRoot,'bin');env.PATH=nodeRoot+';'+process.env.PATH;
 report.node=exec(node,['--version']).trim();report.postgres=exec(pgExe('pg_dump'),['--version']).trim();
 report.toolLayoutNote='Existing operator path is a fixture layout; actual version is recorded, not inferred from directory name.';
 const cfg={schemaVersion:1,scope:'views-windows-local-rehearsal',ownerPassword:randomBytes(32).toString('hex'),runtimePassword:randomBytes(32).toString('hex'),rateSecret:randomBytes(32).toString('hex'),internalSecret:randomBytes(32).toString('hex')};
 privateValues.push(cfg.ownerPassword,cfg.runtimePassword,cfg.rateSecret,cfg.internalSecret);
 fs.writeFileSync(path.join(root,'private/runtime.json'),JSON.stringify(cfg));
 const pw=path.join(parent,'init-password.tmp');fs.writeFileSync(pw,cfg.ownerPassword);
 try{exec(pgExe('initdb'),['-D',path.join(root,'data'),'-U','views_owner','--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+pw]);}finally{fs.rmSync(pw);}
 fs.appendFileSync(path.join(root,'data/postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55432\n");
 exec(pgExe('pg_ctl'),['start','-D',path.join(root,'data'),'-l',path.join(root,'logs/postgres.log'),'-w','-t','30'],{log:path.join(parent,'pg-start.log')});pgStarted=true;
 const connection={host:'127.0.0.1',port:55432,user:'views_owner',password:cfg.ownerPassword,connectionTimeoutMillis:5000};
 const admin=new Client({...connection,database:'postgres'});await admin.connect();
 try{await admin.query('CREATE DATABASE views_local');const role=(await admin.query("SELECT format('CREATE ROLE views_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L',$1::text) AS sql",[cfg.runtimePassword])).rows[0].sql;await admin.query(role);}finally{await admin.end();}
 db=new Client({...connection,database:'views_local'});await db.connect();
 await db.query(fs.readFileSync(path.join(REPO,'infra/postgres/init/001_extensions.sql'),'utf8'));
 await db.query('CREATE TABLE public.views_local_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const dir=path.join(API,'db/migrations'),names=fs.readdirSync(dir).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)&&Number(n.slice(0,4))<=40).sort();assert.equal(names.length,40);
 for(const name of names){const bytes=fs.readFileSync(path.join(dir,name));await db.query(bytes.toString());await db.query('INSERT INTO public.views_local_migrations(name,sha256) VALUES($1,$2)',[name,digest(bytes)]);}
 await db.query('GRANT CONNECT ON DATABASE views_local TO views_app; GRANT USAGE ON SCHEMA public,app TO views_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO views_app; REVOKE INSERT,UPDATE,DELETE ON provider_egress_attempts,provider_egress_reconciliation_queue,views_local_migrations FROM views_app');
 ops('prepare-local-workspace.cjs',['--ack=LOCAL_SYNTHETIC_WORKSPACE']);
 // Baseline is the current compiled application on schema 0040, not a claim
 // about every historical binary's backward compatibility.
 for(const cwd of [REPO,API])runBundledNpm(node,['run','build'],{cwd,env});
 const coreEnv={...env,NODE_ENV:'test',PORT:'3001',VIEWS_ENV:'local-rehearsal',VIEWS_LOCAL_REHEARSAL:'true',TRUSTED_PROXY_MODE:'direct',
 DATABASE_URL:'postgresql://views_app:'+cfg.runtimePassword+'@127.0.0.1:55432/views_local',GUEST_AUTH_RATE_LIMIT_SECRET:cfg.rateSecret,
 VIEWS_INTERNAL_API_KEY:cfg.internalSecret,VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:ORG,
 VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:'{"local-workspace":"internal_key_only"}',VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({'local-workspace':[cfg.internalSecret]}),
 VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:'{"local-workspace":["127.0.0.1/32"]}',VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:'{}',VIEWS_TRUSTED_PROXY_CIDRS_JSON:'',
 VIEWS_PAYME_SANDBOX_ENABLED:'false',VIEWS_PAYME_MODE:'sandbox',VIEWS_STAGING_MAINTENANCE_ENABLED:'false'};
 const entry=path.join(API,'dist/main.js');initialCore=spawn(node,[entry],{cwd:API,env:coreEnv,windowsHide:true,stdio:'ignore'});
 fs.writeFileSync(path.join(root,'core-process.json'),JSON.stringify({pid:initialCore.pid,executable:node,entry,paymeFixtureEnabled:false,startedAt:new Date().toISOString()}));
 await ready();ops('local-web-launch.cjs',['start']);return cfg;
}
async function run(){
 try{
  const cfg=await prepare(),password='Disposable existing staff '+randomBytes(16).toString('hex'),invite=randomBytes(32).toString('hex');privateValues.push(password,invite);
  let session,reservation,credential,ledger,initialRecords;
  await check('existing_authenticated_session_and_booking_on_schema_0040',async()=>{
   await db.query("UPDATE organization_memberships SET status='invited' WHERE id=$1",[MEMBER]);
   await db.query("SELECT staff_private.issue_token($1,'invite',$2,'local_fixture')",[MEMBER,digest(invite)]);
   ok(await call('activate',{token:invite,password}));const login=await call('login',{email:'local-workspace@views.invalid',password});ok(login);
   session={cookie:login.cookie.split(';')[0],csrf:login.body.csrf};privateValues.push(session.cookie,session.csrf);
   const w=await call('workspace',undefined,session);ok(w);const u=w.body.units[0],day=n=>new Date(Date.now()+(120+n)*86400000).toISOString().slice(0,10);
   const q=await call('quotes',{unitId:u.unitId,ratePlanId:u.ratePlanId,checkIn:day(0),checkOut:day(2),guests:1},session);ok(q);
   const h=await call('holds',{quoteId:q.body.quoteId},{...session,key:randomUUID()});ok(h);reservation=h.body.reservationId;
   credential=(await db.query('SELECT password_hash,version FROM staff_private.credentials WHERE membership_id=$1',[MEMBER])).rows[0];privateValues.push(credential.password_hash);
   ledger=(await db.query('SELECT * FROM views_local_migrations ORDER BY name')).rows;
   initialRecords={core:stateFile('core-process.json'),web:stateFile('web-process.json')};
   await assert.rejects(probeLocalPasskey(cfg.internalSecret),/NOT_VERIFIED/);
  });
  await check('wrong_source_refused_without_stopping_existing_app',async()=>{
   const out=ops('windows-local-rollout.cjs',['apply','--ack=LOCAL_STAGE731_ROLLOUT','--expected='+'0'.repeat(40)],{expect:1});
   assert.ok(!out.includes('"result":"pass"'));assert.equal(stateFile('core-process.json').pid,initialRecords.core.pid);await ready();
  });
  await check('checksum_mismatch_refused_before_downtime',async()=>{
   const row=ledger.at(-1);await db.query('UPDATE views_local_migrations SET sha256=$2 WHERE name=$1',[row.name,'0'.repeat(64)]);
   try{ops('windows-local-rollout.cjs',['apply','--ack=LOCAL_STAGE731_ROLLOUT','--expected='+report.sourceCommit],{expect:1});}
   finally{await db.query('UPDATE views_local_migrations SET sha256=$2 WHERE name=$1',[row.name,row.sha256]);}
   assert.equal(stateFile('core-process.json').pid,initialRecords.core.pid);assert.equal(stateFile('web-process.json').pid,initialRecords.web.pid);await ready();
  });
  await check('actual_operator_rollout_stops_backs_up_migrates_builds_restarts',async()=>{
   sourceClean();ops('windows-local-rollout.cjs',['apply','--ack=LOCAL_STAGE731_ROLLOUT','--expected='+report.sourceCommit]);
   report.firstRollout=phase();assert.equal(report.firstRollout.pendingMigrationsBefore.length,4);assert.equal(report.firstRollout.migrationsAfter,44);
   assert.notEqual(stateFile('core-process.json').pid,initialRecords.core.pid);assert.notEqual(stateFile('web-process.json').pid,initialRecords.web.pid);
  });
  await check('existing_password_session_booking_and_applied_checksums_preserved',async()=>{
   const currentLedger=(await db.query('SELECT * FROM views_local_migrations ORDER BY name')).rows;assert.deepEqual(currentLedger.slice(0,40),ledger);
   assert.deepEqual((await db.query('SELECT password_hash,version FROM staff_private.credentials WHERE membership_id=$1',[MEMBER])).rows[0],credential);
   assert.equal((await call('session',undefined,session)).body.authenticated,true);
   const w=await call('workspace',undefined,session);ok(w);assert.ok(w.body.reservations.some(r=>r.reservationId===reservation));
   ok(await call('passkey/state',{},session));report.authenticatedPasskeyStateAvailable=true;
  });
  await check('second_rollout_is_safe_without_reapplying_migrations',async()=>{
   ops('windows-local-rollout.cjs',['apply','--ack=LOCAL_STAGE731_ROLLOUT','--expected='+report.sourceCommit]);report.secondRollout=phase();
   assert.deepEqual(report.secondRollout.pendingMigrationsBefore,[]);assert.equal(report.secondRollout.migrationsAfter,44);
   assert.notEqual(report.firstRollout.backup.file,report.secondRollout.backup.file);assert.equal((await call('session',undefined,session)).body.authenticated,true);
  });
  await check('reservation_can_be_released_after_upgrade_without_payment',async()=>{
   ok(await call('workspace',undefined,session));ok(await call('release',{reservationId:reservation},{...session,key:randomUUID()}));
   assert.equal((await db.query('SELECT status FROM reservations WHERE id=$1',[reservation])).rows[0].status,'cancelled');
   assert.equal((await db.query('SELECT count(*)::int n FROM payment_intents WHERE reservation_id=$1',[reservation])).rows[0].n,0);
   assert.equal((await db.query("SELECT count(*)::int n FROM pg_database WHERE datname LIKE 'views_stage731_restore_%'")).rows[0].n,0);
   ok(await call('logout',{all:false},session));assert.equal((await call('session',undefined,session)).body.authenticated,false);sourceClean();
  });
  report.result='pass';report.httpRequests=requests;report.completedAt=new Date().toISOString();
 }catch(e){let message=String(e.message)+' '+String(e.detail||'');for(const value of privateValues)message=message.split(value).join('[REDACTED]');report.failure={check:current,code:e.code||'E2E_ASSERTION',message:message.slice(0,1400)};process.exitCode=1;}
 finally{
  if(db)await db.end().catch(()=>{});
  if(root&&node){
   try{ops('local-web-launch.cjs',['stop']);}catch{report.cleanupWebFailed=true;}
   try{if(pgStarted)ops('windows-local-rehearsal.cjs',['stop']);}catch{report.cleanupCoreOrPgFailed=true;}
  }
  if(initialCore&&initialCore.exitCode===null)initialCore.kill('SIGTERM');
  const open=[];for(const port of [3001,4173,55432])if(await isOpen(port))open.push(port);
  report.cleanupListenersClosed=open.length===0;if(open.length){report.result='fail';report.unclosedPorts=open;process.exitCode=1;}
  if(report.cleanupWebFailed||report.cleanupCoreOrPgFailed){report.result='fail';process.exitCode=1;}
  report.checkCount=checks.length;const dest=path.join(REPO,'rollout-evidence');fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,'windows-rollout-e2e.json'),JSON.stringify(report,null,2)+'\n');
  // Never remove data directories while a PostgreSQL process may still use them.
  if(parent&&report.cleanupListenersClosed&&!report.cleanupCoreOrPgFailed)fs.rmSync(parent,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
 console.log(JSON.stringify(report));
}
run().catch(e=>{console.error('WINDOWS_E2E_FAILED:'+e.message);process.exitCode=1;});
