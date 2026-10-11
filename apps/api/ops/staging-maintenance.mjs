import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,open,rename,readFile,lstat,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const WORKER=path.resolve(HERE,'../dist/payments/run-payme-expiry.js');
const COUNTERS=['candidates','expired','unchanged','busy','conflicts','failed','elapsedMs'];
const SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class MaintenanceError extends Error{constructor(code){super(code);this.code=code;}}
function fail(code){throw new MaintenanceError(code);}
function integer(raw,fallback,min,max){const v=raw===undefined?fallback:Number(raw);if(!Number.isSafeInteger(v)||v<min||v>max)fail('MAINTENANCE_LIMIT_INVALID');return v;}

/** Disabled means no DB, child process, filesystem write or listener. */
export function configuration(env=process.env){
  if(env.VIEWS_STAGING_MAINTENANCE_ENABLED!=='true')return {enabled:false};
  if(env.VIEWS_ENV!=='staging'||env.VIEWS_PAYME_MODE!=='sandbox'||env.VIEWS_PAYME_SANDBOX_ENABLED!=='true')fail('MAINTENANCE_STAGING_ONLY');
  if(env.VIEWS_STAGING_COST_ACK!=='NO_NEW_SPEND')fail('MAINTENANCE_COST_APPROVAL_REQUIRED');
  if(!SHA.test(env.VIEWS_STAGING_RELEASE_SHA||''))fail('MAINTENANCE_RELEASE_REQUIRED');
  if(!UUID.test(env.VIEWS_PAYME_ORGANIZATION_ID||''))fail('MAINTENANCE_TENANT_REQUIRED');
  const directory=env.VIEWS_STAGING_REPORT_DIR||'/var/lib/views-maintenance';
  if(!path.isAbsolute(directory)||directory==='/'||directory.split(path.sep).includes('..'))fail('MAINTENANCE_REPORT_DIRECTORY_INVALID');
  return Object.freeze({enabled:true,release:env.VIEWS_STAGING_RELEASE_SHA,directory,
    limit:integer(env.VIEWS_STAGING_MAINTENANCE_LIMIT,50,1,100),
    intervalMs:integer(env.VIEWS_STAGING_MAINTENANCE_INTERVAL_SECONDS,300,60,3600)*1000,
    timeoutMs:integer(env.VIEWS_STAGING_MAINTENANCE_TIMEOUT_SECONDS,45,5,60)*1000,
    retention:48});
}

/** Whitelist output; never persist stdout/stderr, SQL, request IDs or secrets. */
export function classifyWorker(value,exitCode){
  if(!value||typeof value!=='object'||value.schemaVersion!==1||value.mode!=='sandbox'||value.enabled!==true)fail('MAINTENANCE_WORKER_OUTPUT_INVALID');
  for(const key of COUNTERS)if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>2147483647)fail('MAINTENANCE_WORKER_OUTPUT_INVALID');
  if(value.candidates>100||value.candidates!==value.expired+value.unchanged+value.busy+value.conflicts+value.failed)fail('MAINTENANCE_WORKER_OUTPUT_INVALID');
  for(const key of ['budgetExhausted','hasMore'])if(typeof value[key]!=='boolean')fail('MAINTENANCE_WORKER_OUTPUT_INVALID');
  const expectedExit=value.failed||value.conflicts||value.busy||value.budgetExhausted?1:0;
  if(exitCode!==expectedExit)fail('MAINTENANCE_WORKER_EXIT_MISMATCH');
  const status=value.failed?'error':value.conflicts||value.busy||value.budgetExhausted||value.hasMore?'degraded':'healthy';
  const summary=Object.fromEntries([...COUNTERS,'budgetExhausted','hasMore'].map(key=>[key,value[key]]));
  return {status,code:status==='error'?'WORKER_FAILED':status==='degraded'?'WORKER_ATTENTION_REQUIRED':'OK',summary};
}

/** The child owns DB sockets. Killing this dedicated process closes them,
 * letting PostgreSQL roll back its current transaction. No financial resend. */
export function executeWorker({limit,timeoutMs,signal,env=process.env,workerFile=WORKER}){
  return new Promise(resolve=>{
    if(signal?.aborted){resolve({status:'interrupted',code:'SHUTDOWN',summary:null});return;}
    let child,stdout='',bytes=0,reason=null,finished=false,killTimer;
    const stop=code=>{
      if(reason)return;reason=code;
      child?.kill('SIGTERM');
      killTimer=setTimeout(()=>child?.kill('SIGKILL'),1000);
    };
    const abort=()=>stop('SHUTDOWN');
    const timer=setTimeout(()=>stop('WORKER_DEADLINE'),timeoutMs);
    function done(code){
      if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
      if(reason){resolve({status:reason==='SHUTDOWN'?'interrupted':'error',code:reason,summary:null});return;}
      try{resolve(classifyWorker(JSON.parse(stdout),code));}
      catch(e){resolve({status:'error',code:e instanceof MaintenanceError?e.code:'MAINTENANCE_WORKER_OUTPUT_INVALID',summary:null});}
    }
    try{
      child=spawn(process.execPath,[workerFile,'--ack=STAGING_EXPIRY_ONLY','--limit='+limit],{env,stdio:['ignore','pipe','pipe'],shell:false});
      const consume=chunk=>{bytes+=chunk.length;if(bytes>32768)stop('WORKER_OUTPUT_LIMIT');};
      child.stdout.on('data',chunk=>{consume(chunk);if(!reason)stdout+=chunk.toString();});
      child.stderr.on('data',consume);
      child.once('error',()=>{reason='WORKER_START_FAILED';done(null);});
      child.once('close',code=>done(code));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
    }catch{reason='WORKER_START_FAILED';done(null);}
  });
}

async function secureDirectory(dir){
  await mkdir(dir,{recursive:true,mode:0o700});
  const stat=await lstat(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('MAINTENANCE_REPORT_DIRECTORY_INVALID');
}
async function atomicJson(directory,name,value){
  const target=path.join(directory,name),temporary=path.join(directory,'.'+randomUUID()+'.tmp');
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}
  finally{await handle.close();}
  try{await rename(temporary,target);const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}}
  finally{await unlink(temporary).catch(()=>{});}
}
async function readJson(file){
  try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)fail('MAINTENANCE_REPORT_INVALID');return JSON.parse(await readFile(file,'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export function healthOf(report,config,now=Date.now()){
  if(!config.enabled)return {healthy:false,code:'DISABLED'};
  if(!report||report.schemaVersion!==1||report.release!==config.release)return {healthy:false,code:'REPORT_MISSING_OR_WRONG_RELEASE'};
  const time=Date.parse(report.finishedAt||report.startedAt);
  if(!Number.isFinite(time)||time>now+5000)return {healthy:false,code:'REPORT_INVALID_TIME'};
  const maxAge=report.status==='running'?config.timeoutMs+5000:config.intervalMs+config.timeoutMs+5000;
  if(now-time>maxAge)return {healthy:false,code:'HEARTBEAT_STALE'};
  return {healthy:report.status==='healthy',code:report.status==='healthy'?'OK':report.status==='running'?'CYCLE_RUNNING':'MAINTENANCE_UNHEALTHY'};
}

export class MaintenanceRunner{
  active=false;
  constructor(config,{worker=executeWorker,env=process.env,clock=()=>Date.now()}={}){this.config=config;this.worker=worker;this.env=env;this.clock=clock;}
  async runOnce(signal){
    if(!this.config.enabled)return {schemaVersion:1,status:'disabled',code:'DISABLED'};
    if(this.active)fail('MAINTENANCE_CYCLE_ALREADY_RUNNING');
    this.active=true;
    const c=this.config;
    try{
      await secureDirectory(c.directory);await secureDirectory(path.join(c.directory,'history'));
      const previous=await readJson(path.join(c.directory,'latest.json'));
      const startedAt=new Date(this.clock()).toISOString();
      const base={schemaVersion:1,stage:'7.22',runId:randomUUID(),release:c.release,environment:'staging',providerMode:'sandbox',startedAt};
      if(previous?.status==='running')await atomicJson(c.directory,'incident-latest.json',{
        schemaVersion:1,kind:'interrupted_previous_cycle',at:startedAt,release:c.release,externalNotificationSent:false
      });
      // Persist non-success BEFORE touching the DB; an old pass cannot survive a crash.
      await atomicJson(c.directory,'latest.json',{...base,status:'running',code:'IN_PROGRESS',summary:null});
      let outcome;
      try{outcome=await this.worker({limit:c.limit,timeoutMs:c.timeoutMs,signal,env:this.env});}
      catch{outcome={status:'error',code:'WORKER_START_FAILED',summary:null};}
      const report={...base,...outcome,finishedAt:new Date(this.clock()).toISOString(),externalNotificationSent:false};
      // History first, latest second; neither exposes child output.
      await atomicJson(path.join(c.directory,'history'),base.runId+'.json',report);
      await atomicJson(c.directory,'latest.json',report);
      if(previous?.status!==report.status&&report.status!=='interrupted')await atomicJson(c.directory,'incident-latest.json',{
        schemaVersion:1,kind:report.status==='healthy'?'recovered':'attention',at:report.finishedAt,
        release:c.release,status:report.status,code:report.code,externalNotificationSent:false
      });
      const files=(await readdir(path.join(c.directory,'history'))).filter(x=>/^[a-f0-9-]{36}\.json$/.test(x));
      const entries=await Promise.all(files.map(async name=>({name,mtime:(await lstat(path.join(c.directory,'history',name))).mtimeMs})));
      entries.sort((a,b)=>b.mtime-a.mtime||b.name.localeCompare(a.name));
      for(const entry of entries.slice(c.retention))await unlink(path.join(c.directory,'history',entry.name));
      return report;
    }finally{this.active=false;}
  }
}
export async function main(args=process.argv.slice(2),env=process.env){
  const health=args.length===1&&args[0]==='--healthcheck';
  if(!health&&(args.length!==2||!['--once','--watch'].includes(args[0])||args[1]!=='--ack=STAGING_MAINTENANCE_ONLY'))fail('MAINTENANCE_ARGUMENTS_INVALID');
  const c=configuration(env);
  if(!c.enabled){console.log(JSON.stringify({schemaVersion:1,status:'disabled',code:'DISABLED'}));return health?1:0;}
  if(health){const result=healthOf(await readJson(path.join(c.directory,'latest.json')),c);console.log(JSON.stringify(result));return result.healthy?0:1;}
  const control=new AbortController();const stop=()=>control.abort();
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const runner=new MaintenanceRunner(c,{env});
  try{
    do{
      const result=await runner.runOnce(control.signal);console.log(JSON.stringify(result));
      if(args[0]==='--once')return result.status==='healthy'?0:1;
      try{await sleep(c.intervalMs,undefined,{signal:control.signal});}catch{break;}
    }while(!control.signal.aborted);
    return 0;
  }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().then(code=>{process.exitCode=code;},error=>{
    console.error(JSON.stringify({schemaVersion:1,status:'error',code:error instanceof MaintenanceError?error.code:'MAINTENANCE_STORAGE_OR_CONFIG_ERROR'}));process.exitCode=2;
  });
}
