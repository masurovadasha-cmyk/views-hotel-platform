'use strict';
// Only disposable resources; no host ports, volumes, real providers or emails.
const {spawnSync}=require('node:child_process');
const {randomBytes,generateKeyPairSync}=require('node:crypto');
const assert=require('node:assert/strict');
const image=process.argv[2];
if(!image)throw Error('Usage: node scripts/api-container-smoke.cjs <local-image>');
const prefix='views-image-proof-'+randomBytes(6).toString('hex');
const network=prefix+'-net',db=prefix+'-db',api=prefix+'-api';
const password=randomBytes(24).toString('hex');
const created=[];
function docker(args,env={}){
 const r=spawnSync('docker',args,{encoding:'utf8',timeout:120000,env:{...process.env,...env}});
 if(r.error||r.status!==0)throw Error('CONTAINER_PROOF_COMMAND_FAILED:'+args[0]);
 return r.stdout.trim();
}
async function eventually(fn){
 for(let attempt=0;attempt<40;attempt++){
  try{return fn();}catch{await new Promise(resolve=>setTimeout(resolve,500));}
 }
 throw Error('CONTAINER_PROOF_NOT_READY');
}
(async()=>{
 try{
  // Do not pull arbitrary images as a side effect of the proof.
  docker(['image','inspect',image]);
  docker(['network','create','--internal',network]);created.push(['network','rm',network]);
  docker(['run','-d','--name',db,'--network',network,'--network-alias','fixture-db',
   '--env','POSTGRES_PASSWORD','--env','POSTGRES_DB=views_image_proof',
   'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4'],
   {POSTGRES_PASSWORD:password});created.push(['rm','-f','-v',db]);
  await eventually(()=>docker(['exec',db,'pg_isready','-U','postgres','-d','views_image_proof']));
  const apiEnv={
   DATABASE_URL:`postgresql://postgres:${password}@fixture-db:5432/views_image_proof`,
   GUEST_AUTH_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),
   VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:JSON.stringify({'image-proof':'signed_only'}),
   VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:JSON.stringify({'image-proof':['127.0.0.1/32']}),
   VIEWS_IMAGE_PROOF_PUBLIC_KEY:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}),
   VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:JSON.stringify({'image-proof':[{
    kid:'fixture',ref:'VIEWS_IMAGE_PROOF_PUBLIC_KEY',activatedAt:new Date().toISOString(),
    rotateBy:new Date(Date.now()+86400000).toISOString()
   }]})
  };
  docker(['run','-d','--name',api,'--network',network,'--read-only','--cap-drop=ALL',
   '--security-opt=no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=64m',
   ...Object.keys(apiEnv).flatMap(key=>['--env',key]),image],apiEnv);
  created.push(['rm','-f',api]);
  function request(route,expected){
   return docker(['exec',api,'node','-e',
    `fetch('http://127.0.0.1:3001/${route}',{signal:AbortSignal.timeout(1500)}).then(async r=>{if(r.status!==${expected})process.exit(1);console.log(await r.text())}).catch(()=>process.exit(1))`]);
  }
  const health=JSON.parse(await eventually(()=>request('health',200)));
  assert.equal(health.service,'views-api');
  const ready=JSON.parse(await eventually(()=>request('readiness',200)));
  assert.equal(ready.database,'ok');
  docker(['exec',api,'node','-e',`
   const assert=require('node:assert/strict'),fs=require('node:fs');
   assert.notEqual(process.getuid(),0);
   for(const name of ['pg','express','@nestjs/core','nodemailer'])require.resolve(name);
   for(const name of ['typescript','@nestjs/cli','vitest'])assert.throws(()=>require.resolve(name));
   for(const file of ['/app/ops/staging-maintenance.mjs','/app/dist/payments/run-payme-expiry.js'])assert.ok(fs.existsSync(file));
  `]);
  docker(['stop','--time','2',db]);
  const unavailable=JSON.parse(await eventually(()=>request('readiness',503)));
  assert.equal(unavailable.database,'error');
  assert.equal(JSON.parse(request('health',200)).status,'ok');
  console.log(JSON.stringify({result:'pass',proof:'api_container_smoke',
   nonRoot:true,readOnly:true,productionDependenciesOnly:true,health:true,
   databaseReadiness:true,databaseLossReturns503:true,maintenancePaths:true,
   publishedPorts:0,realProviders:false,migrationsTested:false}));
 }finally{
  for(const args of created.reverse())docker(args);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
