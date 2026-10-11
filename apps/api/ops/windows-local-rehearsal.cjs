'use strict';
// Explicit, user-space Windows rehearsal. No services, firewall changes, cloud,
// real provider credentials, automatic startup, or production deployment.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const {randomBytes,createHash}=require('node:crypto');
const net=require('node:net');
const {Client}=require('pg');
const API=path.resolve(__dirname,'..'),REPO=path.resolve(API,'../..');
const ROOT=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'VIEWS-Staging');
const PG=path.join(ROOT,'tools','postgresql-16.15','pgsql','bin');
const NODE=path.join(ROOT,'tools','node-v22.23.3-win-x64','node.exe');
const DATA=path.join(ROOT,'data'),PRIVATE=path.join(ROOT,'private'),EVIDENCE=path.join(ROOT,'evidence');
const ORG='73000000-0000-4000-8000-000000000001';
let config;
const sha=()=>spawnSync('git',['rev-parse','HEAD'],{cwd:REPO,encoding:'utf8',windowsHide:true}).stdout.trim();
const secret=()=>randomBytes(32).toString('hex');
const write=(file,obj)=>fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
function pgEnv(){return {...process.env,PGPASSWORD:config.ownerPassword,PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'};}
function run(exe,args,env=process.env,log){
 const persistent=path.basename(exe)==='pg_ctl.exe'&&args[0]==='start';
 const fd=persistent?fs.openSync(path.join(EVIDENCE,log||'pg-start.log'),'w'):null;
 let r;try{r=spawnSync(exe,args,{env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,...(fd!==null?{stdio:['ignore',fd,fd]}:{})});}finally{if(fd!==null)fs.closeSync(fd);}
 if(log&&!persistent)fs.writeFileSync(path.join(EVIDENCE,log),(r.stdout||'')+(r.stderr||''));
 if(r.error||r.status!==0)throw Error('COMMAND_FAILED:'+path.basename(exe)+':'+r.status);
 return r.stdout;
}
function dbUrl(database='views_local',role='views_app'){
 const password=role==='views_owner'?config.ownerPassword:config.runtimePassword;
 return 'postgresql://'+role+':'+password+'@127.0.0.1:55432/'+database;
}
async function connect(database='postgres',role='views_owner'){
 const c=new Client({connectionString:dbUrl(database,role),connectionTimeoutMillis:5000});await c.connect();return c;
}
async function free(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('LOCAL_PORT_IN_USE:'+port)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
function prepare(){
 if(process.platform!=='win32')throw Error('WINDOWS_REHEARSAL_ONLY');
 for(const p of [PRIVATE,EVIDENCE,path.join(ROOT,'logs'),path.join(ROOT,'backups')])fs.mkdirSync(p,{recursive:true});
 const f=path.join(PRIVATE,'runtime.json');
 if(fs.existsSync(f))config=JSON.parse(fs.readFileSync(f));
 else{config={schemaVersion:1,scope:'views-windows-local-rehearsal',ownerPassword:secret(),runtimePassword:secret(),rateSecret:secret(),internalSecret:secret()};write(f,config);}
 if(config.scope!=='views-windows-local-rehearsal')throw Error('RUNTIME_SCOPE_MISMATCH');
 if(!fs.existsSync(NODE)||!fs.existsSync(path.join(PG,'pg_ctl.exe')))throw Error('VERIFIED_TOOLS_REQUIRED');
}
async function database(){
 const ctl=path.join(PG,'pg_ctl.exe');
 if(!fs.existsSync(path.join(DATA,'PG_VERSION'))){
  await free(55432);
  const pw=path.join(PRIVATE,'init-password.tmp');fs.writeFileSync(pw,config.ownerPassword,{mode:0o600});
  try{run(path.join(PG,'initdb.exe'),['-D',DATA,'-U','views_owner','--encoding=UTF8','--locale=C','--auth-host=scram-sha-256','--auth-local=scram-sha-256','--pwfile='+pw],process.env,'initdb.log');}
  finally{fs.rmSync(pw,{force:true});}
  fs.appendFileSync(path.join(DATA,'postgresql.conf'),"\n# VIEWS local rehearsal only\nlisten_addresses = '127.0.0.1'\nport = 55432\nshared_buffers = '64MB'\nmax_connections = 40\npassword_encryption = 'scram-sha-256'\n");
 }
 const status=spawnSync(ctl,['status','-D',DATA],{encoding:'utf8',windowsHide:true});
 if(status.status!==0){await free(55432);run(ctl,['start','-D',DATA,'-l',path.join(ROOT,'logs','postgres.log'),'-w','-t','30'],process.env,'pg-start.log');}
 const owner=await connect();
 try{
  if(!(await owner.query("SELECT 1 FROM pg_database WHERE datname='views_local'")).rowCount)await owner.query('CREATE DATABASE views_local');
  if(!(await owner.query("SELECT 1 FROM pg_roles WHERE rolname='views_app'")).rowCount){
   const q=(await owner.query("SELECT format('CREATE ROLE views_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',$1::text) AS sql",[config.runtimePassword])).rows[0].sql;
   await owner.query(q);
  }
 }finally{await owner.end();}
 const c=await connect('views_local');const applied=[];
 try{
  await c.query(fs.readFileSync(path.join(REPO,'infra/postgres/init/001_extensions.sql'),'utf8'));
  await c.query('CREATE TABLE IF NOT EXISTS public.views_local_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=path.join(API,'db','migrations');
  for(const name of fs.readdirSync(dir).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort()){
   const sql=fs.readFileSync(path.join(dir,name),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
   const old=(await c.query('SELECT sha256 FROM views_local_migrations WHERE name=$1',[name])).rows[0];
   if(old){if(old.sha256!==hash)throw Error('MIGRATION_CHECKSUM_CHANGED:'+name);continue;}
   await c.query(sql);await c.query('INSERT INTO views_local_migrations(name,sha256) VALUES($1,$2)',[name,hash]);applied.push(name);
  }
  await c.query('GRANT CONNECT ON DATABASE views_local TO views_app; GRANT USAGE ON SCHEMA public,app TO views_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO views_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO views_app; REVOKE INSERT,UPDATE,DELETE ON provider_egress_attempts,provider_egress_reconciliation_queue,views_local_migrations FROM views_app');
  const count=(await c.query('SELECT count(*)::int AS n FROM views_local_migrations')).rows[0].n;
  write(path.join(EVIDENCE,'database-bootstrap.json'),{schemaVersion:1,sourceCommit:sha(),scope:'local-rehearsal',host:'127.0.0.1',port:55432,database:'views_local',applied:count,newMigrations:applied,realUserDataImported:false});
  console.log(JSON.stringify({databaseReady:true,migrations:count}));
 }finally{await c.end();}
}
function coreEnv(payme=false){
 return {...process.env,NODE_ENV:'test',PORT:'3001',VIEWS_ENV:'local-rehearsal',VIEWS_LOCAL_REHEARSAL:'true',TRUSTED_PROXY_MODE:'direct',DATABASE_URL:dbUrl(),
  GUEST_AUTH_RATE_LIMIT_SECRET:config.rateSecret,VIEWS_INTERNAL_API_KEY:config.internalSecret,
  VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:'74240000-0000-4000-8000-000000000001',
  VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:'{"local-workspace":"internal_key_only"}',
  VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({'local-workspace':[config.internalSecret]}),
  VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:'{"local-workspace":["127.0.0.1/32"]}',
  VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:'{}',VIEWS_TRUSTED_PROXY_CIDRS_JSON:'',
  VIEWS_PAYME_SANDBOX_ENABLED:payme?'true':'false',VIEWS_PAYME_MODE:'sandbox',VIEWS_PAYME_ORGANIZATION_ID:ORG,
  VIEWS_PAYME_MERCHANT_ID:'0123456789abcdef01234567',VIEWS_PAYME_MERCHANT_LOGIN:'views-payme-test',VIEWS_PAYME_TEST_KEY:'fixture-test-key-0123456789abcdef',
  VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON:'["127.0.0.1/32","::1/128"]',VIEWS_STAGING_MAINTENANCE_ENABLED:'false'};
}
async function core(payme=false){
 await free(3001);
 const out=fs.openSync(path.join(ROOT,'logs','core.log'),'a');const err=fs.openSync(path.join(ROOT,'logs','core-error.log'),'a');
 const child=spawn(NODE,[path.join(API,'dist','main.js')],{cwd:API,env:coreEnv(payme),windowsHide:true,detached:true,stdio:['ignore',out,err]});child.unref();fs.closeSync(out);fs.closeSync(err);
 write(path.join(ROOT,'core-process.json'),{pid:child.pid,executable:NODE,entry:path.join(API,'dist','main.js'),paymeFixtureEnabled:payme,startedAt:new Date().toISOString()});
 for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:3001/readiness',{signal:AbortSignal.timeout(1000)});const j=await r.json();if(r.ok&&j.database==='ok'){console.log(JSON.stringify({coreReady:true,readiness:j,paymeFixtureEnabled:payme}));return;}}catch{}await new Promise(r=>setTimeout(r,500));}
 throw Error('CORE_START_FAILED');
}
async function stopCore(){
 const file=path.join(ROOT,'core-process.json');if(!fs.existsSync(file))return;
 const saved=JSON.parse(fs.readFileSync(file));if(!Number.isSafeInteger(saved.pid)||saved.executable!==NODE||saved.entry!==path.join(API,'dist','main.js'))throw Error('PROCESS_IDENTITY_INVALID');
 const script=`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${saved.pid}"; if($p -and $p.ExecutablePath -eq '${NODE.replace(/'/g,"''")}' -and $p.CommandLine.Contains('${saved.entry.replace(/'/g,"''")}')){Stop-Process -Id ${saved.pid}; Write-Output 'stopped'} elseif($p){throw 'PROCESS_IDENTITY_MISMATCH'}`;
 run('powershell.exe',['-NoProfile','-Command',script]);fs.rmSync(file);await new Promise(r=>setTimeout(r,500));
}
async function verify(){
 const c=await connect('views_local','views_app');let role;
 try{role=(await c.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.name!=='views_app'||role.rolsuper||role.rolbypassrls)throw Error('RUNTIME_ROLE_UNSAFE');}finally{await c.end();}
 const readiness=await (await fetch('http://127.0.0.1:3001/readiness')).json();if(readiness.database!=='ok')throw Error('NOT_READY');
 const connections=JSON.parse(run('powershell.exe',['-NoProfile','-Command',"@((Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in 3001,55432}) | Select-Object LocalAddress,LocalPort) | ConvertTo-Json -Compress"]));
 if(connections.length<2||connections.some(v=>v.LocalAddress!=='127.0.0.1'))throw Error('NON_LOOPBACK_LISTENER');
 write(path.join(EVIDENCE,'local-runtime.json'),{schemaVersion:1,sourceCommit:sha(),checkedAt:new Date().toISOString(),role,readiness,listeners:connections,scope:'local-rehearsal',productionActivated:false,publicTunnel:false});
 console.log(JSON.stringify({loopbackVerified:true,restrictedRoleVerified:true}));
}
async function backup(){
 const file=path.join(ROOT,'backups','views-local-'+Date.now()+'.dump'),restored='views_restore_'+Date.now();
 run(path.join(PG,'pg_dump.exe'),['-h','127.0.0.1','-p','55432','-U','views_owner','-d','views_local','-Fc','-f',file],pgEnv(),'backup.log');
 const owner=await connect();try{await owner.query('CREATE DATABASE '+restored);}finally{await owner.end();}
 run(path.join(PG,'pg_restore.exe'),['-h','127.0.0.1','-p','55432','-U','views_owner','-d',restored,'--exit-on-error','--no-owner','--no-privileges',file],pgEnv(),'restore.log');
 async function counts(db){const c=await connect(db);try{const rows=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const result={};for(const {tablename:t} of rows){if(!/^[a-z0-9_]+$/.test(t))throw Error('TABLE_NAME_INVALID');result[t]=(await c.query('SELECT count(*)::int AS n FROM public."'+t+'"')).rows[0].n;}return result;}finally{await c.end();}}
 const before=await counts('views_local'),after=await counts(restored);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('RESTORE_COUNTS_MISMATCH');
 const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const report={schemaVersion:1,sourceCommit:sha(),checkedAt:new Date().toISOString(),scope:'local-synthetic-data',restoredDatabase:restored,tableCount:Object.keys(before).length,allTableCountsMatch:true,rows:before,backupSha256:digest,backupBytes:fs.statSync(file).size,productionRestoreTested:false};
 write(path.join(EVIDENCE,'backup-restore.json'),report);console.log(JSON.stringify({backupRestored:true,tableCount:report.tableCount,allCountsMatch:true}));
}
async function tests(){
 const c=await connect('views_local');try{if((await c.query('SELECT 1 FROM organizations LIMIT 1')).rowCount)throw Error('LIFECYCLE_TEST_REQUIRES_EMPTY_SYNTHETIC_DATABASE');}finally{await c.end();}
 await stopCore();await core(true);
 try{
  const env={...coreEnv(true),NODE_PATH:path.join(API,'node_modules'),VIEWS_PAYME_PROOF_ACK:'DISPOSABLE_DATABASE_ONLY',PAYME_PROOF_ADMIN_DATABASE_URL:dbUrl('views_local','views_owner'),VIEWS_PROOF_SOURCE_SHA:sha(),VIEWS_PAYME_EXPIRY_PROOF:'true',VIEWS_API_DIR:API};
  const result=run(NODE,[path.join(REPO,'scripts','payme-lifecycle.integration.cjs')],env,'payme-lifecycle.log');
  const report=JSON.parse(result);if(report.result!=='pass'||report.checkCount<26)throw Error('INCOMPLETE_LIFECYCLE_TEST');write(path.join(EVIDENCE,'payme-expiry.json'),report);
  console.log(JSON.stringify({lifecyclePassed:true,checkCount:report.checkCount,httpCalls:report.httpCalls}));
 }finally{await stopCore();await core(false);}
}
(async()=>{prepare();const command=process.argv[2];
 if(command==='init')await database();else if(command==='start'){await database();await core(false);await verify();}
 else if(command==='test')await tests();else if(command==='verify')await verify();else if(command==='backup')await backup();
 else if(command==='stop'){await stopCore();run(path.join(PG,'pg_ctl.exe'),['stop','-D',DATA,'-m','fast','-w'],process.env,'pg-stop.log');}
 else throw Error('COMMAND_MUST_BE_INIT_START_TEST_VERIFY_BACKUP_STOP');
})().catch(e=>{console.error(JSON.stringify({ok:false,error:String(e.message).replace(/postgresql:\/\/[^\s]+/g,'[REDACTED_DB_URL]')}));process.exitCode=1;});
