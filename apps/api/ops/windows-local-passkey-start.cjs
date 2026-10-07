'use strict';
// Explicit local-only opt-in wrapper. Default VIEWS Local Start stays unchanged.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {passkeyPilotSelection}=require('./windows-rollout-runtime.cjs');
const {localState}=require('./local-state.cjs');
function main(){
 if(process.platform!=='win32'||process.argv.length!==3||process.argv[2]!=='--ack=LOCAL_PASSKEY_PILOT')throw Error('LOCAL_PASSKEY_ACK_REQUIRED');
 const repo=path.resolve(__dirname,'../../..'),api=path.resolve(__dirname,'..');
 const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true});
 if(sha.status!==0||!/^[a-f0-9]{40}$/.test(sha.stdout.trim()))throw Error('LOCAL_SOURCE_REQUIRED');
 const {root,scope}=localState();if(scope!=='views-windows-local-rehearsal')throw Error('LOCAL_SCOPE_REQUIRED');
 const enabled=passkeyPilotSelection('start',['--enable-local-passkey-pilot']);
 const r=spawnSync(process.execPath,[path.join(__dirname,'windows-local-rehearsal.cjs'),'start'],{
  cwd:repo,env:{...process.env,VIEWS_STAFF_PASSKEY_PILOT_ENABLED:enabled?'true':'false'},shell:false,windowsHide:true,
  timeout:180000,encoding:'utf8',maxBuffer:4*1024*1024});
 if(r.error||r.status!==0)throw Error('LOCAL_PASSKEY_START_FAILED');
 const file=path.join(root,'core-process.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));
 if(record.executable!==process.execPath||record.entry!==path.join(api,'dist/main.js')||!Number.isSafeInteger(record.pid))throw Error('CORE_PROCESS_RECORD_INVALID');
 fs.writeFileSync(file,JSON.stringify({...record,sourceCommit:sha.stdout.trim(),passkeyPilotEnabled:true},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({started:true,scope:'local-rehearsal',passkeyPilotEnabled:true,publicTunnel:false}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
