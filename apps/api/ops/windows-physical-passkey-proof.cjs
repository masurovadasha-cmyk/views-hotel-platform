'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Client}=require('pg');
const {localState}=require('./local-state.cjs');
const {assessPasskeyEvidence}=require('../../../scripts/windows-local-rollout-safety.cjs');

const REPO=path.resolve(__dirname,'../../..'),SHA=/^[a-f0-9]{40}$/;
function run(exe,args,cwd=REPO){const r=spawnSync(exe,args,{cwd,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw Error('COMMAND_FAILED:'+path.basename(exe));return (r.stdout||'').trim();}
function git(...args){return run('git',args);}
function arg(name){const p=process.argv.find(v=>v.startsWith('--'+name+'='));return p?.slice(name.length+3);}
async function dbContext(){
 const {root,privateDir,scope}=localState(),runtime=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8')),
  fixture=JSON.parse(fs.readFileSync(path.join(privateDir,'workspace.json'),'utf8'));
 if(scope!=='views-windows-local-rehearsal'||runtime.scope!==scope||fixture.scope!=='views-local-core-workspace')throw Error('LOCAL_SCOPE_INVALID');
 const client=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:runtime.ownerPassword,connectionTimeoutMillis:5000});await client.connect();
 const member=(await client.query(`SELECT m.id,u.email,r.code,m.status,o.legal_name
   FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
   JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2`,
   [fixture.membershipId,fixture.organizationId])).rows[0];
 if(!member||member.email!=='local-workspace@views.invalid'||member.code!=='front_desk'||member.legal_name!=='VIEWS LOCAL WORKSPACE FIXTURE')throw Error('LOCAL_STAFF_FIXTURE_MISMATCH');
 return {root,client,member,fixture};
}
async function snapshot(client,memberId,startedAt){
 const pass=(await client.query(`SELECT count(*)::int count,max(octet_length(public_key))::int public_key_bytes
   FROM staff_private.passkeys WHERE membership_id=$1`,[memberId])).rows[0];
 const audit=(await client.query(`SELECT action FROM audit_log WHERE actor_membership_id=$1
   AND action IN ('staff.passkey_registered','staff.passkey_verified') AND occurred_at>=$2 ORDER BY occurred_at`,[memberId,startedAt])).rows.map(r=>r.action);
 const session=(await client.query(`SELECT count(*)::int n FROM staff_private.sessions
   WHERE membership_id=$1 AND revoked_at IS NULL AND passkey_verified_until>$2`,[memberId,startedAt])).rows[0].n;
 return {passkeyCount:pass.count,publicKeyBytes:pass.public_key_bytes||0,auditActions:audit,sessionProofObserved:session>0};
}
async function main(){
 if(process.platform!=='win32'||!['begin','finish'].includes(process.argv[2])||process.argv[3]!=='--ack=LOCAL_PHYSICAL_PASSKEY_PROOF')throw Error('LOCAL_PHYSICAL_PASSKEY_ACK_REQUIRED');
 const expected=arg('expected');if(!SHA.test(expected||'')||git('rev-parse','HEAD')!==expected||git('diff','--name-only')||git('diff','--cached','--name-only'))throw Error('SOURCE_STATE_INVALID');
 const {root,client,member}=await dbContext(),file=path.join(root,'evidence','stage731-physical-passkey.json');
 try{
  if(process.argv[2]==='begin'){
   const rollout=JSON.parse(fs.readFileSync(path.join(root,'evidence','stage731-local-rollout.json'),'utf8'));
   if(rollout.result!=='pass'||rollout.sourceCommit!==expected||rollout.localPhysicalPasskeyTested!==false)throw Error('LOCAL_ROLLOUT_PROOF_REQUIRED');
   const current=await snapshot(client,member.id,new Date(0).toISOString());
   const report={schemaVersion:1,stage:'7.31',kind:'physical-passkey-observation',result:'waiting_user',sourceCommit:expected,
    membershipId:member.id,startedAt:new Date().toISOString(),passkeyCount:current.passkeyCount,
    hardwareAttestationCryptographicallyProven:false,operatorObservationRequired:true,externalEmailSent:false,productionEnabled:false,
    instructions:current.passkeyCount===0?
     ['Open http://localhost:4173/?api=local-core','Sign in with the local staff account','Under Ключ доступа enter the current password and click Зарегистрировать ключ','Complete the Windows Hello or security-key prompt']:
     ['Open http://localhost:4173/?api=local-core','Sign in with the local staff account','Under Ключ доступа click Подтвердить ключом','Complete the Windows Hello or security-key prompt']};
   fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
   const ps=`Start-Process msedge.exe 'http://localhost:4173/?api=local-core'`;spawnSync('powershell.exe',['-NoProfile','-Command',ps],{windowsHide:true});
   console.log(JSON.stringify({result:'waiting_user',evidence:file,mode:report.passkeyCount===0?'registration':'authentication',url:'http://localhost:4173/?api=local-core'}));return;
  }
  if(!fs.existsSync(file))throw Error('PASSKEY_BEGIN_REQUIRED');
  const before=JSON.parse(fs.readFileSync(file,'utf8'));
  if(before.result!=='waiting_user'||before.sourceCommit!==expected||before.membershipId!==member.id)throw Error('PASSKEY_PROOF_STATE_INVALID');
  const authenticator=arg('authenticator'),confirmed=arg('user-verified');
  if(!['windows-hello','security-key','platform-passkey','other-local'].includes(authenticator||'')||confirmed!=='yes')throw Error('OPERATOR_AUTHENTICATOR_OBSERVATION_REQUIRED');
  const current=await snapshot(client,member.id,before.startedAt);
  const after={sourceCommit:expected,membershipId:member.id,...current,externalEmailSent:false,productionEnabled:false};
  const gate=assessPasskeyEvidence(before,after);
  const report={...before,result:gate.ok?'pass':'fail',finishedAt:new Date().toISOString(),mode:gate.mode,errors:gate.errors,
   observed:{...after,operatorAuthenticator:authenticator,userVerificationPromptObserved:true},
   hardwareAttestationCryptographicallyProven:false,
   limitation:'The database and audit prove a real local WebAuthn ceremony reached Core. Authenticator make/model is an operator observation; current stored fields do not cryptographically attest Windows Hello versus another local authenticator.'};
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(!gate.ok)throw Error('PHYSICAL_PASSKEY_EVIDENCE_INCOMPLETE:'+gate.errors.join(','));
  console.log(JSON.stringify({result:'pass',mode:gate.mode,authenticator,evidence:file,sourceCommit:expected}));
 }finally{await client.end();}
}
main().catch(error=>{console.error(JSON.stringify({result:'fail',code:String(error.message).split('\n')[0]}));process.exitCode=1;});
