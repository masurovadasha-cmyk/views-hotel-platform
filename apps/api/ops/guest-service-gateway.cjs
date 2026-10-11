'use strict';
const {timingSafeEqual}=require('node:crypto');
function same(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function projection(b){
 if(UUID.test(b.reservationId)&&Number.isInteger(b.revision)&&typeof b.consent==='boolean')return {reservationId:b.reservationId,revision:b.revision,consent:b.consent,...(typeof b.preferences==='string'&&b.preferences.length<=500?{preferences:b.preferences}:{}),...(typeof b.idempotentReplay==='boolean'?{idempotentReplay:b.idempotentReplay}:{})};
 const fields=['category','partySize','budgetMinor','responseDueAt','answeredAt','assigned','id','name','currency','priceMinor','revision','durationMinutes','orderId','status','stage','requestedFor','totalMinor','idempotentReplay','feedback','rating','comment','intakeId','declaredCount','preferences','pickupAt','estimateMinor','returnBy','availableQuantity','creditedMinor','replacesOrderId','replacedByOrderId'];
 const pick=v=>{
  const result=Object.fromEntries(fields.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
  if(Object.hasOwn(v,'intakeId')&&Object.hasOwn(v,'items')){
   if(v.items!==null&&(!Array.isArray(v.items)||v.items.length>50))throw Error('INVALID_RESPONSE');
   result.items=v.items===null?null:v.items.map(i=>({tag:i.tag,description:i.description,priceMinor:i.priceMinor}));
  }
  if(Object.hasOwn(v,'lines')){if(!Array.isArray(v.lines)||v.lines.length>20)throw Error('INVALID_RESPONSE');result.lines=v.lines.map(l=>({serviceId:l.serviceId,name:l.name,quantity:l.quantity,priceMinor:l.priceMinor}));}
  if(v.returns){if(!Array.isArray(v.returns)||v.returns.length>20||!Array.isArray(v.returnedByService)||v.returnedByService.length>20)throw Error('INVALID_RESPONSE');result.returns=v.returns.map(r=>({id:r.id,serviceId:r.serviceId,quantity:r.quantity,status:r.status,reason:r.reason,resolutionNote:r.resolutionNote}));result.returnedByService=v.returnedByService.map(r=>({serviceId:r.serviceId,quantity:r.quantity}));}
  if(v.credits){if(!Array.isArray(v.credits)||v.credits.length>20)throw Error('INVALID_RESPONSE');result.credits=v.credits.map(c=>({id:c.id,amountMinor:c.amountMinor,reason:c.reason,createdAt:c.createdAt}));}
  if(v.proposal){const p=v.proposal;if(!Array.isArray(p.lines)||p.lines.length>20)throw Error('INVALID_RESPONSE');result.proposal={status:p.status,note:p.note,totalMinor:p.totalMinor,expiresAt:p.expiresAt,lines:p.lines.map(l=>({serviceId:l.serviceId,name:l.name,quantity:l.quantity,priceMinor:l.priceMinor}))};}
  if(v.messages){if(!Array.isArray(v.messages)||v.messages.length>100)throw Error('INVALID_RESPONSE');result.messages=v.messages.map(m=>({id:m.id,author:m.author,text:m.text,createdAt:m.createdAt}));}
  if(v.claim){const c=v.claim;if(!['open','answered','resolved'].includes(c.status)||!Array.isArray(c.history)||c.history.length>9)throw Error('INVALID_RESPONSE');result.claim={status:c.status,tag:c.tag,kind:c.kind,history:c.history.map(e=>({action:e.action,at:e.at,note:e.note,...(e.tag?{tag:e.tag,kind:e.kind}:{})}))};}
  if(v.issue)result.issue={status:v.issue.status,note:v.issue.note,answer:v.issue.answer};
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
 const u=new URL('/'+route,'http://local'),read=req.method==='GET'&&['/services/catalog','/services/orders','/services/concierge','/services/concierge/preferences','/services/laundry','/services/laundry/catalog','/services/market','/services/market/catalog'].includes(u.pathname);
 const action=u.pathname.match(/^\/services\/orders\/([^/]+)\/(?:actions|feedback)$/);
 const conciergeAction=u.pathname.match(/^\/services\/concierge\/([^/]+)\/actions$/);
 const laundryAction=u.pathname.match(/^\/services\/laundry\/([^/]+)\/actions$/);
 const marketAction=u.pathname.match(/^\/services\/market\/([^/]+)\/actions$/);
 const repeat=req.method==='GET'&&/^\/services\/orders\/[a-f0-9-]{36}\/repeat$/i.test(u.pathname)&&UUID.test(u.pathname.split('/')[3])&&!u.search;
 const write=req.method==='POST'&&(u.pathname==='/services/orders'||u.pathname==='/services/concierge'||u.pathname==='/services/concierge/preferences'||conciergeAction&&UUID.test(conciergeAction[1])||u.pathname==='/services/laundry'||u.pathname==='/services/market'||marketAction&&UUID.test(marketAction[1])||laundryAction&&UUID.test(laundryAction[1])||action&&UUID.test(action[1]))&&!u.search;
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
