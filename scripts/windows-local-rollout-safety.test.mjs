import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url);
const {sha256,validateRolloutSource,validateMigrationLedger,compareTableManifests,assessPasskeyEvidence}=require('./windows-local-rollout-safety.cjs');
const head='a'.repeat(40);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
describe('Stage 7.31 Windows rollout safety',()=>{
  it('requires the exact clean rollout branch',()=>{
    expect(validateRolloutSource({branch:'stage7/windows-passkey-rollout-v1',head,expected:head,verifiedAncestor:true,trackedDirty:false,untracked:[]}).ok).toBe(true);
    for(const change of [{branch:'main'},{head:'b'.repeat(40)},{verifiedAncestor:false},{trackedDirty:true},{untracked:['scratch.txt']}])
      expect(validateRolloutSource({branch:'stage7/windows-passkey-rollout-v1',head,expected:head,verifiedAncestor:true,trackedDirty:false,untracked:[],...change}).ok).toBe(false);
  });
  it('verifies applied migration bytes and returns forward pending files',()=>{
    const migrations={'0040_a.sql':'A','0041_b.sql':'B','0042_c.sql':'C'};
    const ledger=[{name:'0040_a.sql',sha256:sha256('A')},{name:'0041_b.sql',sha256:sha256('B')}];
    expect(validateMigrationLedger(ledger,migrations)).toEqual({ok:true,errors:[],pending:['0042_c.sql']});
    expect(validateMigrationLedger([{name:'0040_a.sql',sha256:sha256('X')}],migrations).ok).toBe(false);
  });
  it('rejects migration gaps and missing applied source',()=>{
    const m={'0040_a.sql':'A','0041_b.sql':'B','0042_c.sql':'C'};
    expect(validateMigrationLedger([{name:'0041_b.sql',sha256:sha256('B')}],m).ok).toBe(false);
    expect(validateMigrationLedger([{name:'0039_old.sql',sha256:'0'.repeat(64)}],m).ok).toBe(false);
  });
  it('requires matching public and private restore manifests',()=>{
    const a=[{schema:'public',table:'users',count:2,digest:'a'.repeat(32)},{schema:'staff_private',table:'sessions',count:3,digest:'b'.repeat(32)}];
    expect(compareTableManifests(a,structuredClone(a)).ok).toBe(true);
    expect(compareTableManifests(a,[a[0],{...a[1],count:2}]).ok).toBe(false);
    expect(compareTableManifests(a,[a[0]]).ok).toBe(false);
  });
  it('accepts only durable new passkey registration evidence',()=>{
    const before={sourceCommit:head,membershipId:'m',passkeyCount:0};
    const after={sourceCommit:head,membershipId:'m',passkeyCount:1,publicKeyBytes:64,auditActions:['staff.passkey_registered'],sessionProofObserved:true,externalEmailSent:false,productionEnabled:false};
    expect(assessPasskeyEvidence(before,after).ok).toBe(true);
    expect(assessPasskeyEvidence(before,{...after,sessionProofObserved:false}).ok).toBe(false);
  });
  it('existing-key proof may authenticate but not silently replace the key',()=>{
    const before={sourceCommit:head,membershipId:'m',passkeyCount:1};
    const after={sourceCommit:head,membershipId:'m',passkeyCount:1,publicKeyBytes:64,auditActions:['staff.passkey_verified'],sessionProofObserved:true,externalEmailSent:false,productionEnabled:false};
    expect(assessPasskeyEvidence(before,after)).toEqual({ok:true,errors:[],mode:'authentication'});
    expect(assessPasskeyEvidence(before,{...after,passkeyCount:2}).ok).toBe(false);
  });
  it('operator scripts parse under the repository Node runtime',()=>{
    for(const relative of ['apps/api/ops/windows-local-rollout.cjs','apps/api/ops/windows-physical-passkey-proof.cjs']){
      const result=spawnSync(process.execPath,['--check',path.join(root,relative)],{encoding:'utf8'});
      expect(result.status,result.stderr).toBe(0);
    }
  });
});
