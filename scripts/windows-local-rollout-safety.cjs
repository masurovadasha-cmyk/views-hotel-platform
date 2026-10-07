'use strict';
const {createHash}=require('node:crypto');
const SHA=/^[a-f0-9]{40}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MIGRATION=/^\d{4}_[a-z0-9_]+\.sql$/;
const sha256=value=>createHash('sha256').update(value).digest('hex');
function validateRolloutSource(input){
 const errors=[];
 if(input?.branch!=='stage7/windows-passkey-rollout-v1')errors.push('ROLLOUT_BRANCH_INVALID');
 if(!SHA.test(input?.head||'')||input.head!==input.expected)errors.push('ROLLOUT_HEAD_INVALID');
 if(input?.verifiedAncestor!==true)errors.push('VERIFIED_PARENT_REQUIRED');
 if(input?.trackedDirty!==false)errors.push('TRACKED_SOURCE_DIRTY');
 if(!Array.isArray(input?.untracked)||input.untracked.length)errors.push('UNTRACKED_SOURCE_PRESENT');
 return {ok:errors.length===0,errors};
}
function validateMigrationLedger(ledger,migrations){
 const errors=[],seen=new Set();
 if(!Array.isArray(ledger)||!migrations||typeof migrations!=='object')return {ok:false,errors:['MIGRATION_INPUT_INVALID'],pending:[]};
 const names=Object.keys(migrations).filter(n=>MIGRATION.test(n)).sort();
 if(!names.length||!ledger.length)errors.push('MIGRATION_INPUT_EMPTY');
 for(const [i,row] of ledger.entries()){
  if(!row||!MIGRATION.test(row.name||'')||!/^[a-f0-9]{64}$/.test(row.sha256||'')){errors.push('MIGRATION_LEDGER_INVALID');continue;}
  if(seen.has(row.name))errors.push('MIGRATION_LEDGER_DUPLICATE');seen.add(row.name);
  if(!Object.hasOwn(migrations,row.name))errors.push('APPLIED_MIGRATION_SOURCE_MISSING:'+row.name);
  else if(sha256(migrations[row.name])!==row.sha256)errors.push('APPLIED_MIGRATION_CHECKSUM_MISMATCH:'+row.name);
  if(names[i]!==row.name)errors.push('MIGRATION_ORDER_INVALID');
 }
 return {ok:errors.length===0,errors,pending:names.filter(n=>!seen.has(n))};
}
function tableManifest(rows){
 if(!Array.isArray(rows)||rows.length===0)throw Error('TABLE_MANIFEST_EMPTY');
 const out=Object.create(null);
 for(const row of rows){
  const key=row?.schema+'.'+row?.table;
  if(!/^(public|staff_private)\.[a-z0-9_]+$/.test(key)||!Number.isSafeInteger(row.count)||row.count<0||
     (row.count===0?row.digest!==null:!/^[a-f0-9]{32}$/.test(row.digest||'')))throw Error('TABLE_MANIFEST_INVALID');
  if(Object.hasOwn(out,key))throw Error('TABLE_MANIFEST_DUPLICATE');out[key]={count:row.count,digest:row.digest};
 }
 return out;
}
function compareTableManifests(before,after){
 let a,b;try{a=tableManifest(before);b=tableManifest(after);}catch(e){return {ok:false,errors:[e.message]};}
 const errors=[],keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
 for(const key of keys){
  if(!(key in a)||!(key in b)){errors.push('TABLE_SET_MISMATCH:'+key);continue;}
  if(a[key].count!==b[key].count)errors.push('TABLE_COUNT_MISMATCH:'+key);
  if(a[key].digest!==b[key].digest)errors.push('TABLE_DIGEST_MISMATCH:'+key);
 }
 if(!keys.some(k=>k.startsWith('public.'))||!keys.some(k=>k.startsWith('staff_private.')))errors.push('REQUIRED_SCHEMA_MISSING');
 return {ok:errors.length===0,errors,tableCount:keys.length,privateTableCount:keys.filter(k=>k.startsWith('staff_private.')).length};
}
function assessPasskeyEvidence(before,after){
 const errors=[];
 if(!before||!after)return {ok:false,errors:['PASSKEY_EVIDENCE_MISSING']};
 if(!SHA.test(before.sourceCommit||'')||after.sourceCommit!==before.sourceCommit)errors.push('PASSKEY_SOURCE_MISMATCH');
 if(!UUID.test(before.membershipId||'')||before.membershipId!==after.membershipId)errors.push('PASSKEY_MEMBER_MISMATCH');
 const start=Date.parse(before.startedAt),end=Date.parse(after.checkedAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>30*60*1000)errors.push('PASSKEY_OBSERVATION_WINDOW_INVALID');
 if(![0,1].includes(before.passkeyCount)||after.passkeyCount!==1)errors.push('PASSKEY_COUNT_INVALID');
 const validPrints=x=>Array.isArray(x)&&x.every(p=>/^[a-f0-9]{64}$/.test(p));
 if(!validPrints(before.keyFingerprints)||before.keyFingerprints.length!==before.passkeyCount||
   !validPrints(after.keyFingerprints)||after.keyFingerprints.length!==1)errors.push('PASSKEY_FINGERPRINT_INVALID');
 else if(before.passkeyCount===1&&before.keyFingerprints[0]!==after.keyFingerprints[0])errors.push('PASSKEY_UNEXPECTED_REPLACEMENT');
 if(!Number.isSafeInteger(after.publicKeyBytes)||after.publicKeyBytes<16||after.publicKeyBytes>4096)errors.push('PASSKEY_PUBLIC_KEY_INVALID');
 const requiredAction=before.passkeyCount===0?'staff.passkey_registered':'staff.passkey_verified';
 if(!Array.isArray(after.auditActions)||!after.auditActions.includes(requiredAction))errors.push('PASSKEY_AUDIT_MISSING');
 if(after.sessionProofObserved!==true)errors.push('PASSKEY_SESSION_PROOF_MISSING');
 if(after.externalEmailSent!==false||after.productionEnabled!==false)errors.push('PASSKEY_BOUNDARY_INVALID');
 return {ok:errors.length===0,errors,mode:before.passkeyCount===0?'registration':'authentication'};
}
module.exports={sha256,validateRolloutSource,validateMigrationLedger,compareTableManifests,assessPasskeyEvidence};
