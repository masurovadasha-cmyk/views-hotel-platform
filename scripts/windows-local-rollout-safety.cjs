'use strict';
const {createHash}=require('node:crypto');

const SHA=/^[a-f0-9]{40}$/;
const MIGRATION=/^\d{4}_[a-z0-9_]+\.sql$/;

function sha256(value){
  return createHash('sha256').update(value).digest('hex');
}
function validateRolloutSource(input){
  const errors=[];
  if(!input||input.branch!=='stage7/windows-passkey-rollout-v1')errors.push('ROLLOUT_BRANCH_INVALID');
  if(!SHA.test(input?.head||'')||input.head!==input.expected)errors.push('ROLLOUT_HEAD_INVALID');
  if(input?.verifiedAncestor!==true)errors.push('VERIFIED_PARENT_REQUIRED');
  if(input?.trackedDirty===true)errors.push('TRACKED_SOURCE_DIRTY');
  if(Array.isArray(input?.untracked)&&input.untracked.length)errors.push('UNTRACKED_SOURCE_PRESENT');
  return {ok:errors.length===0,errors};
}
function validateMigrationLedger(ledger,migrations){
  const errors=[],seen=new Set();
  if(!Array.isArray(ledger)||!migrations||typeof migrations!=='object')return {ok:false,errors:['MIGRATION_INPUT_INVALID'],pending:[]};
  for(const row of ledger){
    if(!row||!MIGRATION.test(row.name||'')||!/^[a-f0-9]{64}$/.test(row.sha256||'')){errors.push('MIGRATION_LEDGER_INVALID');continue;}
    if(seen.has(row.name)){errors.push('MIGRATION_LEDGER_DUPLICATE');continue;}
    seen.add(row.name);
    if(!(row.name in migrations)){errors.push('APPLIED_MIGRATION_SOURCE_MISSING:'+row.name);continue;}
    if(sha256(migrations[row.name])!==row.sha256)errors.push('APPLIED_MIGRATION_CHECKSUM_MISMATCH:'+row.name);
  }
  const names=Object.keys(migrations).filter(name=>MIGRATION.test(name)).sort();
  const applied=ledger.map(row=>row.name).filter(name=>MIGRATION.test(name));
  for(let i=0;i<applied.length;i++)if(applied[i]!==names[i])errors.push('MIGRATION_ORDER_INVALID');
  const pending=names.filter(name=>!seen.has(name));
  if(pending.some(name=>name<applied.at(-1)))errors.push('MIGRATION_GAP_DETECTED');
  return {ok:errors.length===0,errors,pending};
}
function tableManifest(rows){
  const out={};
  for(const row of rows||[]){
    const key=row?.schema+'.'+row?.table;
    if(!/^(public|staff_private)\.[a-z0-9_]+$/.test(key)||!Number.isSafeInteger(row.count)||row.count<0||
      !(row.digest===null||/^[a-f0-9]{32}$/.test(row.digest||'')))throw Error('TABLE_MANIFEST_INVALID');
    if(key in out)throw Error('TABLE_MANIFEST_DUPLICATE');
    out[key]={count:row.count,digest:row.digest};
  }
  return out;
}
function compareTableManifests(before,after){
  let left,right;
  try{left=tableManifest(before);right=tableManifest(after);}catch(error){return {ok:false,errors:[error.message]};}
  const errors=[],keys=[...new Set([...Object.keys(left),...Object.keys(right)])].sort();
  for(const key of keys){
    if(!(key in left)||!(key in right)){errors.push('TABLE_SET_MISMATCH:'+key);continue;}
    if(left[key].count!==right[key].count)errors.push('TABLE_COUNT_MISMATCH:'+key);
    if(left[key].digest!==right[key].digest)errors.push('TABLE_DIGEST_MISMATCH:'+key);
  }
  return {ok:errors.length===0,errors,tableCount:keys.length,privateTableCount:keys.filter(k=>k.startsWith('staff_private.')).length};
}
function assessPasskeyEvidence(before,after){
  const errors=[];
  if(!before||!after||!SHA.test(before.sourceCommit||'')||after.sourceCommit!==before.sourceCommit)errors.push('PASSKEY_SOURCE_MISMATCH');
  if(before.membershipId!==after.membershipId)errors.push('PASSKEY_MEMBER_MISMATCH');
  if(!Number.isSafeInteger(before.passkeyCount)||!Number.isSafeInteger(after.passkeyCount)||before.passkeyCount<0||after.passkeyCount<0)errors.push('PASSKEY_COUNT_INVALID');
  if(before.passkeyCount===0&&after.passkeyCount!==1)errors.push('PASSKEY_REGISTRATION_NOT_OBSERVED');
  if(before.passkeyCount>0&&after.passkeyCount!==before.passkeyCount)errors.push('PASSKEY_COUNT_CHANGED_UNEXPECTEDLY');
  if(!(after.publicKeyBytes>=16&&after.publicKeyBytes<=4096))errors.push('PASSKEY_PUBLIC_KEY_INVALID');
  if(!Array.isArray(after.auditActions)||!after.auditActions.some(v=>['staff.passkey_registered','staff.passkey_verified'].includes(v)))errors.push('PASSKEY_AUDIT_MISSING');
  if(after.sessionProofObserved!==true)errors.push('PASSKEY_SESSION_PROOF_MISSING');
  if(after.externalEmailSent!==false||after.productionEnabled!==false)errors.push('PASSKEY_BOUNDARY_INVALID');
  return {ok:errors.length===0,errors,mode:before.passkeyCount===0?'registration':'authentication'};
}
module.exports={sha256,validateRolloutSource,validateMigrationLedger,compareTableManifests,assessPasskeyEvidence};
