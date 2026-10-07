import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url),{validate,REQUIRED}=require('./validate-windows-rollout-e2e.cjs');
const sha='a'.repeat(40);
function sample(){
 const rollout={result:'pass',sourceCommit:sha,phase:'local-staging-ready',migrationsAfter:44,pendingMigrationsBefore:[],pendingMigrationsAfter:[],backup:{contentDigestMatch:true,sameExportedSnapshot:true,privateTableCount:7,tableCount:70,sha256:'b'.repeat(64),file:'two.dump'},passkeyPilot:{enabled:true,sessionRequired:true},coreReady:true,webReady:true,localPhysicalPasskeyTested:false,productionEnabled:false,externalEmailSent:false,publicTunnel:false};
 return {schemaVersion:1,kind:'windows-rollout-e2e',result:'pass',sourceCommit:sha,checks:[...REQUIRED],checkCount:REQUIRED.length,initialDatabaseMigrationCount:40,initialApplicationIsCurrentSource:true,firstRollout:{...structuredClone(rollout),pendingMigrationsBefore:['41','42','43','44'],backup:{...rollout.backup,file:'one.dump'}},secondRollout:rollout,cleanupListenersClosed:true,authenticatedPasskeyStateAvailable:true,userHostModified:false,realPayments:false,physicalPasskeyTested:false,externalEmailsSent:0,httpRequests:15};
}
describe('full Windows rollout evidence',()=>{
 it('accepts a complete same-source two-run proof',()=>expect(validate(sample(),sha).ok).toBe(true));
 it('rejects old source and incomplete scenario reports',()=>{for(const patch of [{sourceCommit:'b'.repeat(40)},{checks:[]},{checkCount:1},{result:'fail'}])expect(validate({...sample(),...patch},sha).ok).toBe(false);});
 it('rejects one successful run presented as two',()=>{const r=sample();r.secondRollout=r.firstRollout;expect(validate(r,sha).ok).toBe(false);});
 it('rejects stale or partial backups and unprotected runtime',()=>{for(const key of ['contentDigestMatch','sameExportedSnapshot']){const r=sample();r.firstRollout.backup[key]=false;expect(validate(r,sha).ok).toBe(false);}const r=sample();r.secondRollout.passkeyPilot.sessionRequired=false;expect(validate(r,sha).ok).toBe(false);});
 it('does not accept leaked processes or a claimed hardware ceremony',()=>{for(const patch of [{cleanupListenersClosed:false},{userHostModified:true},{physicalPasskeyTested:true},{externalEmailsSent:1}])expect(validate({...sample(),...patch},sha).ok).toBe(false);});
});
