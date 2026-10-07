'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');

/** Use the npm JavaScript CLI bundled beside the selected Node executable.
 * Do not spawn npm.cmd as an executable or turn arbitrary strings into a shell. */
function npmInvocation(nodeExecutable,args){
 if(!path.isAbsolute(nodeExecutable)||!Array.isArray(args)||
    !(JSON.stringify(args)==='["--version"]'||args.length===2&&args[0]==='run'&&['build','typecheck'].includes(args[1])))
   throw Error('NPM_INVOCATION_INVALID');
 const cli=path.join(path.dirname(nodeExecutable),'node_modules','npm','bin','npm-cli.js');
 if(!fs.statSync(nodeExecutable).isFile()||!fs.statSync(cli).isFile())throw Error('BUNDLED_NPM_CLI_REQUIRED');
 return {exe:nodeExecutable,args:[cli,...args],shell:false};
}
function runBundledNpm(nodeExecutable,args,{cwd,env=process.env,timeout=300000}={}){
 const command=npmInvocation(nodeExecutable,args);
 const result=spawnSync(command.exe,command.args,{cwd,env,timeout,shell:false,windowsHide:true,
   encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.error||result.status!==0)throw Error('BUNDLED_NPM_FAILED:'+String(result.status??result.error?.code??'UNKNOWN'));
 return result.stdout||'';
}
function passkeyPilotSelection(command,args=[]){
 if(!Array.isArray(args)||args.length>1||args.length===1&&(command!=='start'||args[0]!=='--enable-local-passkey-pilot'))
   throw Error('LOCAL_FEATURE_ARGUMENT_INVALID');
 return command==='start'&&args[0]==='--enable-local-passkey-pilot';
}
function passkeyProbeResult(status,body){
 // Deliberately omit a staff-session token. This distinguishes enabled but
 // protected service (401) from disabled service (404), without logging in.
 if(status!==401||body?.message!=='STAFF_SESSION_REQUIRED')throw Error('LOCAL_PASSKEY_RUNTIME_NOT_VERIFIED');
 return {enabled:true,sessionRequired:true,probe:'authenticated-gateway-without-staff-session'};
}
async function probeLocalPasskey(internalKey,fetchImpl=globalThis.fetch){
 if(typeof internalKey!=='string'||internalKey.length<32)throw Error('LOCAL_SERVICE_KEY_REQUIRED');
 const r=await fetchImpl('http://127.0.0.1:3001/v1/staff-auth/passkey/state',{
   method:'POST',headers:{'content-type':'application/json','x-views-service-id':'local-workspace',
    'x-views-internal-key':internalKey,'x-request-id':randomUUID()},body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)});
 return passkeyProbeResult(r.status,await r.json());
}
module.exports={npmInvocation,runBundledNpm,passkeyPilotSelection,passkeyProbeResult,probeLocalPasskey};
