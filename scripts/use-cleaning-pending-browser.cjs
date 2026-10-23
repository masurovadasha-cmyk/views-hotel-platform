'use strict';
// Real React hook in Chromium. The transport observes whether its parent guard
// has been notified before the mutation starts; this does not wait away a gap.
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {createServer}=await import('vite'),{chromium}=require('playwright');
 const source=`import React,{useState} from 'react';
 import {createRoot} from 'react-dom/client';
 import {useCleaning} from '/src/features/service-orders/useCleaning.ts';
 window.proof={trace:[],mode:'unknown'};
 function App(){const [blocked,setBlocked]=useState(false);
 const notify=React.useCallback(v=>{window.proof.trace.push(['pending',v]);setBlocked(v);},[]);
 const hook=useCleaning(async a=>{window.proof.trace.push(['send',a.key]);if(window.proof.mode==='unknown')throw Error('NETWORK_FAILED');if(window.proof.mode==='denied')throw Error('SERVICE_SESSION_INVALID');},async()=>{window.proof.trace.push(['refresh']);},notify,()=>window.proof.trace.push(['expired']));
 return <><button id="act" onClick={()=>hook.act({key:'same-key',route:'/synthetic',body:{}})}>Act</button><button id="nav" disabled={blocked}>Navigate</button><span id="pending">{String(!!hook.pending)}</span></>;}
 createRoot(document.getElementById('root')).render(<App/>);`;
 const server=await createServer({configFile:false,esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0},plugins:[{name:'pending-proof',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/__pending-proof.html'){res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/__pending-proof.tsx"></script>');}else next();});},resolveId(id){if(id==='/__pending-proof.tsx')return id;},load(id){if(id==='/__pending-proof.tsx')return source;}}]});let browser;
 try{await server.listen();browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__pending-proof.html');await page.locator('#act').waitFor();
 await page.evaluate(()=>{window.proof.trace=[];});await page.locator('#act').click();let trace=await page.evaluate(()=>window.proof.trace);assert.deepEqual(trace.slice(0,2),[['pending',true],['send','same-key']],'parent must be notified before transport starts');assert.equal(await page.locator('#nav').isDisabled(),true);assert.equal(await page.locator('#pending').textContent(),'true');
 await page.evaluate(()=>{window.proof.trace=[];});await page.locator('#act').click();trace=await page.evaluate(()=>window.proof.trace);assert.deepEqual(trace.slice(0,2),[['pending',true],['send','same-key']]);assert.equal(trace.some(x=>x[0]==='pending'&&x[1]===false),false,'unknown retry must never unlock its parent');assert.equal(await page.locator('#nav').isDisabled(),true);
 await page.evaluate(()=>{window.proof.trace=[];window.proof.mode='success';});await page.locator('#act').click();await page.waitForFunction(()=>document.querySelector('#pending').textContent==='false');trace=await page.evaluate(()=>window.proof.trace);assert.deepEqual(trace.slice(0,2),[['pending',true],['send','same-key']]);assert.ok(trace.some(x=>x[0]==='refresh'));assert.equal(await page.locator('#nav').isDisabled(),false);
 await page.evaluate(()=>{window.proof.mode='denied';});await page.locator('#act').click();await page.waitForFunction(()=>window.proof.trace.some(x=>x[0]==='expired'));assert.equal(await page.locator('#pending').textContent(),'false');
 console.log('useCleaning parent guard before transport; unknown retention; same-key retry; success and session-expiry resolution PASS');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
