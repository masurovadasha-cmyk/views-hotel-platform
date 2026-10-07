'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawnSync,execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {Client}=require('pg');
const {localState}=require('./local-state.cjs');
const {validateRolloutSource,validateMigrationLedger,compareTableManifests}=require('../../../scripts/windows-local-rollout-safety.cjs');

const REPO=path.resolve(__dirname,'../../..'),API=path.resolve(__dirname,'..');
const BRANCH='stage7/windows-passkey-rollout-v1',VERIFIED_PARENT='0903a01779fbe4a707888d23815f526427c4b710';
const SHA=/^[a-f0-9]{40}$/;
function arg(name){const p=process.argv.find(v=>v.startsWith('--'+name+'='));return p?.slice(name.length+3);}
function run(exe,args,{cwd=REPO,env=process.env,timeout=240000,capture=true}={}){
 const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:16*1024*1024,stdio:capture?'pipe':'inherit'});
 if(r.error||r.status!==0)throw Error('COMMAND_FAILED:'+path.basename(exe)+':'+(r.status??'ERROR'));
 return (r.stdout||'').trim();
}
function git(...args){return run('git',args);}
function sha256(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function portOpen(port){
 return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.setTimeout(400);
  s.once('connect',()=>{s.destroy();resolve(true);});s.once('timeout',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(false));});
}
async function manifest(client){
 const tables=(await client.query("SELECT schemaname AS schema,tablename AS table FROM pg_tables WHERE schemaname IN ('public','staff_private') ORDER BY 1,2")).rows;
 const rows=[];
 for(const item of tables){
  if(!/^(public|staff_private)$/.test(item.schema)||!/^[a-z0-9_]+$/.test(item.table))throw Error('UNSAFE_TABLE_NAME');
  const q='"'+item.schema+'"."'+item.table+'"';
  const result=(await client.query(`SELECT count(*)::int count,md5(string_agg(d,',' ORDER BY d)) digest FROM (SELECT md5(row_to_json(t)::text) d FROM ${q} t) s`)).rows[0];
  rows.push({schema:item.schema,table:item.table,count:result.count,digest:result.digest});
 }
 return rows;
}
function stopOwnedCore(root,node){
 const record=path.join(root,'core-process.json');if(!fs.existsSync(record))return false;
 const saved=JSON.parse(fs.readFileSync(record,'utf8')),entry=path.join(API,'dist','main.js');
 if(!Number.isSafeInteger(saved.pid)||saved.executable!==node||saved.entry!==entry)throw Error('CORE_PROCESS_IDENTITY_INVALID');
 const ps=`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${saved.pid}";if($p){if($p.ExecutablePath -ne '${node.replace(/'/g,"''")}' -or -not $p.CommandLine.Contains('${entry.replace(/'/g,"''")}')){exit 2};Stop-Process -Id ${saved.pid} -Force;Write-Output stopped}`;
 run('powershell.exe',['-NoProfile','-Command',ps]);fs.rmSync(record,{force:true});return true;
}
async function main(){
 if(process.platform!=='win32'||process.argv[2]!=='apply'||process.argv[3]!=='--ack=LOCAL_STAGE731_ROLLOUT')throw Error('LOCAL_STAGE731_ACK_REQUIRED');
 const expected=arg('expected');if(!SHA.test(expected||''))throw Error('EXPECTED_SHA_REQUIRED');
 const head=git('rev-parse','HEAD'),branch=git('branch','--show-current');
 const trackedDirty=git('diff','--name-only').length>0||git('diff','--cached','--name-only').length>0;
 const untracked=git('ls-files','--others','--exclude-standard').split(/\r?\n/).filter(Boolean);
 const verifiedAncestor=spawnSync('git',['merge-base','--is-ancestor',VERIFIED_PARENT,'HEAD'],{cwd:REPO,windowsHide:true}).status===0;
 const sourceGate=validateRolloutSource({branch,head,expected,trackedDirty,untracked,verifiedAncestor});
 if(!sourceGate.ok)throw Error(sourceGate.errors.join(','));
 const {root,privateDir,scope}=localState(),runtime=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8'));
 if(scope!=='views-windows-local-rehearsal'||runtime.scope!==scope)throw Error('LOCAL_RUNTIME_SCOPE_INVALID');
 const tools=path.join(root,'tools'),node=path.join(tools,'node-v22.23.3-win-x64','node.exe'),pg=path.join(tools,'postgresql-16.15','pgsql','bin');
 for(const file of [node,path.join(pg,'pg_dump.exe'),path.join(pg,'pg_restore.exe')])if(!fs.existsSync(file))throw Error('LOCAL_TOOL_MISSING:'+path.basename(file));
 const migrations={};const migrationDir=path.join(API,'db','migrations');
 for(const name of fs.readdirSync(migrationDir).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort())migrations[name]=fs.readFileSync(path.join(migrationDir,name),'utf8');
 const runtimeDb=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_app',password:runtime.runtimePassword,connectionTimeoutMillis:5000});
 let ledger;try{await runtimeDb.connect();ledger=(await runtimeDb.query('SELECT name,sha256 FROM public.views_local_migrations ORDER BY name')).rows;}finally{await runtimeDb.end().catch(()=>{});}
 const ledgerGate=validateMigrationLedger(ledger,migrations);if(!ledgerGate.ok)throw Error(ledgerGate.errors.join(','));
 if(!ledger.some(r=>r.name==='0040_staff_email_delivery.sql'))throw Error('STAGE726_BASE_MIGRATION_REQUIRED');
 const evidenceDir=path.join(root,'evidence'),backupDir=path.join(root,'backups');fs.mkdirSync(evidenceDir,{recursive:true});fs.mkdirSync(backupDir,{recursive:true});
 const report={schemaVersion:1,stage:'7.31',sourceCommit:head,verifiedParent:VERIFIED_PARENT,startedAt:new Date().toISOString(),
  result:'fail',pendingMigrationsBefore:ledgerGate.pending,productionEnabled:false,publicTunnel:false,externalEmailSent:false};
 const reportFile=path.join(evidenceDir,'stage731-local-rollout.json');
 const write=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 write();
 let owner,tempDb,coreWasRunning=false,webWasRunning=false;
 try{
  webWasRunning=await portOpen(4173);coreWasRunning=await portOpen(3001);
  if(webWasRunning)run(node,[path.join(API,'ops','local-web-launch.cjs'),'stop']);
  if(coreWasRunning&&!stopOwnedCore(root,node))throw Error('UNOWNED_CORE_PROCESS_STOP');
  if(await portOpen(4173)||await portOpen(3001))throw Error('LOCAL_APP_PORT_STILL_ACTIVE');
  owner=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});await owner.connect();
  const fixture=(await owner.query("SELECT count(*)::int n FROM organizations WHERE id='74240000-0000-4000-8000-000000000001' AND legal_name='VIEWS LOCAL WORKSPACE FIXTURE'")).rows[0].n;
  if(fixture!==1)throw Error('LOCAL_SYNTHETIC_FIXTURE_REQUIRED');
  const before=await manifest(owner),stamp=Date.now(),dump=path.join(backupDir,'stage731-pre-'+stamp+'.dump');
  const pgEnv={...process.env,PGPASSWORD:runtime.ownerPassword,PGCONNECTTIMEOUT:'5'};
  run(path.join(pg,'pg_dump.exe'),['-h','127.0.0.1','-p','55432','-U','views_owner','-d','views_local','-Fc','-f',dump],{env:pgEnv,timeout:300000});
  tempDb='views_stage731_restore_'+stamp;
  const admin=new Client({host:'127.0.0.1',port:55432,database:'postgres',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});await admin.connect();
  try{await admin.query('CREATE DATABASE "'+tempDb+'"');}finally{await admin.end();}
  run(path.join(pg,'pg_restore.exe'),['-h','127.0.0.1','-p','55432','-U','views_owner','-d',tempDb,'--exit-on-error','--no-owner','--no-privileges',dump],{env:pgEnv,timeout:300000});
  const restored=new Client({host:'127.0.0.1',port:55432,database:tempDb,user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});await restored.connect();
  let after;try{after=await manifest(restored);}finally{await restored.end();}
  const restore=compareTableManifests(before,after);if(!restore.ok)throw Error(restore.errors.join(','));
  report.backup={file:path.basename(dump),sha256:sha256(dump),bytes:fs.statSync(dump).size,tableCount:restore.tableCount,privateTableCount:restore.privateTableCount,contentDigestMatch:true};
  const drop=new Client({host:'127.0.0.1',port:55432,database:'postgres',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});await drop.connect();
  try{await drop.query('DROP DATABASE "'+tempDb+'"');tempDb=null;}finally{await drop.end();}
  await owner.end();owner=null;
  run(node,[path.join(API,'ops','windows-local-rehearsal.cjs'),'init'],{timeout:300000});
  const env={...process.env,PATH:path.dirname(node)+';'+process.env.PATH};
  run('npm.cmd',['run','build'],{cwd:REPO,env,timeout:300000});
  run('npm.cmd',['run','build'],{cwd:API,env,timeout:300000});
  run(node,[path.join(API,'ops','windows-local-rehearsal.cjs'),'start'],{timeout:120000});
  run(node,[path.join(API,'ops','local-web-launch.cjs'),'start'],{timeout:120000});
  run(node,[path.join(API,'ops','windows-local-rehearsal.cjs'),'verify'],{timeout:120000});
  const verifyDb=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_app',password:runtime.runtimePassword,connectionTimeoutMillis:5000});await verifyDb.connect();
  let finalLedger;try{finalLedger=(await verifyDb.query('SELECT name,sha256 FROM public.views_local_migrations ORDER BY name')).rows;}finally{await verifyDb.end();}
  const finalGate=validateMigrationLedger(finalLedger,migrations);if(!finalGate.ok||finalGate.pending.length)throw Error('POST_MIGRATION_LEDGER_INVALID:'+finalGate.errors.join(','));
  report.result='pass';report.finishedAt=new Date().toISOString();report.migrationsAfter=finalLedger.length;report.pendingMigrationsAfter=[];
  report.coreReady=true;report.webReady=await portOpen(4173);report.databaseBackupRestoreVerified=true;report.localPhysicalPasskeyTested=false;write();
  console.log(JSON.stringify({result:'pass',evidence:reportFile,sourceCommit:head,migrations:finalLedger.length,physicalPasskeyNext:true}));
 }catch(error){
  report.error=String(error.message).slice(0,240);report.finishedAt=new Date().toISOString();write();throw error;
 }finally{
  if(owner)await owner.end().catch(()=>{});
  if(tempDb){
   try{const c=new Client({host:'127.0.0.1',port:55432,database:'postgres',user:'views_owner',password:runtime.ownerPassword});await c.connect();await c.query('DROP DATABASE IF EXISTS "'+tempDb+'"');await c.end();}catch{}
  }
 }
}
main().catch(error=>{console.error(JSON.stringify({result:'fail',code:String(error.message).split('\n')[0]}));process.exitCode=1;});
