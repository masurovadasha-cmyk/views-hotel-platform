import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const names=value=>Array.isArray(value)?value:Object.keys(value||{});
const env=value=>Array.isArray(value)?Object.fromEntries(value.map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];})):value||{};
export function evaluateStagingMaintenance(model){
  const blockers=[];const add=code=>blockers.push(code),s=model?.services?.['payme-maintenance'],core=model?.services?.core;
  if(!s||!core)return {ok:false,blockers:['MAINTENANCE_SERVICE_REQUIRED']};
  const e=env(s.environment);
  const immutable=/^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64})$/;
  if(!immutable.test(String(s.image))||s.image!==core.image||s.build||core.build)add('IMMUTABLE_SHARED_IMAGE_REQUIRED');
  if(JSON.stringify(names(s.networks).sort())!==JSON.stringify(['core_data'])||model.networks?.core_data?.internal!==true)add('PRIVATE_DATABASE_NETWORK_ONLY');
  if(s.ports?.length||s.network_mode||s.privileged||s.cap_add?.length||s.devices?.length||s.pid||s.ipc||s.entrypoint||s.extra_hosts||s.dns)add('UNREVIEWED_RUNTIME_ESCAPE');
  if(s.read_only!==true||String(s.user)!=='1000:1000'||!s.cap_drop?.includes('ALL')||
    !s.security_opt?.some(v=>v.replace(/=/g,':')==='no-new-privileges:true')||s.init!==true)add('MAINTENANCE_HARDENING_REQUIRED');
  if(s.pull_policy!=='never'||s.restart!=='no'||(s.deploy?.replicas??1)!==1)add('EXPLICIT_SINGLE_INSTANCE_REQUIRED');
  if(JSON.stringify(s.command)!==JSON.stringify(['node','/app/ops/staging-maintenance.mjs','--watch','--ack=STAGING_MAINTENANCE_ONLY']))add('MAINTENANCE_COMMAND_CHANGED');
  const volumes=s.volumes||[];
  if(volumes.length!==1||volumes[0].type!=='volume'||volumes[0].source!=='views_staging_maintenance'||volumes[0].target!=='/var/lib/views-maintenance')add('PRIVATE_REPORT_VOLUME_REQUIRED');
  if(e.VIEWS_ENV!=='staging'||e.VIEWS_PAYME_MODE!=='sandbox'||e.VIEWS_STAGING_REPORT_DIR!=='/var/lib/views-maintenance')add('STAGING_SCOPE_REQUIRED');
  if(!/^[a-f0-9]{40}$/.test(e.VIEWS_STAGING_RELEASE_SHA||'')||s.labels?.['io.views.release']!==e.VIEWS_STAGING_RELEASE_SHA||core.labels?.['io.views.release']!==e.VIEWS_STAGING_RELEASE_SHA)add('RELEASE_BINDING_REQUIRED');
  if(s.labels?.['io.views.environment']!=='staging'||core.labels?.['io.views.environment']!=='staging')add('STAGING_LABEL_REQUIRED');
  if(e.DATABASE_URL!==env(core.environment).DATABASE_URL||!e.DATABASE_URL)add('RUNTIME_DATABASE_MISMATCH');
  if(e.CLOUDFLARE_TUNNEL_TOKEN||e.POSTGRES_PASSWORD||e.NODE_OPTIONS)add('UNNECESSARY_PRIVILEGED_SECRET');
  return {ok:blockers.length===0,schemaVersion:1,enabled:e.VIEWS_STAGING_MAINTENANCE_ENABLED==='true',
    activationPerformed:false,networks:names(s.networks),imagePinned:immutable.test(String(s.image)),blockers};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const r=evaluateStagingMaintenance(JSON.parse(readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(r));process.exitCode=r.ok?0:1;}
  catch{console.error(JSON.stringify({ok:false,code:'MAINTENANCE_TOPOLOGY_INVALID'}));process.exitCode=2;}
}
