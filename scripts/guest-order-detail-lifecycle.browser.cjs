'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),red=process.env.VIEWS_DETAIL_LIFECYCLE_RED==='true';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',stay='00000000-0000-4000-8000-000000000003';
const rows=[a,b].map(orderId=>({orderId,name:{en:'Synthetic cleaning'},stage:'requested',totalMinor:'123',currency:'UZS',requestedFor:'2026-10-18T12:00:00Z',feedback:null}));
(async()=>{
 let server,browser;const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'views-detail-lifecycle-'));let transformed=false;
 try{
  const {createServer}=await import('vite');
  const html='<div id="root"></div><script type="module" src="/__views_detail_entry__.js"></script>';
  const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{GuestOrderDetail}from'/src/features/guest-auth/GuestOrderDetail.tsx';
const root=createRoot(document.getElementById('root'));window.expired=0;
window.show=(id)=>root.render(React.createElement(React.StrictMode,null,id?React.createElement(GuestOrderDetail,{reservationId:'${stay}',target:{kind:'cleaning',id,cursor:'ffffffff-ffff-4fff-8fff-ffffffffffff'},online:true,blocked:false,onExpired:()=>window.expired++,onBack:()=>{},onService:()=>{}}):null));window.show('${a}');`;
  server=await createServer({root,configFile:false,cacheDir,logLevel:'error',esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{name:'lifecycle-fixture',enforce:'pre',
   resolveId(id){if(id==='/__views_detail_entry__.js')return '\0views-detail-entry';},load(id){if(id==='\0views-detail-entry')return entry;},
   transform(code,id){if(red&&id.endsWith('/GuestOrderDetail.tsx')){const next=code.replace('generation.current++;busy.current=false;};},[reservationId,target]);','generation.current++;};},[reservationId,target]);');assert.notEqual(next,code,'RED_TRANSFORM_NOT_APPLIED');transformed=true;return next;}},
   configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else next();});}
  }]});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
  const page=await browser.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));let reads=0,hold=false,release,seen;
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.route('**/guest-api/services/details/cleaning/*?*',async route=>{assert.equal(route.request().method(),'GET');const url=new URL(route.request().url());assert.equal(url.searchParams.get('reservationId'),stay);assert.equal(url.searchParams.has('cursor'),false);const id=url.pathname.split('/').at(-1);reads++;if(hold){seen?.();await new Promise(resolve=>{release=resolve;});}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({items:rows.filter(row=>row.orderId===id),nextCursor:null})});});
  await page.goto(origin);const selected=id=>page.locator('[data-selected-order="'+id+'"]');
  await selected(a).waitFor({timeout:10000}).catch(()=>{throw Error(red?'EXPECTED_RED_STRICT_MODE_LOAD_STALLED':'STRICT_MODE_LOAD_STALLED:'+errors.join(';'));});
  assert.ok(reads>=2,'STRICT_MODE_DID_NOT_REPLAY_EFFECT');assert.equal(await page.getByTestId('guest-order-detail-refresh').isDisabled(),false);
  async function holdRefresh(){hold=true;let timer;const waiting=new Promise((resolve,reject)=>{seen=resolve;timer=setTimeout(()=>reject(Error('HELD_READ_NOT_STARTED')),5000);});
   try{await Promise.all([page.getByTestId('guest-order-detail-refresh').click(),waiting]);}finally{clearTimeout(timer);hold=false;}}
  async function finishHeld(){const response=page.waitForResponse(r=>r.url().includes('/guest-api/services/details/cleaning/'));release();await(await response).finished();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  await holdRefresh();await page.evaluate(id=>window.show(id),b);await selected(b).waitFor();await finishHeld();assert.equal(await selected(b).count(),1);assert.equal(await selected(a).count(),0);
  await holdRefresh();await page.evaluate(()=>window.show(null));await page.getByTestId('guest-order-detail').waitFor({state:'detached'});
  await page.evaluate(id=>window.show(id),a);await selected(a).waitFor();await finishHeld();assert.equal(await selected(a).count(),1);assert.equal(await selected(b).count(),0);
  assert.equal(await page.evaluate(()=>window.expired),0);assert.deepEqual(errors,[]);assert.equal(transformed,false);
  console.log(JSON.stringify({proof:'guest_order_detail_strictmode_lifecycle',result:'pass',checks:['stale_source_cursor_does_not_affect_detail','strict_effect_replay','target_change_discards_late_read','unmount_remount_discards_late_read'],reads,externalNetwork:false}));
 }finally{await Promise.allSettled([browser?.close(),server?.close()]);fs.rmSync(cacheDir,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
