'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('pg');
const {localState}=require('./local-state.cjs');
const {readPasskeySnapshot}=require('./windows-passkey-observation.cjs');
const {probeLocalPasskey}=require('./windows-rollout-runtime.cjs');
const {assessPasskeyEvidence}=require('../../../scripts/windows-local-rollout-safety.cjs');
const REPO=path.resolve(__dirname,'../../..'),SHA=/^[a-f0-9]{40}$/;
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
function git(...args){const r=spawnSync('git',args,{cwd:REPO,encoding:'utf8',windowsHide:true,timeout:30000});if(r.error||r.status!==0)throw Error('GIT_CHECK_FAILED');return r.stdout.trim();}
async function main(){
 const mode=process.argv[2],expected=arg('expected');
 if(process.platform!=='win32'||!['begin','finish'].includes(mode)||process.argv[3]!=='--ack=LOCAL_PHYSICAL_PASSKEY_PROOF')throw Error('LOCAL_PHYSICAL_PASSKEY_ACK_REQUIRED');
 if(!SHA.test(expected||'')||git('rev-parse','HEAD')!==expected||git('diff','--name-only')||git('diff','--cached','--name-only'))throw Error('SOURCE_STATE_INVALID');
 const {root,privateDir,scope}=localState();
 const runtime=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8')),fixture=JSON.parse(fs.readFileSync(path.join(privateDir,'workspace.json'),'utf8'));
 if(scope!=='views-windows-local-rehearsal'||runtime.scope!==scope||fixture.scope!=='views-local-core-workspace')throw Error('LOCAL_SCOPE_INVALID');
 const rollout=JSON.parse(fs.readFileSync(path.join(root,'evidence','stage731-local-rollout.json'),'utf8'));
 const processRecord=JSON.parse(fs.readFileSync(path.join(root,'core-process.json'),'utf8'));
 if(rollout.result!=='pass'||rollout.sourceCommit!==expected||rollout.passkeyPilot?.enabled!==true||processRecord.sourceCommit!==expected||processRecord.passkeyPilotEnabled!==true)
  throw Error('EXACT_RUNNING_ROLLOUT_PROOF_REQUIRED');
 await probeLocalPasskey(runtime.internalSecret);
 const client=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});
 const file=path.join(root,'evidence','stage731-physical-passkey.json');
 try{
  await client.connect();
  const member=(await client.query(`SELECT m.id,u.email,r.code,o.legal_name FROM public.organization_memberships m
   JOIN public.users u ON u.id=m.user_id JOIN public.roles r ON r.id=m.role_id JOIN public.organizations o ON o.id=m.organization_id
   WHERE m.id=$1 AND m.organization_id=$2`,[fixture.membershipId,fixture.organizationId])).rows[0];
  if(!member||member.email!=='local-workspace@views.invalid'||member.code!=='front_desk'||member.legal_name!=='VIEWS LOCAL WORKSPACE FIXTURE')throw Error('LOCAL_STAFF_FIXTURE_MISMATCH');
  if(mode==='begin'){
   const snap=await readPasskeySnapshot(client,fixture.organizationId,member.id,new Date().toISOString());
   if(![0,1].includes(snap.passkeyCount))throw Error('PASSKEY_COUNT_INVALID');
   const before={schemaVersion:2,stage:'7.31',kind:'physical-passkey-observation',result:'waiting_user',sourceCommit:expected,
    membershipId:member.id,startedAt:snap.checkedAt,passkeyCount:snap.passkeyCount,keyFingerprints:snap.keyFingerprints,
    hardwareAttestationCryptographicallyProven:false,operatorObservationRequired:true,externalEmailSent:false,productionEnabled:false};
   fs.writeFileSync(file,JSON.stringify(before,null,2)+'\n',{mode:0o600});
   spawnSync('powershell.exe',['-NoProfile','-Command',"Start-Process msedge.exe 'http://localhost:4173/?api=local-core'"],{windowsHide:true});
   console.log(JSON.stringify({result:'waiting_user',mode:snap.passkeyCount?'authentication':'registration',windowMinutes:30,url:'http://localhost:4173/?api=local-core'}));return;
  }
  const before=JSON.parse(fs.readFileSync(file,'utf8'));
  if(before.result!=='waiting_user'||before.sourceCommit!==expected||before.membershipId!==member.id)throw Error('PASSKEY_BEGIN_REQUIRED');
  const authenticator=arg('authenticator');
  if(!['windows-hello','security-key','platform-passkey','other-local'].includes(authenticator)||arg('user-verified')!=='yes')throw Error('USER_PROMPT_OBSERVATION_REQUIRED');
  const after={sourceCommit:expected,membershipId:member.id,...await readPasskeySnapshot(client,fixture.organizationId,member.id,before.startedAt),externalEmailSent:false,productionEnabled:false};
  const check=assessPasskeyEvidence(before,after);
  if(!check.ok){fs.writeFileSync(file,JSON.stringify({...before,lastCheck:{checkedAt:after.checkedAt,errors:check.errors}},null,2)+'\n',{mode:0o600});throw Error('PASSKEY_PROOF_INCOMPLETE:'+check.errors.join(','));}
  fs.writeFileSync(file,JSON.stringify({...before,result:'pass',finishedAt:after.checkedAt,mode:check.mode,observed:after,
   operatorAuthenticator:authenticator,userVerificationPromptObserved:true,
   limitation:'No hardware attestation. DB evidence plus operator-observed local OS prompt; virtual CI proofs are separate.'},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({result:'pass',mode:check.mode,sourceCommit:expected,authenticator,hardwareAttestationCryptographicallyProven:false}));
 }finally{await client.end().catch(()=>{});}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({result:'fail',code:String(e.message).split('\n')[0]}));process.exitCode=1;});
