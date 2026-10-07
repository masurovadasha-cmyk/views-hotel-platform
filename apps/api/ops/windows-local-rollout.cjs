'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawnSync}=require('node:child_process');
const {Client}=require('pg');
const {localState}=require('./local-state.cjs');
const {runBundledNpm,probeLocalPasskey}=require('./windows-rollout-runtime.cjs');
const {backupRestoreProof}=require('./windows-rollout-database.cjs');
const {validateRolloutSource,validateMigrationLedger}=require('../../../scripts/windows-local-rollout-safety.cjs');
const REPO=path.resolve(__dirname,'../../..'),API=path.resolve(__dirname,'..');
const VERIFIED_PARENT='0903a01779fbe4a707888d23815f526427c4b710',SHA=/^[a-f0-9]{40}$/;
function arg(name){return process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);}
function run(exe,args,{cwd=REPO,env=process.env,timeout=240000}={}){
 const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',windowsHide:true,shell:false,timeout,maxBuffer:8*1024*1024});
 if(r.error||r.status!==0)throw Error('COMMAND_FAILED:'+path.basename(exe)+':'+(r.status??'SPAWN'));
 return (r.stdout||'').trim();
}
const git=(...args)=>run('git',args);
function portOpen(port){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});s.setTimeout(400);
 s.once('connect',()=>{s.destroy();resolve(true);});s.once('timeout',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(false));});}
async function waitClosed(port){for(let i=0;i<30;i++){if(!await portOpen(port))return;await new Promise(r=>setTimeout(r,100));}throw Error('LOCAL_APP_PORT_STILL_ACTIVE');}
function stopOwnedCore(root,node){
 const record=path.join(root,'core-process.json'),entry=path.join(API,'dist','main.js');
 if(!fs.existsSync(record))throw Error('UNOWNED_CORE_PROCESS_STOP');
 const saved=JSON.parse(fs.readFileSync(record,'utf8'));
 if(!Number.isSafeInteger(saved.pid)||saved.executable!==node||saved.entry!==entry)throw Error('CORE_PROCESS_IDENTITY_INVALID');
 const quote=s=>s.replace(/'/g,"''");
 run('powershell.exe',['-NoProfile','-Command',`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${saved.pid}";if($p){if($p.ExecutablePath -ne '${quote(node)}' -or -not $p.CommandLine.Contains('${quote(entry)}')){exit 2};Stop-Process -Id ${saved.pid};}`]);
 fs.rmSync(record);
}
async function main(){
 if(process.platform!=='win32'||process.argv.length!==5||process.argv[2]!=='apply'||process.argv[3]!=='--ack=LOCAL_STAGE731_ROLLOUT')throw Error('LOCAL_STAGE731_ACK_REQUIRED');
 const expected=arg('expected');if(!SHA.test(expected||''))throw Error('EXPECTED_SHA_REQUIRED');
 const head=git('rev-parse','HEAD');
 const gate=validateRolloutSource({branch:git('branch','--show-current'),head,expected,
  trackedDirty:!!git('diff','--name-only')||!!git('diff','--cached','--name-only'),
  untracked:git('ls-files','--others','--exclude-standard').split(/\r?\n/).filter(Boolean),
  verifiedAncestor:spawnSync('git',['merge-base','--is-ancestor',VERIFIED_PARENT,'HEAD'],{cwd:REPO,windowsHide:true}).status===0});
 if(!gate.ok)throw Error(gate.errors.join(','));
 const {root,privateDir,scope}=localState(),runtime=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8'));
 if(scope!=='views-windows-local-rehearsal'||runtime.scope!==scope)throw Error('LOCAL_RUNTIME_SCOPE_INVALID');
 const node=path.join(root,'tools','node-v22.23.3-win-x64','node.exe'),pg=path.join(root,'tools','postgresql-16.15','pgsql','bin');
 for(const file of [node,path.join(pg,'pg_dump.exe'),path.join(pg,'pg_restore.exe')])if(!fs.existsSync(file))throw Error('LOCAL_TOOL_MISSING');
 const env={...process.env,PATH:path.dirname(node)+';'+process.env.PATH};
 // Fail before downtime when npm or dependencies/typechecking are unavailable.
 runBundledNpm(node,['--version'],{cwd:REPO,env});
 for(const cwd of [REPO,API])runBundledNpm(node,['run','typecheck'],{cwd,env});
 const connection={host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000};
 const migrations={},dir=path.join(API,'db','migrations');
 for(const name of fs.readdirSync(dir).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort())migrations[name]=fs.readFileSync(path.join(dir,name));
 async function ledger(){const c=new Client({...connection,user:'views_app',password:runtime.runtimePassword});
  try{await c.connect();return (await c.query('SELECT name,sha256 FROM public.views_local_migrations ORDER BY name')).rows;}finally{await c.end().catch(()=>{});}}
 const before=await ledger(),migrationGate=validateMigrationLedger(before,migrations);
 if(!migrationGate.ok||!before.some(r=>r.name==='0040_staff_email_delivery.sql'))throw Error('MIGRATION_PREFLIGHT_FAILED:'+migrationGate.errors.join(','));
 const evidence=path.join(root,'evidence'),backups=path.join(root,'backups');fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(backups,{recursive:true});
 const report={schemaVersion:2,stage:'7.31',sourceCommit:head,verifiedParent:VERIFIED_PARENT,result:'fail',phase:'preflight-complete',
 startedAt:new Date().toISOString(),pendingMigrationsBefore:migrationGate.pending,productionEnabled:false,publicTunnel:false,externalEmailSent:false,localPhysicalPasskeyTested:false};
 const write=()=>fs.writeFileSync(path.join(evidence,'stage731-local-rollout.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});write();
 try{
  if(await portOpen(4173))run(node,[path.join(API,'ops','local-web-launch.cjs'),'stop']);
  if(await portOpen(3001))stopOwnedCore(root,node);
  await waitClosed(4173);await waitClosed(3001);report.phase='owned-app-stopped';write();
  const owner=new Client(connection);try{await owner.connect();const n=(await owner.query("SELECT count(*)::int n FROM public.organizations WHERE id='74240000-0000-4000-8000-000000000001' AND legal_name='VIEWS LOCAL WORKSPACE FIXTURE'")).rows[0].n;
   if(n!==1)throw Error('LOCAL_SYNTHETIC_FIXTURE_REQUIRED');}finally{await owner.end();}
  report.backup=await backupRestoreProof({Client,connection,pgBin:pg,directory:backups});report.phase='backup-restore-passed';write();
  run(node,[path.join(API,'ops','windows-local-rehearsal.cjs'),'init']);report.phase='migrations-applied';write();
  for(const cwd of [REPO,API])runBundledNpm(node,['run','build'],{cwd,env});report.phase='builds-passed';write();
  run(node,[path.join(API,'ops','windows-local-passkey-start.cjs'),'--ack=LOCAL_PASSKEY_PILOT']);
  run(node,[path.join(API,'ops','local-web-launch.cjs'),'start']);
  run(node,[path.join(API,'ops','windows-local-rehearsal.cjs'),'verify']);
  report.passkeyPilot=await probeLocalPasskey(runtime.internalSecret);
  const final=await ledger(),last=validateMigrationLedger(final,migrations);
  if(!last.ok||last.pending.length)throw Error('POST_MIGRATION_LEDGER_INVALID');
  if(!await portOpen(4173))throw Error('LOCAL_WEB_NOT_READY');
  report.result='pass';report.phase='local-staging-ready';report.finishedAt=new Date().toISOString();
  report.migrationsAfter=final.length;report.pendingMigrationsAfter=[];report.coreReady=true;report.webReady=true;report.databaseBackupRestoreVerified=true;write();
  console.log(JSON.stringify({result:'pass',sourceCommit:head,migrations:final.length,passkeyPilotEnabled:true,physicalPromptStillRequired:true}));
 }catch(e){report.error=String(e.message).split('\n')[0].slice(0,200);report.finishedAt=new Date().toISOString();write();throw e;}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({result:'fail',code:String(e.message).split('\n')[0]}));process.exitCode=1;});
