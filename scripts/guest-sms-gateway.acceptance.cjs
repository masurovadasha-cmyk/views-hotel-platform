const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const gateway=require('./fixtures/guest-sms-gateway.cjs');
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(r=>{server.close(r);server.closeAllConnections();});
test('SMS gateway requires origin/header/gates and only proxies allowed routes',async()=>{
 const saved={...process.env};Object.assign(process.env,{NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_DEMO_SMS:'true'});
 let calls=0,seen;
 const upstream=http.createServer((req,res)=>{calls++;seen=req.headers;res.setHeader('Content-Type','application/json');res.end('{"items":[],"nextCursor":null}');});
 const core=await listen(upstream),handler=gateway(core),web=http.createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});const origin=await listen(web);
 const send=(route,headers={},body)=>fetch(origin+'/sms-demo-api/'+route,{method:body?'POST':'GET',headers:{...headers},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await send('sms/trips')).status,403);
  const headers={'X-Views-Sms-Demo':'1','Origin':origin,'Content-Type':'application/json'};
  assert.equal((await send('sms/trips',{...headers,Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await send('../v1/payments',headers)).status,404);
  assert.equal(calls,0);
  assert.equal((await send('sms/trips',{...headers,'X-User-Id':'forged'})).status,200);assert.equal(seen['x-user-id'],undefined);
  assert.equal((await send('sms/demo-payment',{'X-Views-Sms-Demo':'1','Content-Type':'application/json'},{reservationId:'id'})).status,403);
  assert.equal((await send('sms/demo-payment',headers,{reservationId:'id'})).status,200);
  const before=calls;process.env.VIEWS_DEMO_SMS='false';assert.equal((await send('sms/trips',headers)).status,404);assert.equal(calls,before);
 }finally{await close(web);await close(upstream);for(const key of ['NODE_ENV','VIEWS_LOCAL_REHEARSAL','VIEWS_DEMO_SMS']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
