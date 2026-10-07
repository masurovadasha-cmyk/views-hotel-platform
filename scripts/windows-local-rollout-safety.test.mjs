import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url);
const {sha256,validateRolloutSource,validateMigrationLedger,compareTableManifests,assessPasskeyEvidence}=require('./windows-local-rollout-safety.cjs');
const head='a'.repeat(40),membershipId='10000000-0000-4000-8000-000000000001';
const start='2026-01-01T00:00:00.000Z';
function proof(count=0){return [{sourceCommit:head,membershipId,passkeyCount:count,keyFingerprints:count?['b'.repeat(64)]:[],startedAt:start},
 {sourceCommit:head,membershipId,passkeyCount:1,keyFingerprints:['b'.repeat(64)],publicKeyBytes:64,
 checkedAt:'2026-01-01T00:01:00.000Z',auditActions:[count?'staff.passkey_verified':'staff.passkey_registered'],sessionProofObserved:true,externalEmailSent:false,productionEnabled:false}];}
describe('Windows rollout safety',()=>{
 it('requires exact clean source, not missing cleanliness fields',()=>{
  const input={branch:'stage7/windows-passkey-rollout-v1',head,expected:head,trackedDirty:false,untracked:[],verifiedAncestor:true};
  expect(validateRolloutSource(input).ok).toBe(true);
  for(const c of [{branch:'main'},{head:'b'.repeat(40)},{trackedDirty:undefined},{untracked:undefined},{untracked:['x']},{verifiedAncestor:false}])expect(validateRolloutSource({...input,...c}).ok).toBe(false);
 });
 it('verifies byte-level applied migrations and forward order',()=>{
  const m={'0040_a.sql':Buffer.from('A\n'),'0041_b.sql':Buffer.from('B\n')},ledger=[{name:'0040_a.sql',sha256:sha256('A\n')}];
  expect(validateMigrationLedger(ledger,m)).toEqual({ok:true,errors:[],pending:['0041_b.sql']});
  expect(validateMigrationLedger(ledger,{...m,'0040_a.sql':Buffer.from('A\r\n')}).ok).toBe(false);
  expect(validateMigrationLedger([{name:'0041_b.sql',sha256:sha256('B\n')}],m).ok).toBe(false);
  expect(validateMigrationLedger([],{}).ok).toBe(false);
 });
 it('restore requires both schemas, nonempty manifests and matching row content',()=>{
  const a=[{schema:'public',table:'users',count:2,digest:'a'.repeat(32)},{schema:'staff_private',table:'sessions',count:3,digest:'b'.repeat(32)}];
  expect(compareTableManifests(a,structuredClone(a)).ok).toBe(true);
  for(const changed of [[],[a[0]],[a[0],{...a[1],count:2}],[a[0],{...a[1],digest:'c'.repeat(32)}]])expect(compareTableManifests(a,changed).ok).toBe(false);
  expect(compareTableManifests([],[]).ok).toBe(false);
 });
 it('requires registration action for a newly registered key',()=>{
  const [a,b]=proof();expect(assessPasskeyEvidence(a,b).ok).toBe(true);
  expect(assessPasskeyEvidence(a,{...b,auditActions:['staff.passkey_verified']}).ok).toBe(false);
 });
 it('rejects same-count replacement and stale session evidence',()=>{
  const [a,b]=proof(1);expect(assessPasskeyEvidence(a,b).ok).toBe(true);
  expect(assessPasskeyEvidence(a,{...b,keyFingerprints:['c'.repeat(64)]}).ok).toBe(false);
  expect(assessPasskeyEvidence(a,{...b,sessionProofObserved:false}).ok).toBe(false);
 });
 it('requires a bounded observation window and source/member equality',()=>{
  const [a,b]=proof();for(const c of [{checkedAt:'2026-01-01T01:00:00Z'},{checkedAt:start.replace('2026','2025')},{sourceCommit:'b'.repeat(40)},{membershipId:'wrong'},{productionEnabled:true}])expect(assessPasskeyEvidence(a,{...b,...c}).ok).toBe(false);
 });
});
