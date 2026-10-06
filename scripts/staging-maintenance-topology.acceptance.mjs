import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluateStagingMaintenance as gate} from './staging-maintenance-topology.mjs';
function model(){
 const image='views/core@sha256:'+'a'.repeat(64),sha='b'.repeat(40),labels={'io.views.environment':'staging','io.views.release':sha};
 return {services:{core:{image,labels,environment:{DATABASE_URL:'fixture-db'}},'payme-maintenance':{image,labels,
  profiles:['maintenance'],networks:{core_data:{}},environment:{DATABASE_URL:'fixture-db',VIEWS_ENV:'staging',VIEWS_PAYME_MODE:'sandbox',
   VIEWS_STAGING_REPORT_DIR:'/var/lib/views-maintenance',VIEWS_STAGING_RELEASE_SHA:sha,VIEWS_STAGING_MAINTENANCE_ENABLED:'false'},
  tmpfs:['/tmp:rw,noexec,nosuid,size=16m'],read_only:true,user:'1000:1000',cap_drop:['ALL'],security_opt:['no-new-privileges:true'],init:true,pull_policy:'never',restart:'no',
  command:['node','/app/ops/staging-maintenance.mjs','--watch','--ack=STAGING_MAINTENANCE_ONLY'],
  volumes:[{type:'volume',source:'views_staging_maintenance',target:'/var/lib/views-maintenance'}]}},networks:{core_data:{internal:true}}};
}
test('disabled pinned private topology passes without claiming activation',()=>{const r=gate(model());assert.equal(r.ok,true);assert.equal(r.enabled,false);assert.equal(r.activationPerformed,false);});
for(const [name,change] of [
 ['unquoted tmpfs split by YAML',m=>m.services['payme-maintenance'].tmpfs=['/tmp:rw','noexec','nosuid','size=16m']],
 ['tag image',m=>m.services['payme-maintenance'].image='node:latest'],
 ['image mismatch',m=>m.services.core.image='other@sha256:'+'c'.repeat(64)],
 ['rebuild core',m=>m.services.core.build={context:'./apps/api'}],
 ['public network',m=>m.networks.core_data.internal=false],
 ['ingress membership',m=>m.services['payme-maintenance'].networks.core_ingress={}],
 ['host port',m=>m.services['payme-maintenance'].ports=['3001:3001']],
 ['root',m=>m.services['payme-maintenance'].user='root'],
 ['shell command',m=>m.services['payme-maintenance'].command=['sh','-c','true']],
 ['host socket',m=>m.services['payme-maintenance'].volumes[0]={type:'bind',source:'/var/run/docker.sock',target:'/var/run/docker.sock'}],
 ['live mode',m=>m.services['payme-maintenance'].environment.VIEWS_PAYME_MODE='production'],
 ['foreign database',m=>m.services['payme-maintenance'].environment.DATABASE_URL='other-db'],
 ['unnecessary token',m=>m.services['payme-maintenance'].environment.CLOUDFLARE_TUNNEL_TOKEN='secret'],
 ['release mismatch',m=>m.services['payme-maintenance'].environment.VIEWS_STAGING_RELEASE_SHA='d'.repeat(40)],
 ['additional capabilities',m=>m.services['payme-maintenance'].cap_add=['NET_ADMIN']],
 ['automatic restart',m=>m.services['payme-maintenance'].restart='always']
 ])test('topology rejects '+name,()=>{const m=model();change(m);assert.equal(gate(m).ok,false);});
