'use strict';
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const containers=()=>execFileSync('docker',['ps','-aq','--filter','label=views.disposable-core-test=true'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
(async()=>{
 const before=containers();
 const child=spawn(process.execPath,['scripts/cloud-core-tests.cjs','--dev-local'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let output='',ready=false;
 const timeout=setTimeout(()=>child.kill('SIGTERM'),120000);
 child.stdout.on('data',chunk=>{
  output+=chunk.toString();
  if(!ready&&output.includes('"sandboxReady":true')){ready=true;child.kill('SIGTERM');}
 });
 child.stderr.resume();
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 clearTimeout(timeout);assert.equal(code,0);assert.ok(ready,'Sandbox did not become ready');
 for(let i=0;i<50&&JSON.stringify(containers())!==JSON.stringify(before);i++)await new Promise(resolve=>setTimeout(resolve,100));
 assert.deepEqual(containers(),before,'Disposable container leaked');
 console.log('PASS: ready HTTP, unauthenticated denial, SIGTERM cleanup, no container leak');
})().catch(error=>{console.error('DEV_LOCAL_LIFECYCLE_FAILED:'+error.message);process.exitCode=1;});
