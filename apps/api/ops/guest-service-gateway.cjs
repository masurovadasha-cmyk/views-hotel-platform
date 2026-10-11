'use strict';
const {timingSafeEqual}=require('node:crypto');
function same(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function projection(b){
 const fields=['id','name','currency','priceMinor','revision','durationMinutes','orderId','status','stage','requestedFor','totalMinor','idempotentReplay','feedback','rating','comment','intakeId','declaredCount','preferences','pickupAt','estimateMinor','returnBy','availableQuantity'];
 const pick=v=>{
  const result=Object.fromEntries(fields.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
  if(Object.hasOwn(v,'intakeId')&&Object.hasOwn(v,'items')){
   if(v.items!==null&&(!Array.isArray(v.items)||v.items.length>50))throw Error('INVALID_RESPONSE');
   result.items=v.items===null?null:v.items.map(i=>({tag:i.tag,description:i.description,priceMinor:i.priceMinor}));
  }
  if(Object.hasOwn(v,'lines')){if(!Array.isArray(v.lines)||v.lines.length>20)throw Error('INVALID_RESPONSE');result.lines=v.lines.map(l=>({serviceId:l.serviceId,name:l.name,quantity:l.quantity,priceMinor:l.priceMinor}));}
  return result;
 };
 if(!b.intakeId&&Array.isArray(b.items)&&b.items.length<=50&&(b.nextCursor===null||UUID.test(b.nextCursor)))return {items:b.items.map(pick),nextCursor:b.nextCursor};
 if((UUID.test(b.orderId)||UUID.test(b.intakeId))&&Number.isInteger(b.revision)&&typeof b.idempotentReplay==='boolean')return pick(b);
 throw Error('INVALID_RESPONSE');
}
exports.handle=async function({route,req,res,token,csrf,upstream,reply,failed,jsonBody}){
 if(!route.startsWith('services'))return false;
 if(process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED!=='true'){reply(res,404,{error:'SERVICE_ORDERS_DISABLED'});return true;}
 if(route.startsWith('services/market')&&process.env.VIEWS_MARKET_PILOT_ENABLED!=='true'){reply(res,404,{error:'SERVICE_MARKET_DISABLED'});return true;}
 const u=new URL('/'+route,'http://local'),read=req.method==='GET'&&['/services/catalog','/services/orders','/services/laundry','/services/laundry/catalog','/services/market','/services/market/catalog'].includes(u.pathname);
 const action=u.pathname.match(/^\/services\/orders\/([^/]+)\/(?:actions|feedback)$/);
 const laundryAction=u.pathname.match(/^\/services\/laundry\/([^/]+)\/actions$/);
 const marketAction=u.pathname.match(/^\/services\/market\/([^/]+)\/actions$/);
 const repeat=req.method==='GET'&&/^\/services\/orders\/[a-f0-9-]{36}\/repeat$/i.test(u.pathname)&&UUID.test(u.pathname.split('/')[3])&&!u.search;
 const write=req.method==='POST'&&(u.pathname==='/services/orders'||u.pathname==='/services/laundry'||u.pathname==='/services/market'||marketAction&&UUID.test(marketAction[1])||laundryAction&&UUID.test(laundryAction[1])||action&&UUID.test(action[1]))&&!u.search;
 if((!read&&!write&&!repeat)||(read&&(!UUID.test(u.searchParams.get('reservationId')||'')||[...u.searchParams.keys()].some(k=>!['reservationId','cursor'].includes(k)||u.searchParams.getAll(k).length!==1)||(u.searchParams.has('cursor')&&!UUID.test(u.searchParams.get('cursor')))))){reply(res,400,{error:'SERVICE_INPUT_INVALID'});return true;}
 if(!token){reply(res,401,{error:'GUEST_EMAIL_SESSION_INVALID'});return true;}
 let body,key;
 if(write){
  if(!same(req.headers['x-views-guest-csrf'],csrf(token))){reply(res,403,{error:'GUEST_CSRF_REJECTED'});return true;}
  key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key)){reply(res,400,{error:'SERVICE_INPUT_INVALID'});return true;}
  body=await jsonBody(req);
 }
 const result=await upstream(route,body,token,key);
 if(result.status!==200){failed(res,result);return true;}
 reply(res,200,projection(result.body));return true;
};
exports.projection=projection;
