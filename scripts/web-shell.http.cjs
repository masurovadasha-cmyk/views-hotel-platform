'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {createRequire}=require('node:module');
(async()=>{
 const root=path.resolve(__dirname,'../apps/web'),requireWeb=createRequire(path.join(root,'package.json'));
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,[requireWeb.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
 const exited=new Promise(resolve=>child.once('exit',resolve));child.on('error',()=>{});
 try{
  const origin='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/en/guest',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Next server did not become ready');
  for(const locale of ['ru','uz','en'])for(const direction of ['guest','host']){
   const response=await fetch(origin+'/'+locale+'/'+direction),html=await response.text();
   assert.equal(response.status,200);assert.equal(response.headers.get('x-powered-by'),null);
   assert.match(html,/noindex,nofollow/);assert.match(html,new RegExp('lang="'+locale+'"'));
   assert.match(html,/<h1>[^<]+<\/h1>/);assert.match(html,/role="status"/);
   assert.ok(html.includes('href="/'+locale+'/'+(direction==='guest'?'host':'guest')+'"'));
  }
  for(const route of ['/xx/guest','/ru/admin','/constructor/guest'])assert.equal((await fetch(origin+route)).status,404);
  const redirect=await fetch(origin,{redirect:'manual'});assert.equal(redirect.status,307);assert.equal(redirect.headers.get('location'),'/ru/guest');
  console.log('Next shell PASS: six SSR routes, three invalid routes404, root redirect, noindex and localized navigation');
 }finally{child.kill('SIGTERM');await exited;}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
