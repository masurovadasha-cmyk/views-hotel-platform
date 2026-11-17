'use strict';
module.exports=function(coreOrigin){
 const core=new URL(coreOrigin);if(core.origin!==coreOrigin||core.hostname!=='127.0.0.1'||core.protocol!=='http:')throw Error('LOOPBACK_REQUIRED');
 let inFlight=0;
 return async function(req,res){
  if(!req.url?.startsWith('/sms-demo-api/'))return false;
  const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_DEMO_SMS!=='true'){reply(404,{message:'DEMO_DISABLED'});return true;}
  const origin='http://127.0.0.1:'+req.socket.localPort;
  if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers['x-views-sms-demo']!=='1'||(req.headers.origin&&req.headers.origin!==origin)||(req.method!=='GET'&&req.headers.origin!==origin)){
   reply(403,{message:'ORIGIN_REJECTED'});return true;
  }
  const route=req.url.slice('/sms-demo-api/'.length);
  if(!((req.method==='GET'&&(/^(?:sms\/trips(?:\?cursor=[A-Za-z0-9_-]{1,300})?|sms\/quotes\/[a-f0-9-]{36})$/i.test(route)))||(req.method==='POST'&&['sms','verify','logout','sms/demo-payment','sms/holds'].includes(route)))){reply(404,{message:'ROUTE_NOT_FOUND'});return true;}
  if(inFlight>=8){reply(503,{message:'DEMO_BUSY'});return true;}
  inFlight++;
  try{
   let body;
   if(req.method==='POST'){
    if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])throw Error('BODY_INVALID');
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('BODY_INVALID');chunks.push(chunk);}
    body=JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   }
   const auth=req.headers.authorization;
   if(auth!==undefined&&!/^Bearer vgs_[A-Za-z0-9_-]{43}$/.test(auth))throw Error('BODY_INVALID');
   const key=req.headers['idempotency-key'];
   if(route==='sms/holds'&&(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)))throw Error('BODY_INVALID');
   const upstream=await fetch(coreOrigin+'/v1/guest-identity/'+route,{method:req.method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...(route==='sms/holds'?{'Idempotency-Key':key}:{})},body,redirect:'error',signal:AbortSignal.timeout(10000)});
   const chunks=[];let size=0;for await(const chunk of upstream.body){size+=chunk.length;if(size>131072)throw Error('UPSTREAM_INVALID');chunks.push(chunk);}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   reply(upstream.status,upstream.ok?result:{message:typeof result.message==='string'&&/^[A-Z_]+$/.test(result.message)?result.message:'DEMO_REQUEST_FAILED'});
  }catch(e){reply(e.message==='BODY_INVALID'?400:502,{message:e.message==='BODY_INVALID'?'INVALID_REQUEST':'DEMO_CONNECTION_FAILED'});}
  finally{inFlight--;}
  return true;
 };
};
